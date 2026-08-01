"""Create, resend, delete, and accept driver login invites (48h TTL)."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from models.invites import DriverInvite, INVITE_TTL_HOURS
from models.enums import UserRole
from auth_service import get_password_hash
from country_utils import normalize_country_code


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def invite_effective_status(invite: dict) -> str:
    status = invite.get("status") or "PENDING"
    if status == "PENDING":
        expires = _parse_dt(invite.get("expires_at"))
        if expires and expires < _utcnow():
            return "EXPIRED"
    return status


def _serialize_invite(invite: dict) -> dict:
    out = {k: v for k, v in invite.items() if k not in ("token", "_id")}
    for field in ("expires_at", "created_at", "resent_at", "accepted_at"):
        val = out.get(field)
        if isinstance(val, datetime):
            out[field] = val.isoformat()
        elif val is not None and not isinstance(val, str):
            out[field] = str(val)
    out["status"] = invite_effective_status(invite)
    out["expires_in_hours"] = INVITE_TTL_HOURS
    return out


async def list_driver_invites(db, country: Optional[str] = None) -> List[dict]:
    invites = await db.driver_invites.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    if country:
        try:
            code = normalize_country_code(country)
        except Exception:
            code = country
        drivers = await db.drivers.find({}, {"_id": 0, "id": 1, "country": 1}).to_list(5000)
        allowed = {
            d["id"]
            for d in drivers
            if normalize_country_code(d.get("country") or "") == code
        }
        invites = [i for i in invites if i.get("driver_id") in allowed]

    driver_ids = list({i.get("driver_id") for i in invites if i.get("driver_id")})
    drivers = await db.drivers.find({"id": {"$in": driver_ids}}, {"_id": 0}).to_list(len(driver_ids) or 1)
    by_id = {d["id"]: d for d in drivers}

    rows = []
    for inv in invites:
        row = _serialize_invite(inv)
        d = by_id.get(inv.get("driver_id")) or {}
        row["driver_name"] = f"{d.get('first_name', '')} {d.get('last_name', '')}".strip() or None
        row["driver_country"] = d.get("country")
        rows.append(row)
    return rows


async def create_or_refresh_invite(
    db,
    driver_id: str,
    actor: dict,
) -> Dict[str, Any]:
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not driver:
        raise ValueError("Driver not found")
    email = (driver.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise ValueError("Driver must have a valid email before inviting")

    # Already has an active linked login that has been used?
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user and existing_user.get("last_login") and existing_user.get("is_active", True):
        raise ValueError("This email already belongs to an active login account")
    if (
        existing_user
        and existing_user.get("is_active", True)
        and existing_user.get("is_approved", False)
        and not existing_user.get("invite_pending")
        and existing_user.get("role") == UserRole.DRIVER.value
    ):
        # Active driver account that finished onboarding
        raise ValueError("This driver already has an active login account")

    now = _utcnow()
    expires_at = now + timedelta(hours=INVITE_TTL_HOURS)
    token = secrets.token_urlsafe(32)

    user = existing_user
    if not user:
        user_id = str(__import__("uuid").uuid4())
        user_doc = {
            "id": user_id,
            "email": email,
            "hashed_password": get_password_hash(secrets.token_urlsafe(24)),
            "full_name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip() or email,
            "role": UserRole.DRIVER.value,
            "country": normalize_country_code(driver.get("country") or "GH"),
            "is_active": False,
            "is_approved": True,
            "approved_by": actor.get("id"),
            "approved_at": now.isoformat(),
            "driver_id": driver_id,
            "token_version": 0,
            "created_at": now.isoformat(),
            "last_login": None,
            "invite_pending": True,
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    else:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "driver_id": driver_id,
                "role": UserRole.DRIVER.value,
                "is_approved": True,
                "is_active": False,
                "invite_pending": True,
            }},
        )
        user = await db.users.find_one({"id": user["id"]}, {"_id": 0})

    # Revoke other pending invites for this driver
    await db.driver_invites.update_many(
        {"driver_id": driver_id, "status": "PENDING"},
        {"$set": {"status": "REVOKED"}},
    )

    invite = DriverInvite(
        driver_id=driver_id,
        user_id=user["id"],
        email=email,
        token=token,
        status="PENDING",
        invited_by=actor.get("id"),
        invited_by_name=actor.get("full_name"),
        expires_at=expires_at,
    )
    doc = invite.model_dump()
    for field in ("expires_at", "created_at", "resent_at", "accepted_at"):
        if isinstance(doc.get(field), datetime):
            doc[field] = doc[field].isoformat()
    await db.driver_invites.insert_one(doc)
    # insert_one mutates doc with Mongo ObjectId _id — strip before response
    doc.pop("_id", None)

    return {
        "invite": _serialize_invite(doc),
        "token": token,
        "email": email,
        "driver_name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip(),
        "expires_at": expires_at.isoformat(),
    }


async def resend_invite(db, invite_id: str, actor: dict) -> Dict[str, Any]:
    invite = await db.driver_invites.find_one({"id": invite_id}, {"_id": 0})
    if not invite:
        raise ValueError("Invite not found")
    if invite.get("status") == "ACCEPTED":
        raise ValueError("Invite was already accepted")
    if invite.get("status") == "REVOKED":
        return await create_or_refresh_invite(db, invite["driver_id"], actor)

    now = _utcnow()
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(hours=INVITE_TTL_HOURS)
    await db.driver_invites.update_one(
        {"id": invite_id},
        {"$set": {
            "token": token,
            "status": "PENDING",
            "expires_at": expires_at.isoformat(),
            "resent_at": now.isoformat(),
            "invited_by": actor.get("id"),
            "invited_by_name": actor.get("full_name"),
        }},
    )
    await db.users.update_one(
        {"id": invite["user_id"]},
        {"$set": {
            "invite_pending": True,
            "is_approved": True,
            "is_active": False,
            "driver_id": invite["driver_id"],
        }},
    )
    driver = await db.drivers.find_one({"id": invite["driver_id"]}, {"_id": 0}) or {}
    updated = await db.driver_invites.find_one({"id": invite_id}, {"_id": 0})
    return {
        "invite": _serialize_invite(updated),
        "token": token,
        "email": invite.get("email"),
        "driver_name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip(),
        "expires_at": expires_at.isoformat(),
    }


async def delete_invite(db, invite_id: str) -> dict:
    invite = await db.driver_invites.find_one({"id": invite_id}, {"_id": 0})
    if not invite:
        raise ValueError("Invite not found")
    if invite.get("status") == "ACCEPTED":
        raise ValueError("Cannot delete an accepted invite")

    await db.driver_invites.delete_one({"id": invite_id})

    user = await db.users.find_one({"id": invite.get("user_id")}, {"_id": 0})
    if user and not user.get("last_login") and (
        user.get("invite_pending") or user.get("is_active") is False
    ):
        await db.users.delete_one({"id": user["id"]})

    return {"status": "deleted", "id": invite_id}


async def verify_invite_token(db, token: str) -> dict:
    invite = await db.driver_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        return {"valid": False, "detail": "Invalid invite link"}
    status = invite_effective_status(invite)
    if status == "ACCEPTED":
        return {"valid": False, "detail": "Invite already used"}
    if status == "REVOKED":
        return {"valid": False, "detail": "Invite was cancelled"}
    if status == "EXPIRED":
        return {"valid": False, "detail": "Invite expired", "expired": True, "email": invite.get("email")}
    driver = await db.drivers.find_one({"id": invite["driver_id"]}, {"_id": 0}) or {}
    return {
        "valid": True,
        "email": invite.get("email"),
        "driver_name": f"{driver.get('first_name', '')} {driver.get('last_name', '')}".strip(),
        "expires_at": invite.get("expires_at"),
    }


async def accept_invite(db, token: str, new_password: str) -> dict:
    invite = await db.driver_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise ValueError("Invalid invite link")
    status = invite_effective_status(invite)
    if status == "EXPIRED":
        raise ValueError("This invite has expired. Ask an administrator to resend it.")
    if status != "PENDING":
        raise ValueError("This invite is no longer valid")

    user = await db.users.find_one({"id": invite["user_id"]}, {"_id": 0})
    if not user:
        raise ValueError("Invite account not found")

    now = _utcnow()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "hashed_password": get_password_hash(new_password),
            "is_active": True,
            "is_approved": True,
            "invite_pending": False,
            "driver_id": invite["driver_id"],
            "token_version": int(user.get("token_version", 0)) + 1,
        }},
    )
    await db.driver_invites.update_one(
        {"id": invite["id"]},
        {"$set": {"status": "ACCEPTED", "accepted_at": now.isoformat()}},
    )
    # Invalidate any other pending invites for same driver
    await db.driver_invites.update_many(
        {"driver_id": invite["driver_id"], "status": "PENDING", "id": {"$ne": invite["id"]}},
        {"$set": {"status": "REVOKED"}},
    )
    return {
        "status": "success",
        "email": user.get("email"),
        "message": "Password set. You can log in now.",
    }


async def invite_status_by_driver(db, driver_ids: List[str]) -> Dict[str, dict]:
    if not driver_ids:
        return {}
    invites = await db.driver_invites.find(
        {"driver_id": {"$in": driver_ids}},
        {"_id": 0},
    ).sort("created_at", -1).to_list(2000)
    latest: Dict[str, dict] = {}
    for inv in invites:
        did = inv.get("driver_id")
        if did in latest:
            continue
        latest[did] = _serialize_invite(inv)
    return latest

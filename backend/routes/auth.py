"""Auth routes"""
import os
import random
import secrets
from fastapi import APIRouter, HTTPException, Depends, Body
from datetime import datetime, timezone, timedelta

from database import db
from models import (
    User, UserSelfRegister, UserLogin, UserUpdate, Token,
    UserRole, ForgotPasswordRequest, ResetPasswordRequest, PasswordResetToken,
)
from auth_service import (
    access_token_payload_from_user_record,
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    require_group_manager,
)
import email_service

router = APIRouter()


@router.post("/auth/register", status_code=201)
async def register_user(input: UserSelfRegister):
    existing = await db.users.find_one({"email": input.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=input.email,
        hashed_password=get_password_hash(input.password),
        full_name=input.full_name,
        role=input.role,
        country=input.country,
        driver_id=input.driver_id,
        is_approved=False,
    )
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc.get("last_login"):
        doc["last_login"] = doc["last_login"].isoformat()
    await db.users.insert_one(doc)
    return {
        "status": "pending_approval",
        "message": "Registration successful. A fleet manager must approve your account before you can log in.",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "country": user.country if user.country else None,
            "is_approved": False,
        },
    }


@router.post("/auth/login")
async def login(input: UserLogin):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(input.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get('is_active', True):
        raise HTTPException(status_code=403, detail="Account is deactivated")
    if user.get("role") != "GROUP_FLEET_MANAGER" and not user.get("is_approved", False):
        raise HTTPException(status_code=403, detail="Account pending approval by Group Fleet Manager")
    if user['role'] == 'GROUP_FLEET_MANAGER':
        return {"requires_otp": True, "email": user['email'], "message": "OTP verification required for Group Fleet Manager login"}
    await db.users.update_one({"id": user['id']}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    access_token = create_access_token(data=access_token_payload_from_user_record(user))
    return Token(access_token=access_token, token_type="bearer", user={"id": user['id'], "email": user['email'], "full_name": user['full_name'], "role": user['role'], "country": user.get('country'), "is_approved": user.get('is_approved', False)})


@router.post("/auth/send-otp")
async def send_otp(input: UserLogin):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(input.password, user['hashed_password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user['role'] != 'GROUP_FLEET_MANAGER':
        raise HTTPException(status_code=400, detail="OTP verification only required for Group Fleet Manager")
    otp_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    await db.otp_codes.update_one(
        {"email": input.email},
        {"$set": {"email": input.email, "otp": otp_code, "expires_at": otp_expiry.isoformat(), "created_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    email_service.send_otp_email(user['email'], user['full_name'], otp_code)
    return {"message": "OTP sent to your email", "email": user['email']}


@router.post("/auth/verify-otp")
async def verify_otp(email: str = Body(...), otp: str = Body(...)):
    otp_record = await db.otp_codes.find_one({"email": email}, {"_id": 0})
    if not otp_record:
        raise HTTPException(status_code=400, detail="No OTP found. Please request a new one.")
    expiry = datetime.fromisoformat(otp_record['expires_at'])
    if datetime.now(timezone.utc) > expiry:
        await db.otp_codes.delete_one({"email": email})
        raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
    if otp_record['otp'] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    await db.otp_codes.delete_one({"email": email})
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    await db.users.update_one({"id": user['id']}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    access_token = create_access_token(data=access_token_payload_from_user_record(user))
    return Token(access_token=access_token, token_type="bearer", user={"id": user['id'], "email": user['email'], "full_name": user['full_name'], "role": user['role'], "country": user.get('country'), "is_approved": user.get('is_approved', False)})


@router.get("/auth/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/auth/users")
async def get_all_users(current_user: dict = Depends(require_group_manager())):
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0}).to_list(1000)
    for u in users:
        for field in ['created_at', 'last_login']:
            if isinstance(u.get(field), str):
                u[field] = datetime.fromisoformat(u[field])
    return users


@router.put("/auth/users/{user_id}/approve")
async def approve_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user_to_approve = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user_to_approve:
        raise HTTPException(status_code=404, detail="User not found")
    approver_role = current_user.get('role')
    approver_country = current_user.get('country')
    user_role = user_to_approve.get('role')
    user_country = user_to_approve.get('country')
    can_approve = False
    if approver_role == 'GROUP_FLEET_MANAGER':
        can_approve = True
    elif approver_role == 'FLEET_MANAGER':
        if user_role in ['FLEET_OFFICER', 'DRIVER', 'USER'] and user_country == approver_country:
            can_approve = True
    elif approver_role == 'FLEET_OFFICER':
        if user_role in ['DRIVER', 'USER'] and user_country == approver_country:
            can_approve = True
    if not can_approve:
        raise HTTPException(status_code=403, detail=f"You don't have permission to approve {user_role.replace('_', ' ').title()} accounts")
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_approved": True, "approved_by": current_user.get('id')}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "message": f"User approved by {current_user.get('full_name')}"}


@router.get("/auth/users/pending")
async def get_pending_users(current_user: dict = Depends(get_current_user)):
    approver_role = current_user.get('role')
    approver_country = current_user.get('country')
    query = {"is_approved": False}
    if approver_role == 'GROUP_FLEET_MANAGER':
        pass
    elif approver_role == 'FLEET_MANAGER':
        query['country'] = approver_country
        query['role'] = {"$in": ['FLEET_OFFICER', 'DRIVER', 'USER']}
    elif approver_role == 'FLEET_OFFICER':
        query['country'] = approver_country
        query['role'] = {"$in": ['DRIVER', 'USER']}
    else:
        return []
    users = await db.users.find(query, {"_id": 0, "hashed_password": 0}).to_list(100)
    return users


@router.put("/auth/users/{user_id}")
async def update_user(user_id: str, input: UserUpdate, current_user: dict = Depends(require_group_manager())):
    update_data = {k: v for k, v in input.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "message": "User updated"}


@router.post("/auth/forgot-password")
async def forgot_password(input: ForgotPasswordRequest):
    user = await db.users.find_one({"email": input.email}, {"_id": 0})
    if not user:
        return {"status": "success", "message": "If an account with that email exists, a reset link will be sent."}
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    token_doc = PasswordResetToken(user_id=user['id'], token=reset_token, email=input.email, expires_at=expires_at)
    doc = token_doc.model_dump()
    doc['expires_at'] = doc['expires_at'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.password_reset_tokens.insert_one(doc)
    reset_link = f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/reset-password?token={reset_token}"
    email_service.send_password_reset_email(input.email, reset_link, user.get('full_name', 'User'))
    return {"status": "success", "message": "If an account with that email exists, a reset link will be sent."}


@router.post("/auth/reset-password")
async def reset_password(input: ResetPasswordRequest):
    token_doc = await db.password_reset_tokens.find_one({"token": input.token, "used": False}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    expires_at = token_doc.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")
    hashed_password = get_password_hash(input.new_password)
    current = await db.users.find_one(
        {"id": token_doc['user_id']},
        {"_id": 0, "token_version": 1},
    )
    next_tv = int(current.get("token_version", 0)) + 1 if current else 1
    result = await db.users.update_one(
        {"id": token_doc['user_id']},
        {"$set": {"hashed_password": hashed_password, "token_version": next_tv}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.password_reset_tokens.update_one({"token": input.token}, {"$set": {"used": True}})
    return {"status": "success", "message": "Password reset successfully"}


@router.get("/auth/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    token_doc = await db.password_reset_tokens.find_one({"token": token, "used": False}, {"_id": 0})
    if not token_doc:
        return {"valid": False, "message": "Invalid reset token"}
    expires_at = token_doc.get('expires_at')
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    if expires_at < datetime.now(timezone.utc):
        return {"valid": False, "message": "Reset token has expired"}
    return {"valid": True, "email": token_doc.get('email')}

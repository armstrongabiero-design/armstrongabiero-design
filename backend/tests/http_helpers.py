"""Shared HTTP helpers for integration tests (JWT middleware + bootstrap)."""
from __future__ import annotations

import os
import uuid
from typing import Optional, Tuple

import requests


def get_backend_base_url() -> str:
    return (
        os.environ.get("REACT_APP_BACKEND_URL")
        or os.environ.get("BACKEND_URL")
        or ""
    ).rstrip("/")


def get_bootstrap_token() -> str:
    return (
        os.environ.get("BOOTSTRAP_TOKEN") or os.environ.get("TEST_BOOTSTRAP_TOKEN") or ""
    ).strip()


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def login_access_token(api: str, email: str, password: str, timeout: int = 30) -> Optional[str]:
    """Return access_token string, or None if login fails or GFM OTP is required."""
    r = requests.post(
        f"{api}/auth/login", json={"email": email, "password": password}, timeout=timeout
    )
    if r.status_code != 200:
        return None
    data = r.json()
    if data.get("requires_otp"):
        return None
    return data.get("access_token")


def bootstrap_gfm_token(
    api: str,
    *,
    email: str,
    password: str,
    full_name: str,
    bootstrap_token: str,
    timeout: int = 30,
) -> Optional[str]:
    r = requests.post(
        f"{api}/auth/bootstrap",
        json={"email": email, "password": password, "full_name": full_name},
        headers={"X-Bootstrap-Token": bootstrap_token},
        timeout=timeout,
    )
    if r.status_code != 200:
        return None
    return r.json().get("access_token")


def obtain_staff_bearer_token(api: str) -> Tuple[Optional[str], str]:
    """
    Resolve a Group Fleet Manager (or equivalent staff) JWT.
    Order: env admin/manager login, then one-time bootstrap if BOOTSTRAP_TOKEN is set.
    """
    admin_email = os.environ.get("TEST_ADMIN_EMAIL") or os.environ.get(
        "TEST_GROUP_MANAGER_EMAIL"
    )
    admin_password = os.environ.get("TEST_ADMIN_PASSWORD") or os.environ.get(
        "TEST_GROUP_MANAGER_PASSWORD"
    )
    if admin_email and admin_password:
        tok = login_access_token(api, admin_email, admin_password)
        if tok:
            return tok, "login"

    bt = get_bootstrap_token()
    if bt:
        email = f"pytest_gfm_{uuid.uuid4().hex[:10]}@integration.test"
        password = "IntegrationTestPass123!"
        tok = bootstrap_gfm_token(
            api,
            email=email,
            password=password,
            full_name="Pytest GFM",
            bootstrap_token=bt,
        )
        if tok:
            return tok, "bootstrap"

    return (
        None,
        "Provide TEST_ADMIN_EMAIL+TEST_ADMIN_PASSWORD (or TEST_GROUP_MANAGER_*) and ensure "
        "GFM login does not require OTP in this environment, or set BOOTSTRAP_TOKEN for an empty DB.",
    )


def register_self_service(
    api: str,
    *,
    email: str,
    password: str,
    full_name: str,
    role: str = "USER",
    country: str = "Ghana",
    timeout: int = 30,
) -> requests.Response:
    return requests.post(
        f"{api}/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": full_name,
            "role": role,
            "country": country,
        },
        timeout=timeout,
    )


def approve_user(api: str, staff_token: str, user_id: str, timeout: int = 30) -> requests.Response:
    return requests.put(
        f"{api}/auth/users/{user_id}/approve",
        headers=auth_headers(staff_token),
        timeout=timeout,
    )

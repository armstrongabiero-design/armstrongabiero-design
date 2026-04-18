"""Pytest configuration for all integration tests under this repository."""
from __future__ import annotations

import sys
from pathlib import Path

# Allow `from tests.http_helpers import ...` (backend/tests is the `tests` package)
_BACKEND_DIR = Path(__file__).resolve().parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import pytest
import requests

from tests.http_helpers import get_backend_base_url, obtain_staff_bearer_token


@pytest.fixture(scope="session")
def backend_base_url():
    url = get_backend_base_url()
    if not url:
        pytest.skip(
            "Set REACT_APP_BACKEND_URL or BACKEND_URL to run integration tests against a live API."
        )
    return url


@pytest.fixture(scope="session")
def api_url(backend_base_url):
    return f"{backend_base_url}/api"


@pytest.fixture(scope="session")
def staff_bearer_token(api_url):
    token, reason = obtain_staff_bearer_token(api_url)
    if not token:
        pytest.skip(reason)
    return token


@pytest.fixture(scope="session")
def backend_health(backend_base_url):
    try:
        r = requests.get(f"{backend_base_url}/health", timeout=10)
    except requests.RequestException as exc:
        pytest.skip(f"Backend not reachable at {backend_base_url}: {exc}")
    if r.status_code != 200:
        pytest.skip(f"GET /health returned {r.status_code}")
    return r.json()

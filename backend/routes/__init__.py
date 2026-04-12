"""Routes package - collects all routers"""
from fastapi import APIRouter

from .countries import router as countries_router
from .vehicles import router as vehicles_router
from .drivers import router as drivers_router
from .dashboard import router as dashboard_router
from .maintenance import router as maintenance_router
from .pretrip import router as pretrip_router
from .auth import router as auth_router
from .operations import router as operations_router
from .reports import router as reports_router

api_router = APIRouter(prefix="/api")

api_router.include_router(dashboard_router)
api_router.include_router(countries_router)
api_router.include_router(vehicles_router)
api_router.include_router(drivers_router)
api_router.include_router(maintenance_router)
api_router.include_router(pretrip_router)
api_router.include_router(auth_router)
api_router.include_router(operations_router)
api_router.include_router(reports_router)

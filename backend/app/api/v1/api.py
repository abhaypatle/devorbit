from fastapi import APIRouter

from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.client import router as client_router
from app.api.v1.endpoints.developer import router as developer_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(client_router, prefix="/client", tags=["client"])
router.include_router(developer_router, prefix="/developer", tags=["developer"])
router.include_router(admin_router, prefix="/admin", tags=["admin"])

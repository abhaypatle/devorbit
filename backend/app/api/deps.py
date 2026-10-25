from fastapi import HTTPException, status
from fastapi.params import Depends

from app.core.security import get_current_user
from app.models.user import User


async def require_roles(*allowed_roles: str):
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource.",
            )
        return current_user

    return dependency


require_client = require_roles("CLIENT")
require_developer = require_roles("DEVELOPER")
require_admin = require_roles("ADMIN")

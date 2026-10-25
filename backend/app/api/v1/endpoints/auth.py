from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_current_user, get_password_hash, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import AuthToken, UserCreate, UserLogin, UserRead

router = APIRouter()


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register_user(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    if payload.role == "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin accounts cannot be created through public registration")

    existing = await db.execute(select(User).where((User.email == str(payload.email)) | (User.phone_number == payload.phone_number)))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User with this email or phone number already exists")

    user = User(
        full_name=payload.full_name,
        email=str(payload.email),
        phone_number=payload.phone_number,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        skills=payload.skills,
        experience=payload.experience,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=AuthToken)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)) -> dict:
    result = await db.execute(select(User).where(User.email == str(payload.email)))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    token = create_access_token(subject=user.id, role=user.role.value)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserRead.model_validate(user),
    }


@router.get("/me", response_model=UserRead)
async def get_current_profile(current_user: User = Depends(get_current_user)) -> User:
    return current_user

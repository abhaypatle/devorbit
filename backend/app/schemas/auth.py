from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    phone_number: str = Field(..., min_length=8, max_length=20)
    password: str = Field(..., min_length=8, max_length=128)
    role: str = "CLIENT"
    skills: list[str] = Field(default_factory=list)
    experience: str = "BEGINNER"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    full_name: str
    email: EmailStr
    phone_number: str
    role: str
    skills: list[str] = Field(default_factory=list)
    experience: str
    rating: float
    wallet_balance: float
    created_at: datetime | None = None


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead | None = None

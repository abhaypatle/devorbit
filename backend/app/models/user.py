from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Role(str, Enum):
    CLIENT = "CLIENT"
    DEVELOPER = "DEVELOPER"
    ADMIN = "ADMIN"


class ExperienceLevel(str, Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    EXPERT = "EXPERT"


class ProjectStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    ESTIMATED = "ESTIMATED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    COMPLETED = "COMPLETED"
    MAINTENANCE = "MAINTENANCE"


class MilestoneStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    AWAITING_ESCROW = "AWAITING_ESCROW"
    ESCROW_LOCKED = "ESCROW_LOCKED"
    SUBMITTED = "SUBMITTED"
    REVIEW = "REVIEW"
    APPROVED = "APPROVED"
    PAID = "PAID"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(default=Role.CLIENT, nullable=False)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=True)
    experience: Mapped[ExperienceLevel] = mapped_column(default=ExperienceLevel.BEGINNER, nullable=False)
    rating: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    wallet_balance: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    client_projects: Mapped[list["Project"]] = relationship(back_populates="client", foreign_keys="Project.client_id")
    assigned_projects: Mapped[list["Project"]] = relationship(back_populates="assigned_developer", foreign_keys="Project.assigned_developer_id")
    maintenance_subscriptions: Mapped[list["MaintenanceSubscription"]] = relationship(back_populates="client")

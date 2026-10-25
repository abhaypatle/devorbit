from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    assigned_developer_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    business_category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    design_preferences: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(default="DRAFT", nullable=False)
    client_budget: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    developer_payout: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    monthly_maintenance_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.00, nullable=False)
    staging_preview_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_watermarked: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    client: Mapped["User"] = relationship(back_populates="client_projects", foreign_keys=[client_id])
    assigned_developer: Mapped["User | None"] = relationship(back_populates="assigned_projects", foreign_keys=[assigned_developer_id])
    milestones: Mapped[list["ProjectMilestone"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    change_requests: Mapped[list["ProjectChangeRequest"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    maintenance_subscriptions: Mapped[list["MaintenanceSubscription"]] = relationship(back_populates="project")
    messages: Mapped[list["ProjectMessage"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    pinpoint_notes: Mapped[list["ProjectPinpointNote"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    payout_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(default="PENDING", nullable=False)
    due_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_urls: Mapped[list[str] | None] = mapped_column(JSON, default=list, nullable=True)
    staging_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_review: Mapped[str | None] = mapped_column(Text, nullable=True)
    sla_hours: Mapped[int] = mapped_column(Integer, default=72, nullable=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escrow_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sla_breach_penalized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project: Mapped[Project] = relationship(back_populates="milestones")


class ProjectChangeRequest(Base):
    __tablename__ = "project_change_requests"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    change_description: Mapped[str] = mapped_column(Text, nullable=False)
    extra_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    extra_developer_payout: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    timeline_extension_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    is_approved_by_client: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_paid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    project: Mapped[Project] = relationship(back_populates="change_requests")


class ProjectMessage(Base):
    __tablename__ = "project_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(150), nullable=False)
    sender_role: Mapped[str] = mapped_column(String(20), nullable=False)
    message_text: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    project: Mapped[Project] = relationship(back_populates="messages")
    sender: Mapped["User"] = relationship()


class ProjectPinpointNote(Base):
    __tablename__ = "project_pinpoint_notes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    x_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    y_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    element_label: Mapped[str] = mapped_column(String(200), nullable=False)
    feedback_note: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    project: Mapped[Project] = relationship(back_populates="pinpoint_notes")
    created_by: Mapped["User"] = relationship()


class MaintenanceSubscription(Base):
    __tablename__ = "maintenance_subscriptions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    client_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    monthly_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    next_billing_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_debit_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    billing_status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)

    project: Mapped[Project] = relationship(back_populates="maintenance_subscriptions")
    client: Mapped["User"] = relationship(back_populates="maintenance_subscriptions")

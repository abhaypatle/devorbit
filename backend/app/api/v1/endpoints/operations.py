from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user, require_roles
from app.db.session import get_db
from app.models.project import (
    MaintenanceSubscription,
    Project,
    ProjectMilestone,
    ProjectPinpointNote,
)
from app.models.user import User
from app.schemas.project import PinpointNoteCreate, PinpointNoteRead

router = APIRouter()


class PinpointNoteStatus(BaseModel):
    status: str


@router.get("/projects/{project_id}/deliverables")
async def project_deliverables(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role.value != "ADMIN" and current_user.id not in (
        project.client_id,
        project.assigned_developer_id,
    ):
        raise HTTPException(status_code=403, detail="Project participation required")

    milestone_result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.project_id == project.id)
    )
    milestones = list(milestone_result.scalars().all())
    if project.status != "COMPLETED" or not milestones or any(
        milestone.status != "PAID" for milestone in milestones
    ):
        raise HTTPException(status_code=403, detail="Deliverables unlock after all milestones are paid.")
    return {
        "project_id": project.id,
        "source_repositories": [m.github_url for m in milestones if m.github_url],
        "deployment_secrets": [],
        "secrets_note": "No deployment secrets are stored in DevOrbit.",
    }


@router.post(
    "/client/projects/{project_id}/pinpoint-notes",
    response_model=PinpointNoteRead,
    status_code=201,
)
async def create_pinpoint_note(
    project_id: str,
    payload: PinpointNoteCreate,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> ProjectPinpointNote:
    project = await db.get(Project, project_id)
    if project is None or project.client_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status not in ("IN_PROGRESS", "REVIEW", "CHANGE_REQUEST"):
        raise HTTPException(status_code=409, detail="Pinpoint feedback is only available during active work.")
    note = ProjectPinpointNote(
        project_id=project.id,
        created_by_id=current_user.id,
        x_percent=payload.x_percent,
        y_percent=payload.y_percent,
        element_label=payload.element_label,
        feedback_note=payload.feedback_note,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.get("/projects/{project_id}/pinpoint-notes", response_model=list[PinpointNoteRead])
async def list_pinpoint_notes(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectPinpointNote]:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role.value != "ADMIN" and current_user.id not in (
        project.client_id,
        project.assigned_developer_id,
    ):
        raise HTTPException(status_code=403, detail="Project participation required")
    result = await db.execute(
        select(ProjectPinpointNote)
        .where(ProjectPinpointNote.project_id == project_id)
        .order_by(ProjectPinpointNote.created_at.desc())
    )
    return list(result.scalars().all())


@router.patch("/developer/pinpoint-notes/{note_id}")
async def update_pinpoint_note_status(
    note_id: str,
    payload: PinpointNoteStatus,
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    if payload.status not in ("PENDING", "RESOLVED"):
        raise HTTPException(status_code=422, detail="Status must be PENDING or RESOLVED.")
    note = await db.get(ProjectPinpointNote, note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Pinpoint note not found")
    project = await db.get(Project, note.project_id)
    if project is None or project.assigned_developer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Note is not assigned to you.")
    note.status = payload.status
    await db.commit()
    return {"id": note.id, "status": note.status}


@router.post("/milestones/{milestone_id}/lock-escrow")
async def lock_milestone_escrow(
    milestone_id: str,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | float]:
    milestone = await db.get(ProjectMilestone, milestone_id)
    if milestone is None:
        raise HTTPException(status_code=404, detail="Milestone not found")
    project = await db.get(Project, milestone.project_id)
    if project is None or project.client_id != current_user.id:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if milestone.status not in ("AWAITING_ESCROW", "PENDING"):
        raise HTTPException(status_code=409, detail="Milestone is not awaiting escrow funding.")
    milestone.status = "ESCROW_LOCKED"
    milestone.escrow_locked = True
    milestone.due_at = datetime.now(timezone.utc) + timedelta(hours=milestone.sla_hours)
    if project.assigned_developer_id is not None and project.status == "IN_PROGRESS":
        milestone.status = "IN_PROGRESS"
    await db.commit()
    return {"status": milestone.status, "milestone_id": milestone.id, "amount": float(milestone.payout_amount)}


@router.post("/subscriptions/{subscription_id}/toggle-autopay")
async def toggle_subscription_autopay(
    subscription_id: str,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> dict[str, bool | str]:
    subscription = await db.get(MaintenanceSubscription, subscription_id)
    if subscription is None or subscription.client_id != current_user.id:
        raise HTTPException(status_code=404, detail="Subscription not found")
    subscription.auto_debit_enabled = not subscription.auto_debit_enabled
    subscription.is_active = subscription.auto_debit_enabled
    await db.commit()
    return {
        "subscription_id": subscription.id,
        "auto_debit_enabled": subscription.auto_debit_enabled,
        "is_active": subscription.is_active,
        "billing_status": subscription.billing_status,
    }


@router.get("/admin/sla-risks")
async def list_sla_risks(
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, str | int]]:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(ProjectMilestone, Project)
        .join(Project, Project.id == ProjectMilestone.project_id)
        .where(
            ProjectMilestone.due_at.is_not(None),
            ProjectMilestone.due_at < now,
            ProjectMilestone.status.not_in(("SUBMITTED", "REVIEW", "APPROVED", "PAID")),
        )
    )
    risks = []
    for milestone, project in result.all():
        developer = await db.get(User, project.assigned_developer_id) if project.assigned_developer_id else None
        if developer and not milestone.sla_breach_penalized:
            penalty_claimed = await db.execute(
                update(ProjectMilestone)
                .where(
                    ProjectMilestone.id == milestone.id,
                    ProjectMilestone.sla_breach_penalized.is_(False),
                )
                .values(sla_breach_penalized=True)
                .returning(ProjectMilestone.id)
            )
            if penalty_claimed.scalar_one_or_none() is not None:
                await db.execute(
                    update(User)
                    .where(User.id == developer.id)
                    .values(rating=case((User.rating >= 0.5, User.rating - 0.5), else_=0.0))
                    .execution_options(synchronize_session=False)
                )
        risks.append({
            "project_id": project.id,
            "project_title": project.title,
            "milestone_id": milestone.id,
            "milestone_title": milestone.title,
            "developer_id": developer.id if developer else "",
            "developer_name": developer.full_name if developer else "Unassigned",
            "due_at": milestone.due_at.isoformat(),
            "sla_hours": milestone.sla_hours,
        })
    await db.commit()
    return risks

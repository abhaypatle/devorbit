from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_roles
from app.db.session import get_db
from app.models.project import Project, ProjectMilestone
from app.models.user import User
from app.schemas.project import ProjectMilestoneRead, ProjectRead

router = APIRouter()


@router.get("/projects/available", response_model=list[ProjectRead])
async def list_available_projects(
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(
        select(Project).where(
            Project.assigned_developer_id.is_(None),
            Project.status.in_(["SUBMITTED", "ESTIMATED"]),
        )
    )
    projects = list(result.scalars().all())
    if current_user.skills:
        projects = [p for p in projects if set(current_user.skills).intersection(p.design_preferences.get("features", [])) or not p.design_preferences]
    return projects


@router.post("/projects/{project_id}/claim", response_model=ProjectRead)
async def claim_project(
    project_id: str,
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if project.assigned_developer_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project already assigned")

    project.assigned_developer_id = current_user.id
    project.status = "ASSIGNED"
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/projects/active", response_model=list[ProjectRead])
async def list_active_projects(
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(select(Project).where(Project.assigned_developer_id == current_user.id).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.patch("/milestones/{milestone_id}/submit", response_model=ProjectMilestoneRead)
async def submit_milestone(
    milestone_id: str,
    proof_urls: list[str] | None = None,
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> ProjectMilestone:
    milestone = await db.get(ProjectMilestone, milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    project = await db.get(Project, milestone.project_id)
    if project is None or project.assigned_developer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Milestone not assigned to you")

    milestone.proof_urls = proof_urls or milestone.proof_urls or []
    milestone.status = "SUBMITTED"
    project.progress_percentage = min(100, max(project.progress_percentage, 40))
    await db.commit()
    await db.refresh(milestone)
    return milestone


@router.get("/wallet")
async def view_wallet(
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(Project).where(Project.assigned_developer_id == current_user.id)
    )
    assigned_projects = list(result.scalars().all())
    paid_by_project_result = await db.execute(
        select(ProjectMilestone.project_id, ProjectMilestone.payout_amount)
        .where(ProjectMilestone.status == "PAID")
        .join(Project, Project.id == ProjectMilestone.project_id)
        .where(Project.assigned_developer_id == current_user.id)
    )
    paid_by_project: dict[str, float] = {}
    for project_id, payout_amount in paid_by_project_result.all():
        paid_by_project[project_id] = paid_by_project.get(project_id, 0.0) + float(payout_amount)
    escrow_balance = sum(
        max(0.0, float(project.developer_payout) - paid_by_project.get(project.id, 0.0))
        for project in assigned_projects
    )
    return {
        "wallet_balance": float(current_user.wallet_balance),
        "escrow_balance": escrow_balance,
        "released_earnings": float(current_user.wallet_balance),
        "projects": [project.title for project in assigned_projects],
    }

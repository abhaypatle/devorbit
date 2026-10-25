from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_roles
from app.db.session import get_db
from app.models.project import Project, ProjectMilestone
from app.models.user import User
from app.schemas.project import ProjectRead

router = APIRouter()


@router.get("/projects/pending", response_model=list[ProjectRead])
async def list_pending_projects(
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(select(Project).where(Project.status == "SUBMITTED").order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.post("/projects/{project_id}/estimate", response_model=ProjectRead)
async def estimate_project(
    project_id: str,
    payload: dict,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.client_budget = payload.get("client_budget", 0)
    project.developer_payout = payload.get("developer_payout", 0)
    project.monthly_maintenance_fee = payload.get("monthly_maintenance_fee", 0)
    project.status = "ESTIMATED"

    titles = payload.get("milestone_titles", ["Discovery", "Design", "Development", "QA"])
    total = max(1, len(titles))
    for title in titles:
        milestone = ProjectMilestone(project_id=project.id, title=title, payout_amount=(float(project.developer_payout) / total), status="PENDING")
        db.add(milestone)

    await db.commit(); await db.refresh(project)
    return project


@router.patch("/projects/{project_id}/watermark", response_model=ProjectRead)
async def toggle_watermark(
    project_id: str,
    value: bool,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.is_watermarked = value
    await db.commit(); await db.refresh(project)
    return project


@router.post("/milestones/{milestone_id}/release-payout", response_model=dict)
async def release_payout(
    milestone_id: str,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    milestone = await db.get(ProjectMilestone, milestone_id)
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    project = await db.get(Project, milestone.project_id)
    if project is None or project.assigned_developer_id is None:
        raise HTTPException(status_code=404, detail="Project not assigned")

    developer = await db.get(User, project.assigned_developer_id)
    if developer is None:
        raise HTTPException(status_code=404, detail="Developer not found")

    milestone.status = "PAID"
    developer.wallet_balance = float(developer.wallet_balance) + float(milestone.payout_amount)
    project.progress_percentage = 100
    await db.commit()
    return {"status": "released", "developer_id": developer.id, "amount": float(milestone.payout_amount)}


@router.get("/analytics/financials")
async def financial_analytics(
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    projects = (await db.execute(select(Project))).scalars().all()
    total_revenue = sum(float(project.client_budget) for project in projects)
    total_paid = sum(float(project.developer_payout) for project in projects)
    active_maintenance = sum(float(project.monthly_maintenance_fee) for project in projects if project.status == "MAINTENANCE")
    return {
        "total_revenue": total_revenue,
        "total_paid_to_developers": total_paid,
        "platform_net_profit": total_revenue - total_paid,
        "active_maintenance_contracts": active_maintenance,
    }

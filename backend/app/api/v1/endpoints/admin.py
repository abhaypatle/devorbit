from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_roles
from app.db.session import get_db
from app.models.project import MaintenanceSubscription, Project, ProjectChangeRequest, ProjectMilestone
from app.models.user import User
from app.schemas.project import ChangeRequestEstimate, ChangeRequestRead, ProjectEstimate, ProjectRead

router = APIRouter()

@router.get("/change-requests/pending", response_model=list[ChangeRequestRead])
async def list_pending_change_requests(
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectChangeRequest]:
    result = await db.execute(
        select(ProjectChangeRequest).where(ProjectChangeRequest.status == "PENDING")
    )
    return list(result.scalars().all())


@router.patch("/change-requests/{change_request_id}/estimate", response_model=ChangeRequestRead)
async def estimate_change_request(
    change_request_id: str,
    payload: ChangeRequestEstimate,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> ProjectChangeRequest:
    change_request = await db.get(ProjectChangeRequest, change_request_id)
    if change_request is None:
        raise HTTPException(status_code=404, detail="Change request not found")
    if change_request.status != "PENDING":
        raise HTTPException(status_code=409, detail="Change request has already been quoted or resolved")
    change_request.extra_cost = payload.extra_cost
    change_request.extra_developer_payout = payload.extra_developer_payout
    change_request.timeline_extension_days = payload.timeline_extension_days
    change_request.status = "QUOTED"
    await db.commit()
    await db.refresh(change_request)
    return change_request


@router.get("/milestones/review", response_model=list[dict])
async def list_milestones_for_review(
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(
        select(ProjectMilestone, Project.title)
        .join(Project, Project.id == ProjectMilestone.project_id)
        .where(ProjectMilestone.status == "SUBMITTED")
    )
    return [
        {
            "id": milestone.id,
            "project_id": milestone.project_id,
            "project_title": title,
            "title": milestone.title,
            "payout_amount": float(milestone.payout_amount),
            "client_rating": milestone.client_rating,
            "client_review": milestone.client_review,
            "status": milestone.status,
        }
        for milestone, title in result.all()
    ]


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
    payload: ProjectEstimate,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "SUBMITTED":
        raise HTTPException(status_code=409, detail="Project has already been estimated.")

    project.client_budget = payload.client_budget
    project.developer_payout = payload.developer_payout
    project.monthly_maintenance_fee = payload.monthly_maintenance_fee
    project.status = "ESTIMATED"

    titles = [title.strip() for title in payload.milestone_titles if title.strip()]
    if not titles:
        raise HTTPException(status_code=422, detail="At least one milestone is required.")
    total = len(titles)
    for title in titles:
        milestone = ProjectMilestone(
            project_id=project.id,
            title=title,
            payout_amount=(float(project.developer_payout) / total),
            status="AWAITING_ESCROW",
            sla_hours=72,
        )
        db.add(milestone)
    if float(project.monthly_maintenance_fee) > 0:
        subscription = MaintenanceSubscription(
            project_id=project.id,
            client_id=project.client_id,
            monthly_amount=project.monthly_maintenance_fee,
            next_billing_date=date.today() + timedelta(days=30),
            is_active=True,
            auto_debit_enabled=False,
            billing_status="ACTIVE",
        )
        db.add(subscription)

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
    if not value:
        milestones = (await db.execute(
            select(ProjectMilestone).where(ProjectMilestone.project_id == project.id)
        )).scalars().all()
        if project.status != "COMPLETED" or not milestones or any(milestone.status != "PAID" for milestone in milestones):
            raise HTTPException(status_code=409, detail="Watermark can only be removed after all milestones are paid and the project is completed.")
    project.is_watermarked = value
    await db.commit(); await db.refresh(project)
    return project


@router.post("/milestones/{milestone_id}/release-payout", response_model=dict)
async def release_payout(
    milestone_id: str,
    current_user: User = Depends(require_roles("ADMIN")),
    db: AsyncSession = Depends(get_db),
    override_rating: bool = False,
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

    payout_result = await db.execute(
        update(ProjectMilestone)
        .where(
            ProjectMilestone.id == milestone_id,
            ProjectMilestone.status == "SUBMITTED",
            or_(ProjectMilestone.client_rating >= 4, override_rating),
            ProjectMilestone.client_review.is_not(None),
        )
        .values(status="PAID", completed_at=datetime.now(timezone.utc))
        .returning(ProjectMilestone.payout_amount)
    )
    payout_amount = payout_result.scalar_one_or_none()
    if payout_amount is None:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A client rating of at least 4 and review are required unless an admin explicitly overrides the rating gate; payout may already be released.",
        )
    await db.execute(
        update(User)
        .where(User.id == developer.id)
        .values(wallet_balance=User.wallet_balance + payout_amount)
        .execution_options(synchronize_session=False)
    )
    milestones_result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.project_id == project.id)
    )
    milestones = list(milestones_result.scalars().all())
    paid_count = sum(item.status == "PAID" for item in milestones)
    project.progress_percentage = round(100 * paid_count / len(milestones)) if milestones else 0
    if milestones and paid_count == len(milestones):
        project.status = "COMPLETED"
    await db.commit()
    return {"status": "released", "developer_id": developer.id, "amount": float(payout_amount)}


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

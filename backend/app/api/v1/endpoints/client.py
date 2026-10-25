from __future__ import annotations

import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user, require_roles
from app.db.session import get_db
from app.models.project import Project, ProjectChangeRequest, ProjectMilestone
from app.models.user import ProjectStatus, User
from app.schemas.project import ChangeRequestCreate, ChangeRequestRead, ProjectCreate, ProjectProgressRead, ProjectRead

router = APIRouter()

BASE_COST_BY_CATEGORY = {
    "kirana": 18000,
    "restaurant": 24000,
    "clinic": 26000,
    "salon": 17000,
    "coaching": 22000,
    "portfolio": 12000,
    "e-commerce": 30000,
}
FEATURE_COSTS = {
    "online payment": 5000,
    "whatsapp bot": 4000,
    "admin panel": 6000,
    "inventory": 4500,
    "booking": 5000,
    "authentication": 3500,
    "analytics": 3000,
}
URGENCY_MULTIPLIERS = {"STANDARD": 1.0, "URGENT": 1.3, "ASAP": 1.6}


def estimate_project(payload: ProjectCreate) -> dict[str, int | float | str]:
    preferences = payload.design_preferences
    base_cost = BASE_COST_BY_CATEGORY.get(payload.business_category.casefold(), 20000)
    feature_cost = sum(
        FEATURE_COSTS.get(feature.casefold(), 2000)
        for feature in set(preferences.features + preferences.payment_methods)
    )
    platform_cost = {"web app": 0, "mobile pwa": 5000, "desktop": 8000}.get(
        preferences.target_platform.casefold(), 0
    )
    language_cost = max(0, len(set(preferences.languages)) - 1) * 1800
    subtotal = base_cost + feature_cost + platform_cost + language_cost
    urgency = preferences.urgency.upper()
    urgency_multiplier = URGENCY_MULTIPLIERS.get(urgency, URGENCY_MULTIPLIERS["STANDARD"])
    client_budget = math.ceil(subtotal * urgency_multiplier / 500) * 500
    developer_payout = math.floor(client_budget * 0.68 / 100) * 100

    stack = {item.casefold() for item in preferences.tech_stack}
    maintenance = 1200 + 300 * len(stack)
    if preferences.target_platform.casefold() != "web app":
        maintenance += 500
    if "docker" in stack or "aws" in stack or "azure" in stack:
        maintenance += 700
    return {
        "client_budget": client_budget,
        "developer_payout": developer_payout,
        "monthly_maintenance_fee": maintenance,
        "base_cost": base_cost,
        "feature_cost": feature_cost,
        "urgency_multiplier": urgency_multiplier,
        "urgency": urgency,
    }


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    design_preferences = payload.design_preferences.model_dump()
    design_preferences["recommended_estimate"] = estimate_project(payload)
    project = Project(
        client_id=current_user.id,
        title=payload.title,
        business_category=payload.business_category,
        description=payload.description or "",
        design_preferences=design_preferences,
        status=ProjectStatus.SUBMITTED,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(select(Project).where(Project.client_id == current_user.id).order_by(Project.created_at.desc()))
    return list(result.scalars().all())


@router.get("/projects/{project_id}/progress", response_model=ProjectProgressRead)
async def get_project_progress(
    project_id: str,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> dict:
    project = await db.get(Project, project_id)
    if not project or project.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    milestones_result = await db.execute(select(ProjectMilestone).where(ProjectMilestone.project_id == project_id))
    milestones = list(milestones_result.scalars().all())
    return {"project": project, "milestones": milestones}


@router.post("/projects/{project_id}/change-requests", response_model=ChangeRequestRead, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    project_id: str,
    payload: ChangeRequestCreate,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> ProjectChangeRequest:
    project = await db.get(Project, project_id)
    if not project or project.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    change_request = ProjectChangeRequest(
        project_id=project.id,
        change_description=payload.change_description,
        extra_cost=payload.extra_cost,
    )
    db.add(change_request)
    await db.commit()
    await db.refresh(change_request)
    return change_request


@router.patch("/change-requests/{change_request_id}/approve", response_model=ChangeRequestRead)
async def approve_change_request(
    change_request_id: str,
    current_user: User = Depends(require_roles("CLIENT")),
    db: AsyncSession = Depends(get_db),
) -> ProjectChangeRequest:
    change_request = await db.get(ProjectChangeRequest, change_request_id)
    if not change_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")

    project = await db.get(Project, change_request.project_id)
    if project is None or project.client_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    change_request.is_approved_by_client = True
    project.status = ProjectStatus.REVIEW
    await db.commit()
    await db.refresh(change_request)
    return change_request

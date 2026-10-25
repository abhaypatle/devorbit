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

SKILL_ALIASES = {
    "react": {"react", "frontend", "javascript", "typescript", "web"},
    "fastapi": {"fastapi", "python", "backend", "api"},
    "python": {"python", "fastapi", "backend", "api"},
    "payments": {"payment", "payments", "stripe", "razorpay", "checkout"},
    "online payment": {"payment", "payments", "stripe", "razorpay", "checkout"},
    "whatsapp bot": {"whatsapp", "bot", "automation"},
    "inventory": {"inventory", "stock", "products"},
    "admin panel": {"admin", "dashboard", "panel", "frontend"},
    "mobile pwa": {"mobile", "pwa", "react", "frontend"},
    "desktop": {"desktop", "electron"},
    "docker": {"docker", "devops", "deployment"},
}


def _skill_terms(value: str) -> set[str]:
    normalized = value.casefold().strip()
    terms = {normalized}
    terms.update(part for part in normalized.replace("-", " ").replace("/", " ").split() if len(part) > 2)
    terms.update(SKILL_ALIASES.get(normalized, set()))
    return terms


def calculate_skill_match(skills: list[str], project: Project) -> int:
    preferences = project.design_preferences or {}
    developer_terms: set[str] = set()
    for skill in skills:
        developer_terms.update(_skill_terms(skill))

    requirements: list[tuple[str, int]] = []
    requirements.extend((str(item), 3) for item in preferences.get("tech_stack", []))
    requirements.extend((str(item), 1) for item in preferences.get("features", []))
    requirements.extend((str(item), 1) for item in preferences.get("payment_methods", []))
    if not requirements:
        return 0

    total_weight = sum(weight for _, weight in requirements)
    matched_weight = 0
    for requirement, weight in requirements:
        terms = _skill_terms(requirement)
        if developer_terms.intersection(terms):
            matched_weight += weight
    return round(100 * matched_weight / total_weight)


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
    scored_projects = [
        (project, calculate_skill_match(current_user.skills or [], project))
        for project in projects
    ]
    scored_projects.sort(key=lambda item: item[1], reverse=True)
    return [
        {**ProjectRead.model_validate(project).model_dump(), "match_percentage": match}
        for project, match in scored_projects
    ]


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

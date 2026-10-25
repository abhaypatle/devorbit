from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import require_roles
from app.db.session import get_db
from app.models.project import Project, ProjectMilestone
from app.models.user import User
from app.schemas.project import DeveloperClaimRead, DeveloperProjectRead, MilestoneSubmission, ProjectMilestoneRead, ProjectRead
from app.services.asset_fallback import developer_starter_kit

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
    return int(100 * matched_weight / total_weight)


@router.get("/projects/available", response_model=list[ProjectRead])
async def list_available_projects(
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    result = await db.execute(
        select(Project).where(
            Project.assigned_developer_id.is_(None),
            Project.status == "ESTIMATED",
            exists().where(ProjectMilestone.project_id == Project.id),
            ~exists().where(
                ProjectMilestone.project_id == Project.id,
                ProjectMilestone.status != "ESCROW_LOCKED",
            ),
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


@router.post("/projects/{project_id}/claim", response_model=DeveloperClaimRead)
async def claim_project(
    project_id: str,
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    match_percentage = calculate_skill_match(current_user.skills or [], project)
    if match_percentage < 80:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Claim requires at least 80% skill match; current match is {match_percentage}%.",
        )
    milestones_result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.project_id == project_id)
    )
    milestones = list(milestones_result.scalars().all())
    if not milestones or any(milestone.status != "ESCROW_LOCKED" or not milestone.escrow_locked for milestone in milestones):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The client must fund every milestone escrow before this project can be claimed.",
        )

    result = await db.execute(
        update(Project)
        .where(
            Project.id == project_id,
            Project.assigned_developer_id.is_(None),
            Project.status == "ESTIMATED",
        )
        .values(assigned_developer_id=current_user.id, status="IN_PROGRESS")
        .returning(Project.id)
    )
    if result.scalar_one_or_none() is None:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Project is no longer available to claim.")
    await db.execute(
        update(ProjectMilestone)
        .where(ProjectMilestone.project_id == project_id, ProjectMilestone.status == "ESCROW_LOCKED")
        .values(status="IN_PROGRESS")
    )
    await db.commit()
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return {
        **ProjectRead.model_validate(project).model_dump(),
        "match_percentage": match_percentage,
        "starter_kit": developer_starter_kit(
            project.business_category,
            project.design_preferences,
        ),
    }


@router.get("/projects/active", response_model=list[DeveloperProjectRead])
async def list_active_projects(
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(select(Project).where(Project.assigned_developer_id == current_user.id).order_by(Project.created_at.desc()))
    projects = list(result.scalars().all())
    if not projects:
        return []
    milestone_result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.project_id.in_([project.id for project in projects]))
    )
    milestones_by_project: dict[str, list[ProjectMilestone]] = {}
    for milestone in milestone_result.scalars().all():
        milestones_by_project.setdefault(milestone.project_id, []).append(milestone)
    return [
        {
            **ProjectRead.model_validate(project).model_dump(),
            "milestones": [
                ProjectMilestoneRead.model_validate(milestone).model_dump()
                for milestone in milestones_by_project.get(project.id, [])
            ],
        }
        for project in projects
    ]


@router.patch("/milestones/{milestone_id}/submit", response_model=ProjectMilestoneRead)
async def submit_milestone(
    milestone_id: str,
    payload: MilestoneSubmission,
    current_user: User = Depends(require_roles("DEVELOPER")),
    db: AsyncSession = Depends(get_db),
) -> ProjectMilestone:
    milestone = await db.get(ProjectMilestone, milestone_id)
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    project = await db.get(Project, milestone.project_id)
    if project is None or project.assigned_developer_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Milestone not assigned to you")
    if project.status == "CHANGE_REQUEST":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Work is paused until the client resolves the change request.")

    if milestone.status != "IN_PROGRESS" or not milestone.escrow_locked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This milestone has already been submitted.")
    milestone.staging_url = str(payload.staging_url)
    milestone.github_url = str(payload.github_url)
    milestone.proof_urls = [str(payload.staging_url), str(payload.github_url)]
    milestone.status = "SUBMITTED"
    project.status = "REVIEW"
    project.staging_preview_url = str(payload.staging_url)
    project.progress_percentage = min(99, max(project.progress_percentage, 40))
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

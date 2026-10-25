from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.project import Project, ProjectMilestone
from app.models.user import User

router = APIRouter()


@router.get("/projects/{project_id}/documentation-kit")
async def documentation_kit(
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
    result = await db.execute(
        select(ProjectMilestone)
        .where(ProjectMilestone.project_id == project.id)
        .order_by(ProjectMilestone.due_at, ProjectMilestone.title)
    )
    milestones = list(result.scalars().all())
    preferences = project.design_preferences or {}
    stack = preferences.get("tech_stack", [])
    stack_text = ", ".join(stack) if stack else "To be confirmed"
    milestone_titles = [milestone.title for milestone in milestones]
    roadmap = milestone_titles or ["Discovery", "Design", "Development", "Testing", "Launch"]
    report = f"""# {project.title} — Project Report

## Overview
- **Project ID:** `{project.id}`
- **Category:** {project.business_category}
- **Status:** {project.status}
- **Target platform:** {preferences.get("target_platform", "Web App")}
- **Technology stack:** {stack_text}

## Architecture overview
The solution is organized into a responsive client interface, a validated API service, and a relational persistence layer. Authentication and role-based access protect project data. Integrations are isolated behind service boundaries and should use environment-managed credentials.

## Data model
- **Project:** id, client_id, title, category, status, budget, developer payout, progress, design preferences.
- **Milestone:** id, project_id, title, payout, status, due date, submission and review metadata.
- **ProjectMessage:** id, project_id, sender_id, message, optional attachment URL, creation time.
- **PinpointNote:** project_id, relative coordinates, element label, feedback note, QA status.

## Delivery roadmap
{chr(10).join(f"- {index}. {title}" for index, title in enumerate(roadmap, 1))}
"""
    slides = [
        {"title": "Project", "content": project.title},
        {"title": "Problem", "content": f"Business needs for a {project.business_category.lower()} experience."},
        {"title": "Audience", "content": "Customers, staff, and agency project stakeholders."},
        {"title": "Solution", "content": project.description or "A responsive digital product tailored to the business."},
        {"title": "Product scope", "content": ", ".join(preferences.get("features", [])) or "Core business workflows"},
        {"title": "Design direction", "content": f"Theme: {preferences.get('theme', 'Custom')} · Template: {preferences.get('template_archetype', 'Responsive interface')}"},
        {"title": "Technology", "content": stack_text},
        {"title": "Architecture", "content": "React client, FastAPI service, PostgreSQL-compatible data layer."},
        {"title": "Roadmap", "content": " → ".join(roadmap)},
        {"title": "Success", "content": "Ship a secure, usable, maintainable product and measure adoption."},
    ]
    srs = f"""# Software Requirements Specification: {project.title}

## 1. Purpose
Deliver a digital product for the {project.business_category} business.

## 2. Functional requirements
{chr(10).join(f"- The system shall support {feature}." for feature in preferences.get("features", []) or ["project-specific business workflows", "responsive user access", "role-appropriate administration"])}
- The system shall support the agreed target platform: {preferences.get("target_platform", "Web App")}.
- The system shall provide project milestone tracking and stakeholder review.

## 3. Non-functional requirements
- Security: enforce authentication, authorization, input validation, and secret management.
- Availability: expose health monitoring and actionable error reporting.
- Performance: paginate high-volume activity and minimize blocking operations.
- Accessibility: keyboard-accessible controls, semantic structure, and readable contrast.
- Maintainability: typed interfaces, documented API contracts, and automated tests.

## 4. Data and integrations
Technology stack: {stack_text}. External integrations and production credentials require approval and secure configuration.
"""
    banner = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#4f46e5"/><stop offset="1" stop-color="#0891b2"/></linearGradient></defs>
  <rect width="1200" height="630" rx="36" fill="#0f172a"/>
  <rect x="28" y="28" width="1144" height="574" rx="28" fill="url(#g)" opacity=".22"/>
  <text x="80" y="180" fill="#a5b4fc" font-family="sans-serif" font-size="24">DEVORBIT PROJECT</text>
  <text x="80" y="285" fill="#fff" font-family="sans-serif" font-size="56" font-weight="700">{_escape_svg(project.title)}</text>
  <text x="80" y="350" fill="#cbd5e1" font-family="sans-serif" font-size="30">{_escape_svg(project.business_category)} · {_escape_svg(project.status)}</text>
  <text x="80" y="510" fill="#e2e8f0" font-family="sans-serif" font-size="22">{_escape_svg(stack_text)}</text>
</svg>"""
    return {
        "project_id": project.id,
        "report": {"format": "markdown", "content": report},
        "pitch_deck": {"format": "slides-json", "slides": slides},
        "technical_thesis": {"format": "markdown", "content": srs},
        "marketing_banner": {"format": "svg", "content": banner},
    }


def _escape_svg(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

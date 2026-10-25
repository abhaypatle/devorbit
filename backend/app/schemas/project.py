from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DesignPreferences(BaseModel):
    colors: dict[str, str] = Field(default_factory=dict)
    sample_links: list[str] = Field(default_factory=list)
    features: list[str] = Field(default_factory=list)
    tech_stack: list[str] = Field(default_factory=list)
    target_platform: str = "Web App"
    languages: list[str] = Field(default_factory=lambda: ["English"])
    auth_preference: str = "Email"
    payment_methods: list[str] = Field(default_factory=list)
    urgency: str = "STANDARD"
    theme: str = "Indigo Tech"
    template_archetype: str = "Storefront"
    logo_url: str | None = None
    font_preference: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    business_category: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    design_preferences: DesignPreferences = Field(default_factory=DesignPreferences)


class ProjectEstimate(BaseModel):
    client_budget: float
    developer_payout: float
    monthly_maintenance_fee: float
    milestone_titles: list[str] = Field(default_factory=lambda: ["Discovery", "Design", "Development", "QA"])


class ProjectMilestoneRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    title: str
    payout_amount: float
    status: str
    due_date: date | None = None
    completed_at: datetime | None = None
    proof_urls: list[str] = Field(default_factory=list)


class ChangeRequestCreate(BaseModel):
    change_description: str
    extra_cost: float


class ChangeRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    change_description: str
    extra_cost: float
    is_approved_by_client: bool
    is_paid: bool
    created_at: datetime | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_id: str
    assigned_developer_id: str | None = None
    title: str
    business_category: str
    description: str | None = None
    design_preferences: dict
    status: str
    client_budget: float
    developer_payout: float
    progress_percentage: int
    monthly_maintenance_fee: float
    staging_preview_url: str | None = None
    is_watermarked: bool
    created_at: datetime | None = None
    match_percentage: int | None = None


class ProjectProgressRead(BaseModel):
    project: ProjectRead
    milestones: list[ProjectMilestoneRead]

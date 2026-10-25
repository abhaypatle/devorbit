from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class SampleProduct(BaseModel):
    name: str
    price: float = Field(..., ge=0)
    category: str = "Featured"


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
    asset_links: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)
    content: dict[str, str] = Field(default_factory=dict)
    sample_products: list[SampleProduct] = Field(default_factory=list)
    map_coordinates: dict[str, float] | None = None
    logo_url: str | None = None
    font_preference: str | None = None


class ProjectCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    business_category: str = Field(..., min_length=2, max_length=100)
    description: str | None = None
    design_preferences: DesignPreferences = Field(default_factory=DesignPreferences)


class ProjectEstimate(BaseModel):
    client_budget: float = Field(..., gt=0)
    developer_payout: float = Field(..., gt=0)
    monthly_maintenance_fee: float = Field(..., ge=0)
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
    staging_url: str | None = None
    github_url: str | None = None
    client_rating: int | None = None
    client_review: str | None = None
    sla_hours: int = 72
    due_at: datetime | None = None
    escrow_locked: bool = False


class ChangeRequestCreate(BaseModel):
    change_description: str = Field(..., min_length=5, max_length=4000)
    extra_cost: float = Field(default=0, ge=0)
    developer_salary_bonus: float = Field(default=0, ge=0)
    days_extension: int = Field(default=0, ge=0, le=365)


class ChangeRequestEstimate(BaseModel):
    extra_cost: float = Field(..., ge=0)
    extra_developer_payout: float = Field(..., ge=0)
    timeline_extension_days: int = Field(..., ge=0, le=365)


class ChangeRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    change_description: str
    extra_cost: float
    extra_developer_payout: float
    timeline_extension_days: int
    status: str
    is_approved_by_client: bool
    is_paid: bool
    created_at: datetime | None = None


class MilestoneSubmission(BaseModel):
    staging_url: HttpUrl
    github_url: HttpUrl


class MilestoneFeedback(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    review: str = Field(..., min_length=5, max_length=2000)


class ClientMilestoneReview(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback_note: str = Field(..., min_length=1, max_length=2000)


class MilestoneFeedbackRead(BaseModel):
    milestone_id: str
    client_rating: int
    client_review: str
    status: str


class ProjectMessageCreate(BaseModel):
    message_text: str = Field(..., min_length=1, max_length=10000)
    attachment_url: HttpUrl | None = None


class ProjectMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    sender_id: str
    sender_name: str
    sender_role: str
    message_text: str
    attachment_url: str | None
    created_at: datetime


class PinpointNoteCreate(BaseModel):
    x_percent: float = Field(..., ge=0, le=100)
    y_percent: float = Field(..., ge=0, le=100)
    element_label: str = Field(..., min_length=1, max_length=200)
    feedback_note: str = Field(..., min_length=1, max_length=4000)


class PinpointNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_by_id: str
    x_percent: float
    y_percent: float
    element_label: str
    feedback_note: str
    status: str
    created_at: datetime


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


class DeveloperProjectRead(ProjectRead):
    milestones: list[ProjectMilestoneRead] = Field(default_factory=list)


class DeveloperStarterProducts(BaseModel):
    is_placeholder: bool
    products: list[SampleProduct]


class DeveloperStarterContent(BaseModel):
    is_placeholder: bool
    hero_text: str
    images: list[str]
    map_coordinates: dict[str, float]
    placeholders: dict[str, bool]


class DeveloperStarterKitRead(BaseModel):
    sample_products: DeveloperStarterProducts
    mock_content: DeveloperStarterContent


class DeveloperClaimRead(ProjectRead):
    starter_kit: DeveloperStarterKitRead


class ProjectProgressRead(BaseModel):
    project: ProjectRead
    milestones: list[ProjectMilestoneRead]
    change_requests: list[ChangeRequestRead] = Field(default_factory=list)

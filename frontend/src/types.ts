export type Role = 'CLIENT' | 'DEVELOPER' | 'ADMIN';

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  role: Role;
  skills: string[];
  experience: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
  rating: number;
  wallet_balance: number;
  created_at: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  payout_amount: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'AWAITING_ESCROW' | 'ESCROW_LOCKED' | 'SUBMITTED' | 'REVIEW' | 'APPROVED' | 'PAID';
  due_date: string | null;
  completed_at: string | null;
  proof_urls: string[];
  staging_url: string | null;
  github_url: string | null;
  client_rating: number | null;
  client_review: string | null;
  sla_hours: number;
  due_at: string | null;
  escrow_locked: boolean;
}

export interface DashboardProject {
  id: string;
  client_id: string;
  assigned_developer_id: string | null;
  title: string;
  business_category: string;
  description: string | null;
  design_preferences: {
    colors?: Record<string, string>;
    sample_links?: string[];
    features?: string[];
    tech_stack?: string[];
    languages?: string[];
    payment_methods?: string[];
    target_platform?: string;
    auth_preference?: string;
    template_archetype?: string;
    theme?: string;
    timeline_extension_days?: number;
    logo_url?: string | null;
    font_preference?: string | null;
    asset_links?: string[];
    photos?: string[];
    content?: Record<string, string>;
    sample_products?: Array<{ name: string; price: number; category: string }>;
    map_coordinates?: { latitude: number; longitude: number } | null;
    asset_fallback?: {
      hero_text: string;
      images: string[];
      sample_products: Array<{ name: string; price: number; category: string }>;
      map_coordinates: { latitude: number; longitude: number };
      placeholders: Record<string, boolean>;
      is_placeholder: boolean;
    };
    recommended_estimate?: RecommendedEstimate;
    [key: string]: unknown;
  };
  status: string;
  client_budget: number;
  developer_payout: number;
  progress_percentage: number;
  monthly_maintenance_fee: number;
  staging_preview_url: string | null;
  is_watermarked: boolean;
  created_at: string | null;
  milestones?: Milestone[];
  match_percentage?: number;
  change_requests?: ChangeRequest[];
}

export interface ChangeRequest {
  id: string;
  project_id: string;
  change_description: string;
  extra_cost: number;
  extra_developer_payout: number;
  timeline_extension_days: number;
  status: 'PENDING' | 'QUOTED' | 'APPROVED' | 'REJECTED';
  is_approved_by_client: boolean;
  is_paid: boolean;
  created_at: string | null;
}

export interface MilestoneReview {
  id: string;
  project_id: string;
  project_title: string;
  title: string;
  payout_amount: number;
  client_rating: number | null;
  client_review: string | null;
  status: string;
}

export interface RecommendedEstimate {
  client_budget: number;
  developer_payout: number;
  monthly_maintenance_fee: number;
  base_cost: number;
  feature_cost: number;
  urgency_multiplier: number;
  urgency: string;
}

export interface ProjectMessage {
  id: string;
  project_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  message_text: string;
  attachment_url: string | null;
  created_at: string;
}

export interface PinpointNote {
  id: string;
  project_id: string;
  created_by_id: string;
  x_percent: number;
  y_percent: number;
  element_label: string;
  feedback_note: string;
  status: 'PENDING' | 'RESOLVED';
  created_at: string;
}

export interface MaintenanceSubscription {
  id: string;
  project_id: string;
  monthly_amount: number;
  next_billing_date: string;
  auto_debit_enabled: boolean;
  billing_status: 'ACTIVE' | 'PAST_DUE';
}

export interface DocumentationKit {
  project_id: string;
  report: { format: string; content: string };
  pitch_deck: { format: string; slides: Array<{ title: string; content: string }> };
  technical_thesis: { format: string; content: string };
  marketing_banner: { format: string; content: string };
}

export interface SlaRisk {
  project_id: string;
  project_title: string;
  milestone_id: string;
  milestone_title: string;
  developer_id: string;
  developer_name: string;
  due_at: string;
  sla_hours: number;
}

export interface DeveloperStarterKit {
  sample_products: {
    is_placeholder: boolean;
    products: Array<{ name: string; price: number; category: string }>;
  };
  mock_content: {
    is_placeholder: boolean;
    hero_text: string;
    images: string[];
    map_coordinates: { latitude: number; longitude: number };
    placeholders: Record<string, boolean>;
  };
}

export interface DeveloperClaimResponse extends DashboardProject {
  starter_kit: DeveloperStarterKit;
}

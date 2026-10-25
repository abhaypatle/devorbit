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
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'PAID';
  due_date: string | null;
  completed_at: string | null;
  proof_urls: string[];
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
}

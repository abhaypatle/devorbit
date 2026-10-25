import { useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent, MouseEvent, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormRegister } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight, BriefcaseBusiness, Building2, Check, CheckCircle2, CreditCard,
  DollarSign, FileText, Gauge, LayoutTemplate, LogOut, Palette, Rocket,
  ShieldCheck, Sparkles, Wallet, Star, ExternalLink, LockKeyhole, MessageCircle,
  Download, Mic, Monitor, Smartphone, Tablet,
  Shirt, Sofa, MapPin,
} from 'lucide-react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { api, clearAuthToken, setAuthToken } from './lib/api';
import type {
  AuthResponse, ChangeRequest, DashboardProject, DeveloperClaimResponse, DeveloperStarterKit,
  DocumentationKit, MaintenanceSubscription, Milestone, MilestoneReview, PinpointNote,
  ProjectMessage, SlaRisk, User,
} from './types';

const panelClass = 'rounded-3xl border border-white/10 bg-slate-900/55 p-6 shadow-xl shadow-black/10 backdrop-blur-xl';
const fieldClass = 'w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none transition focus:border-violet-400';
const themes = [
  { name: 'Indigo Tech', primary: '#6366f1', secondary: '#22d3ee', surface: '#111827' },
  { name: 'Emerald FinTech', primary: '#10b981', secondary: '#a3e635', surface: '#10231e' },
  { name: 'Violet Cyber', primary: '#a855f7', secondary: '#ec4899', surface: '#20132b' },
  { name: 'Crimson Retail', primary: '#f43f5e', secondary: '#fb923c', surface: '#2a161c' },
] as const;
const archetypes = [
  { name: 'Storefront', detail: 'Product-led shop', icon: Building2 },
  { name: 'Booking Portal', detail: 'Appointments & slots', icon: CheckCircle2 },
  { name: 'Dashboard', detail: 'Data & operations', icon: Gauge },
  { name: 'Portfolio', detail: 'Work & profile', icon: LayoutTemplate },
] as const;

const projectSchema = z.object({
  title: z.string().min(3, 'Project title is required').max(200),
  category: z.string().min(2),
  description: z.string().min(12, 'Please describe the project in more detail'),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  theme: z.string(),
  templateArchetype: z.string(),
  logoUrl: z.string(),
  fontPreference: z.string(),
  assetLinks: z.string(),
  heroText: z.string(),
  assetPhotos: z.string(),
  sampleProducts: z.string(),
  features: z.array(z.string()),
  techStack: z.array(z.string()),
  sampleLinks: z.string(),
  targetPlatform: z.enum(['Web App', 'Mobile PWA', 'Desktop']),
  languages: z.array(z.string()).min(1),
  authPreference: z.enum(['Phone OTP', 'Email']),
  paymentMethods: z.array(z.string()),
  urgency: z.enum(['STANDARD', 'URGENT', 'ASAP']),
});
type ProjectForm = z.infer<typeof projectSchema>;

const estimateSchema = z.object({
  client_budget: z.coerce.number().positive(),
  developer_payout: z.coerce.number().positive(),
  monthly_maintenance_fee: z.coerce.number().min(0),
  milestone_titles: z.string().min(1),
});
type EstimateForm = z.infer<typeof estimateSchema>;

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().optional(),
  phone_number: z.string().optional(),
  role: z.enum(['CLIENT', 'DEVELOPER', 'ADMIN']),
  skills: z.string().optional(),
  experience: z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT']),
});
type AuthForm = z.infer<typeof authSchema>;

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(', ');
  }
  return error instanceof Error ? error.message : 'The request failed. Please try again.';
}

function isProjectReleased(project: DashboardProject): boolean {
  const milestones = project.milestones ?? [];
  return project.status === 'COMPLETED' && milestones.length > 0 && milestones.every((milestone) => milestone.status === 'PAID');
}

function lockedEscrow(project: DashboardProject): number {
  return (project.milestones ?? [])
    .filter((milestone) => milestone.escrow_locked || milestone.status === 'ESCROW_LOCKED' || milestone.status === 'IN_PROGRESS')
    .reduce((total, milestone) => total + milestone.payout_amount, 0);
}

function slaCountdown(dueAt: string | null, now: number): string {
  if (!dueAt) return 'SLA starts after escrow is funded';
  const milliseconds = new Date(dueAt).getTime() - now;
  if (milliseconds <= 0) return 'SLA breached';
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

function milestoneCountdown(milestone: Milestone, now: number): string {
  const deadline = milestone.due_at ?? milestone.due_date;
  if (!deadline) return 'Schedule pending';
  const days = Math.ceil((new Date(deadline).getTime() - now) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authOpen, setAuthOpen] = useState(!localStorage.getItem('devorbit_token'));
  const [authError, setAuthError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [activeProjects, setActiveProjects] = useState<DashboardProject[]>([]);
  const [wallet, setWallet] = useState<{ wallet_balance: number; escrow_balance: number; released_earnings: number } | null>(null);
  const [pendingProjects, setPendingProjects] = useState<DashboardProject[]>([]);
  const [pendingChanges, setPendingChanges] = useState<ChangeRequest[]>([]);
  const [submittedMilestones, setSubmittedMilestones] = useState<MilestoneReview[]>([]);
  const [financials, setFinancials] = useState<Record<string, number> | null>(null);
  const [subscriptions, setSubscriptions] = useState<MaintenanceSubscription[]>([]);
  const [slaRisks, setSlaRisks] = useState<SlaRisk[]>([]);
  const [selectedProject, setSelectedProject] = useState<DashboardProject | null>(null);
  const [workProject, setWorkProject] = useState<DashboardProject | null>(null);
  const [submissionMilestone, setSubmissionMilestone] = useState<Milestone | null>(null);
  const [quoteRequest, setQuoteRequest] = useState<ChangeRequest | null>(null);
  const [changeProject, setChangeProject] = useState<DashboardProject | null>(null);
  const [submissionUrls, setSubmissionUrls] = useState({ staging_url: '', github_url: '' });
  const [chatProject, setChatProject] = useState<DashboardProject | null>(null);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageAttachment, setMessageAttachment] = useState('');
  const [pinpointNotes, setPinpointNotes] = useState<PinpointNote[]>([]);
  const [previewProject, setPreviewProject] = useState<DashboardProject | null>(null);
  const [pinpointMode, setPinpointMode] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [escrowProject, setEscrowProject] = useState<DashboardProject | null>(null);
  const [upiProvider, setUpiProvider] = useState('GPay');
  const [docsProject, setDocsProject] = useState<DashboardProject | null>(null);
  const [docsKit, setDocsKit] = useState<DocumentationKit | null>(null);
  const [legalPage, setLegalPage] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [voiceLanguage, setVoiceLanguage] = useState('en-IN');
  const [virtualPreviewOpen, setVirtualPreviewOpen] = useState(false);
  const [starterKit, setStarterKit] = useState<DeveloperStarterKit | null>(null);

  const intakeForm = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: '', category: 'Kirana', description: '', primaryColor: '#7c3aed',
      secondaryColor: '#e2e8f0', theme: 'Indigo Tech', templateArchetype: 'Storefront',
      logoUrl: '', fontPreference: '', assetLinks: '', heroText: '', assetPhotos: '', sampleProducts: '',
      features: [], techStack: ['React', 'FastAPI'], sampleLinks: '', targetPlatform: 'Web App',
      languages: ['English'], authPreference: 'Email', paymentMethods: [], urgency: 'STANDARD',
    },
  });
  const estimateForm = useForm<EstimateForm>({
    resolver: zodResolver(estimateSchema),
    defaultValues: { client_budget: 0, developer_payout: 0, monthly_maintenance_fee: 0, milestone_titles: 'Discovery, Design, Development, QA' },
  });
  const quoteForm = useForm({
    defaultValues: { extra_cost: 0, extra_developer_payout: 0, timeline_extension_days: 0 },
  });
  const authForm = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '', full_name: '', phone_number: '', role: 'CLIENT', skills: '', experience: 'BEGINNER' },
  });

  const role = user?.role;
  const selectedThemeName = intakeForm.watch('theme');
  const selectedTheme = themes.find((theme) => theme.name === selectedThemeName) ?? themes[0];
  const selectedArchetype = intakeForm.watch('templateArchetype');
  const watchedCategory = intakeForm.watch('category');
  const watchedDescription = intakeForm.watch('description');
  const suggestedFeatures = useMemo(
    () => suggestClientFeatures(watchedCategory, watchedDescription),
    [watchedCategory, watchedDescription],
  );

  useEffect(() => {
    if (!intakeForm.formState.dirtyFields.features && suggestedFeatures.length) {
      intakeForm.setValue('features', suggestedFeatures, { shouldDirty: false });
    }
  }, [intakeForm, suggestedFeatures]);

  useEffect(() => {
    const token = localStorage.getItem('devorbit_token');
    if (!token) return;
    setAuthToken(token);
    api.get<User>('/auth/me')
      .then(({ data }) => {
        setUser(data);
        setAuthOpen(false);
      })
      .catch(() => {
        clearAuthToken();
        setAuthOpen(true);
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setNotice('');
    const load = async () => {
      try {
        if (user.role === 'CLIENT') {
          const [{ data }, { data: subscriptionRows }] = await Promise.all([
            api.get<DashboardProject[]>('/client/projects'),
            api.get<MaintenanceSubscription[]>('/client/subscriptions'),
          ]);
          const withProgress = await Promise.all(data.map(async (project) => {
            const response = await api.get<{ project: DashboardProject; milestones: DashboardProject['milestones']; change_requests: ChangeRequest[] }>(`/client/projects/${project.id}/progress`);
            return { ...response.data.project, milestones: response.data.milestones, change_requests: response.data.change_requests };
          }));
          if (!cancelled) {
            setProjects(withProgress);
            setSubscriptions(subscriptionRows);
          }
        } else if (user.role === 'DEVELOPER') {
          const [available, active, walletResponse] = await Promise.all([
            api.get<DashboardProject[]>('/developer/projects/available'),
            api.get<DashboardProject[]>('/developer/projects/active'),
            api.get<{ wallet_balance: number; escrow_balance: number; released_earnings: number }>('/developer/wallet'),
          ]);
          if (!cancelled) {
            setProjects(available.data);
            setActiveProjects(active.data);
            setWorkProject((current) => current ? active.data.find((project) => project.id === current.id) ?? current : current);
            setWallet(walletResponse.data);
          }
        } else {
          const [pending, stats] = await Promise.all([
            api.get<DashboardProject[]>('/admin/projects/pending'),
            api.get<Record<string, number>>('/admin/analytics/financials'),
          ]);
          const [changes, reviews] = await Promise.all([
            api.get<ChangeRequest[]>('/admin/change-requests/pending'),
            api.get<MilestoneReview[]>('/admin/milestones/review'),
          ]);
          const risks = await api.get<SlaRisk[]>('/admin/sla-risks');
          if (!cancelled) {
            setPendingProjects(pending.data);
            setFinancials(stats.data);
            setPendingChanges(changes.data);
            setSubmittedMilestones(reviews.data);
            setSlaRisks(risks.data);
          }
        }
      } catch (error) {
        if (!cancelled) setNotice(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!chatProject) return;
    const token = localStorage.getItem('devorbit_token');
    if (!token) return;
    const socket = new WebSocket(
      `${(api.defaults.baseURL ?? '').replace(/^http/, 'ws')}/projects/${chatProject.id}/messages/live?token=${encodeURIComponent(token)}`,
    );
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as ProjectMessage;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      } catch {
        setNotice('A live project message could not be displayed.');
      }
    };
    socket.onerror = () => setNotice('Live chat connection is unavailable; messages can still be sent and refreshed.');
    return () => socket.close();
  }, [chatProject]);

  const refreshDashboard = async () => {
    if (!user) return;
    if (user.role === 'CLIENT') {
      const [{ data }, { data: subscriptionRows }] = await Promise.all([
        api.get<DashboardProject[]>('/client/projects'),
        api.get<MaintenanceSubscription[]>('/client/subscriptions'),
      ]);
      const rows = await Promise.all(data.map(async (project) => {
        const response = await api.get<{ project: DashboardProject; milestones: DashboardProject['milestones']; change_requests: ChangeRequest[] }>(`/client/projects/${project.id}/progress`);
        return { ...response.data.project, milestones: response.data.milestones, change_requests: response.data.change_requests };
      }));
      setProjects(rows);
      setSubscriptions(subscriptionRows);
    } else if (user.role === 'DEVELOPER') {
      const [available, active, walletResponse] = await Promise.all([
        api.get<DashboardProject[]>('/developer/projects/available'),
        api.get<DashboardProject[]>('/developer/projects/active'),
        api.get<{ wallet_balance: number; escrow_balance: number; released_earnings: number }>('/developer/wallet'),
      ]);
      setProjects(available.data);
      setActiveProjects(active.data);
      setWorkProject((current) => current ? active.data.find((project) => project.id === current.id) ?? current : current);
      setWallet(walletResponse.data);
    } else {
      const [pending, stats, changes, reviews, risks] = await Promise.all([
        api.get<DashboardProject[]>('/admin/projects/pending'),
        api.get<Record<string, number>>('/admin/analytics/financials'),
        api.get<ChangeRequest[]>('/admin/change-requests/pending'),
        api.get<MilestoneReview[]>('/admin/milestones/review'),
        api.get<SlaRisk[]>('/admin/sla-risks'),
      ]);
      setPendingProjects(pending.data);
      setFinancials(stats.data);
      setPendingChanges(changes.data);
      setSubmittedMilestones(reviews.data);
      setSlaRisks(risks.data);
    }
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    setProjects([]);
    setActiveProjects([]);
    setPendingProjects([]);
    setPendingChanges([]);
    setSubmittedMilestones([]);
    setWallet(null);
    setFinancials(null);
    setSubscriptions([]);
    setSlaRisks([]);
    setAuthMode('login');
    setAuthOpen(true);
  };

  const submitAuth = async (values: AuthForm) => {
    setAuthError('');
    setLoading(true);
    try {
      if (authMode === 'register') {
        if (!values.full_name || !values.phone_number) throw new Error('Name and phone number are required.');
        await api.post('/auth/register', {
          full_name: values.full_name,
          email: values.email,
          phone_number: values.phone_number,
          password: values.password,
          role: values.role,
          skills: values.skills?.split(',').map((skill) => skill.trim()).filter(Boolean) ?? [],
          experience: values.experience,
        });
      }
      const { data } = await api.post<AuthResponse>('/auth/login', { email: values.email, password: values.password });
      if (data.user.role !== values.role) {
        setAuthError(`This account is registered as ${roleLabel(data.user.role)}. Select the matching role to continue.`);
        return;
      }
      setAuthToken(data.access_token);
      setUser(data.user);
      setAuthOpen(false);
      setNotice('');
      authForm.reset();
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const submitProject = async (values: ProjectForm) => {
    setNotice('');
    try {
      const sampleProducts = values.sampleProducts.trim()
        ? values.sampleProducts.split(/\r?\n/).map((line) => {
          const [name, price, category] = line.split('|').map((part) => part.trim());
          const parsedPrice = Number(price);
          if (!name || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
            throw new Error('Product entries must use “name | price | category”, one product per line.');
          }
          return { name, price: parsedPrice, category: category || 'Featured' };
        })
        : [];
      await api.post('/client/projects', {
        title: values.title,
        business_category: values.category,
        description: values.description,
        design_preferences: {
          colors: { primary: values.primaryColor, secondary: values.secondaryColor },
          sample_links: values.sampleLinks.split(/\s*,\s*/).filter(Boolean),
          features: values.features,
          tech_stack: values.techStack,
          target_platform: values.targetPlatform,
          languages: values.languages,
          auth_preference: values.authPreference,
          payment_methods: values.paymentMethods,
          urgency: values.urgency,
          theme: values.theme,
          template_archetype: values.templateArchetype,
          logo_url: values.logoUrl || null,
          font_preference: values.fontPreference || null,
          asset_links: values.assetLinks.split(/\s*,\s*/).filter(Boolean),
          photos: values.assetPhotos.split(/\s*,\s*/).filter(Boolean),
          content: values.heroText.trim() ? { hero_text: values.heroText.trim() } : {},
          sample_products: sampleProducts,
        },
      });
      intakeForm.reset();
      setNotice('Project submitted successfully.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const startVoiceDictation = () => {
    type SpeechRecognitionConstructor = new () => {
      lang: string;
      interimResults: boolean;
      onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      start: () => void;
    };
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice('Voice dictation is not supported by this browser.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = voiceLanguage;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) {
        const existing = intakeForm.getValues('description');
        intakeForm.setValue('description', `${existing}${existing ? ' ' : ''}${transcript}`, { shouldDirty: true });
      }
    };
    recognition.onerror = () => setNotice('Voice dictation failed. Check microphone permission and try again.');
    recognition.start();
  };

  const applySmartAutofill = () => {
    const description = intakeForm.getValues('description');
    const selectedCategory = intakeForm.getValues('category');
    const categoryHint = intakeForm.getFieldState('category').isDirty ? selectedCategory : '';
    const text = `${categoryHint} ${description}`.toLowerCase();
    const clothing = /\b(clothes?|clothing|kapde|kapda|fashion|boutique)\b|कपड़े|कपड़ों|कपडे|कपड़ा|कपडा/.test(text);
    const furniture = /\b(furniture|interior|sofa|furnishings?|ghar)\b|फर्नीचर|घर/.test(text);
    const kirana = /\b(kirana|grocery|grocer|dukan|dukaan|shop|store)\b|किराना|दुकान/.test(text);
    const features = new Set(suggestClientFeatures(intakeForm.getValues('category'), description));
    let category = intakeForm.getValues('category');
    let title = intakeForm.getValues('title');
    if (clothing) {
      category = 'Clothes';
      title = title.trim() || 'Clothing Shop App';
      features.add('Inventory');
      features.add('Online Payment');
    } else if (furniture) {
      category = 'Furniture / Interior';
      title = title.trim() || 'Furniture & Interior App';
      features.add('Inventory');
      features.add('Booking');
      features.add('Online Payment');
    } else if (kirana) {
      category = 'Kirana';
      title = title.trim() || 'Kirana Shop App';
      features.add('Inventory');
      features.add('Online Payment');
      if (/whatsapp|reminder|balance reminder|whats app|व्हाट्सएप/.test(text)) features.add('WhatsApp Bot');
    }
    if (/whatsapp|reminder|balance reminder|व्हाट्सएप/.test(text)) features.add('WhatsApp Bot');
    if (/bill|billing|invoice|payment|upi|भुगतान|बिल/.test(text)) features.add('Online Payment');
    if (/booking|appointment|reservation|book|अपॉइंटमेंट|बुकिंग/.test(text)) features.add('Booking');
    if (/dashboard|analytics|manage|प्रबंधन/.test(text)) features.add('Admin Panel');
    intakeForm.setValue('category', category, { shouldDirty: true });
    intakeForm.setValue('title', title, { shouldDirty: true });
    intakeForm.setValue('targetPlatform', 'Mobile PWA', { shouldDirty: true });
    intakeForm.setValue('features', [...features], { shouldDirty: true });
    setNotice('AI Smart Assistant filled in a suggested title, business type, mobile platform, and features. Review and edit these suggestions.');
  };

  const claimProject = async (projectId: string) => {
    setNotice('');
    try {
      const { data } = await api.post<DeveloperClaimResponse>(`/developer/projects/${projectId}/claim`);
      setStarterKit(data.starter_kit);
      setNotice('Project claimed. Download your generated sample_products.json and mock_content.json starter kit.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const submitEstimate = async (values: EstimateForm) => {
    if (!selectedProject) return;
    setNotice('');
    try {
      await api.post(`/admin/projects/${selectedProject.id}/estimate`, {
        client_budget: values.client_budget,
        developer_payout: values.developer_payout,
        monthly_maintenance_fee: values.monthly_maintenance_fee,
        milestone_titles: values.milestone_titles.split(',').map((title) => title.trim()).filter(Boolean),
      });
      setSelectedProject(null);
      setNotice('Estimate approved and project published.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const submitChangeRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changeProject) return;
    const form = new FormData(event.currentTarget);
    setNotice('');
    try {
      await api.post(`/client/projects/${changeProject.id}/change-requests`, {
        change_description: String(form.get('change_description') ?? ''),
        extra_cost: Number(form.get('extra_cost') ?? 0),
        developer_salary_bonus: Number(form.get('developer_salary_bonus') ?? 0),
        days_extension: Number(form.get('days_extension') ?? 0),
      });
      setChangeProject(null);
      setNotice('Scope-change request and proposed budget, salary bonus, and timeline submitted. Work is paused while the agency reviews the request.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const submitChangeQuote = async (values: { extra_cost: number; extra_developer_payout: number; timeline_extension_days: number }) => {
    if (!quoteRequest) return;
    try {
      await api.patch(`/admin/change-requests/${quoteRequest.id}/estimate`, values);
      setQuoteRequest(null);
      setNotice('Change request quote sent to the client.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const acceptChangeQuote = async (changeRequestId: string) => {
    try {
      await api.patch(`/client/change-requests/${changeRequestId}/approve`);
      setNotice('Change quote accepted. Updated project costs and schedule are now active.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const rejectChangeQuote = async (changeRequestId: string) => {
    try {
      await api.patch(`/client/change-requests/${changeRequestId}/reject`);
      setNotice('Change quote rejected. Development has resumed without changing the project budget.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const submitWork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submissionMilestone) return;
    try {
      await api.patch(`/developer/milestones/${submissionMilestone.id}/submit`, submissionUrls);
      setSubmissionMilestone(null);
      setSubmissionUrls({ staging_url: '', github_url: '' });
      setNotice('Milestone submitted for client review.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const submitClientFeedback = async (milestoneId: string, rating: number, review: string) => {
    try {
      await api.post(`/client/milestones/${milestoneId}/review`, { rating, feedback_note: review });
      setNotice('Thank you. Your milestone rating and review were recorded.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const releaseMilestonePayout = async (milestoneId: string, overrideRating = false) => {
    try {
      await api.post(`/admin/milestones/${milestoneId}/release-payout`, null, {
        params: overrideRating ? { override_rating: true } : undefined,
      });
      setNotice(overrideRating ? 'Admin override applied and milestone payout released.' : 'Milestone payout released to the developer wallet.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const openDiscussion = async (project: DashboardProject) => {
    try {
      const [chatResponse, noteResponse] = await Promise.all([
        api.get<ProjectMessage[]>(`/projects/${project.id}/messages`),
        api.get<PinpointNote[]>(`/projects/${project.id}/pinpoint-notes`),
      ]);
      setMessages(chatResponse.data);
      setPinpointNotes(noteResponse.data);
      setChatProject(project);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const openDeveloperWorkDesk = async (project: DashboardProject) => {
    try {
      const { data } = await api.get<PinpointNote[]>(`/projects/${project.id}/pinpoint-notes`);
      setPinpointNotes(data);
      setWorkProject(project);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const sendProjectMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chatProject || !messageDraft.trim()) return;
    try {
      const { data } = await api.post<ProjectMessage>(`/projects/${chatProject.id}/messages`, {
        message_text: messageDraft.trim(),
        attachment_url: messageAttachment.trim() || null,
      });
      setMessages((current) => [...current, data]);
      setMessageDraft('');
      setMessageAttachment('');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const updatePinpointStatus = async (note: PinpointNote) => {
    try {
      const status = note.status === 'PENDING' ? 'RESOLVED' : 'PENDING';
      await api.patch(`/developer/pinpoint-notes/${note.id}`, { status });
      setPinpointNotes((current) => current.map((item) => item.id === note.id ? { ...item, status } : item));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const openDocumentation = async (project: DashboardProject) => {
    try {
      const { data } = await api.get<DocumentationKit>(`/projects/${project.id}/documentation-kit`);
      setDocsKit(data);
      setDocsProject(project);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const downloadDocumentation = () => {
    if (!docsKit || !docsProject) return;
    const blob = new Blob([JSON.stringify(docsKit, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docsProject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-documentation-kit.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitPinpoint = async (event: MouseEvent<HTMLDivElement>) => {
    if (!pinpointMode || !previewProject) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const xPercent = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const yPercent = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    const feedbackNote = window.prompt('Describe the issue at this point:');
    if (!feedbackNote?.trim()) return;
    try {
      await api.post(`/client/projects/${previewProject.id}/pinpoint-notes`, {
        x_percent: Number(xPercent.toFixed(2)),
        y_percent: Number(yPercent.toFixed(2)),
        element_label: 'Staging preview',
        feedback_note: feedbackNote.trim(),
      });
      setNotice('Pinpoint QA feedback added to the developer checklist.');
      const { data } = await api.get<PinpointNote[]>(`/projects/${previewProject.id}/pinpoint-notes`);
      setPinpointNotes(data);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const fundProjectEscrow = async () => {
    if (!escrowProject) return;
    const toFund = (escrowProject.milestones ?? []).filter((milestone) =>
      ['AWAITING_ESCROW', 'PENDING'].includes(milestone.status),
    );
    try {
      for (const milestone of toFund) {
        await api.post(`/milestones/${milestone.id}/lock-escrow`);
      }
      setEscrowProject(null);
      setNotice(`₹${money(toFund.reduce((sum, milestone) => sum + milestone.payout_amount, 0))} simulated escrow funding confirmed.`);
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const toggleAutopay = async (subscription: MaintenanceSubscription) => {
    try {
      const { data } = await api.post<Pick<MaintenanceSubscription, 'auto_debit_enabled' | 'billing_status'>>(
        `/subscriptions/${subscription.id}/toggle-autopay`,
      );
      setSubscriptions((current) => current.map((item) => item.id === subscription.id ? { ...item, ...data } : item));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const downloadDeliverables = async (project: DashboardProject) => {
    try {
      const { data } = await api.get(`/projects/${project.id}/deliverables`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-deliverables.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const downloadStarterFile = (fileName: 'sample_products.json' | 'mock_content.json') => {
    if (!starterKit) return;
    const content = fileName === 'sample_products.json' ? starterKit.sample_products : starterKit.mock_content;
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const metrics = useMemo(() => {
    if (role === 'CLIENT') return [
      { label: 'My Projects', value: String(projects.length), icon: Rocket },
      { label: 'Average Progress', value: projects.length ? `${Math.round(projects.reduce((sum, project) => sum + project.progress_percentage, 0) / projects.length)}%` : '0%', icon: Gauge },
      { label: 'Monthly Maintenance', value: money(projects.reduce((sum, project) => sum + project.monthly_maintenance_fee, 0)), icon: CreditCard },
    ];
    if (role === 'DEVELOPER') return [
      { label: 'Available Projects', value: String(projects.length), icon: BriefcaseBusiness },
      { label: 'Escrow Balance', value: money(wallet?.escrow_balance ?? 0), icon: Wallet },
      { label: 'Wallet Balance', value: money(wallet?.wallet_balance ?? 0), icon: ShieldCheck },
    ];
    return [
      { label: 'Pending Submissions', value: String(pendingProjects.length), icon: FileText },
      { label: 'Total Revenue', value: money(financials?.total_revenue ?? 0), icon: DollarSign },
      { label: 'Net Margin', value: money(financials?.platform_net_profit ?? 0), icon: CheckCircle2 },
    ];
  }, [financials, pendingProjects.length, projects, role, wallet]);

  const renderHeader = () => (
    <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/30 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-violet-300">DevOrbit OS</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Freelance agency operating system</h1>
        {user && <p className="mt-1 text-sm text-slate-400">Signed in as {user.full_name} · {roleLabel(user.role)}</p>}
      </div>
      {user && (
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-slate-800 px-4 py-2 text-sm text-slate-300 md:self-auto">
          <LogOut className="h-4 w-4" /> Switch User / Logout
        </button>
      )}
    </header>
  );

  const renderMetrics = () => (
    <section className="mb-8 grid gap-4 md:grid-cols-3">
      {metrics.map(({ label, value, icon: Icon }, index) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08 }}
          whileHover={{ y: -4, scale: 1.01 }}
          className={`${panelClass} relative overflow-hidden before:absolute before:inset-0 before:-z-10 before:rounded-3xl before:bg-gradient-to-br before:from-violet-500/20 before:via-transparent before:to-cyan-400/10`}
        >
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Icon className="h-5 w-5" /></div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
        </motion.div>
      ))}
    </section>
  );

  const renderClient = () => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className={panelClass}>
        <div className="mb-5 flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-semibold text-white">Project intake</h2></div>
        <form className="space-y-5" onSubmit={intakeForm.handleSubmit(submitProject)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project title" error={intakeForm.formState.errors.title?.message}><input {...intakeForm.register('title')} className={fieldClass} /></Field>
            <Field label="Business category"><select {...intakeForm.register('category')} className={fieldClass}>{['Kirana', 'Restaurant', 'Clinic', 'Salon', 'Coaching', 'Portfolio', 'E-Commerce', 'Clothes', 'Furniture / Interior'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          </div>
          <Field label="Functional description" error={intakeForm.formState.errors.description?.message}>
            <textarea {...intakeForm.register('description')} rows={4} className={fieldClass} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" aria-label="Dictation language">
                <option value="en-IN">English</option><option value="hi-IN">Hindi</option><option value="mr-IN">Marathi</option>
              </select>
              <button type="button" onClick={startVoiceDictation} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200"><Mic className="mr-1 inline h-3.5 w-3.5" />Dictate</button>
              <button type="button" onClick={applySmartAutofill} className="rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1.5 text-xs text-violet-100"><Sparkles className="mr-1 inline h-3.5 w-3.5" />AI Smart Auto-Fill</button>
            </div>
          </Field>
          <motion.aside initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-violet-300/20 bg-gradient-to-r from-violet-500/10 to-cyan-500/5 p-4">
            <div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><div className="flex-1">
              <p className="text-sm font-medium text-white">AI Smart Assistant</p>
              <p className="mt-1 text-xs text-slate-400">Describe what you want in everyday English, Hindi, or Hinglish. Try “kapde ki shop ka app chahiye” or “ghar ke furniture ka online catalog”.</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{suggestedFeatures.map((feature) => <span key={feature} className="rounded-full bg-violet-400/10 px-2 py-1 text-[11px] text-violet-200">{feature}</span>)}</div>
              <button type="button" onClick={applySmartAutofill} className="mt-3 text-xs font-medium text-violet-200 underline decoration-violet-300/40 underline-offset-4">Auto-fill title, business type, platform &amp; features</button>
            </div></div>
          </motion.aside>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 text-white"><Palette className="h-4 w-4 text-violet-300" /><h3 className="font-medium">Design studio · live palette</h3></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {themes.map((theme) => (
                <motion.button
                  key={theme.name}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    intakeForm.setValue('theme', theme.name, { shouldDirty: true });
                    intakeForm.setValue('primaryColor', theme.primary, { shouldDirty: true });
                    intakeForm.setValue('secondaryColor', theme.secondary, { shouldDirty: true });
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selectedThemeName === theme.name ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:border-white/20'}`}
                >
                  <span className="flex -space-x-1"><i className="h-6 w-6 rounded-full border-2 border-slate-900" style={{ backgroundColor: theme.primary }} /><i className="h-6 w-6 rounded-full border-2 border-slate-900" style={{ backgroundColor: theme.secondary }} /></span>
                  <span className="text-sm text-slate-200">{theme.name}</span>
                  {selectedThemeName === theme.name && <Check className="ml-auto h-4 w-4 text-violet-300" />}
                </motion.button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr]">
              <Field label="Custom primary hex"><input type="color" {...intakeForm.register('primaryColor')} onChange={(event) => { intakeForm.setValue('primaryColor', event.target.value, { shouldDirty: true }); intakeForm.setValue('theme', 'Custom', { shouldDirty: true }); }} className={`${fieldClass} h-11 p-1`} /></Field>
              <Field label="Custom accent hex"><input type="color" {...intakeForm.register('secondaryColor')} onChange={(event) => { intakeForm.setValue('secondaryColor', event.target.value, { shouldDirty: true }); intakeForm.setValue('theme', 'Custom', { shouldDirty: true }); }} className={`${fieldClass} h-11 p-1`} /></Field>
              <motion.div
                key={`${selectedThemeName}-${selectedArchetype}`}
                initial={{ opacity: 0.6, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="overflow-hidden rounded-xl border p-3"
                style={{ borderColor: `${intakeForm.watch('primaryColor')}88`, background: `linear-gradient(135deg, ${intakeForm.watch('primaryColor')}24, ${intakeForm.watch('secondaryColor')}18, ${selectedTheme.surface})` }}
              >
                <div className="flex items-center justify-between text-xs text-white/70"><span>{selectedThemeName}</span><span>{selectedArchetype}</span></div>
                <div className="mt-3 h-2 w-1/2 rounded-full" style={{ backgroundColor: intakeForm.watch('primaryColor') }} />
                <div className="mt-2 flex gap-2"><i className="h-8 flex-1 rounded-md bg-white/10" /><i className="h-8 w-1/3 rounded-md" style={{ backgroundColor: `${intakeForm.watch('secondaryColor')}88` }} /></div>
                <span className="mt-2 inline-block rounded-full px-2 py-1 text-[10px] font-medium text-slate-950" style={{ backgroundColor: intakeForm.watch('primaryColor') }}>Preview card</span>
                <button type="button" onClick={() => setVirtualPreviewOpen(true)} className="mt-3 block rounded-full border border-white/20 px-3 py-1.5 text-[11px] text-white">Open virtual experience</button>
              </motion.div>
            </div>
            <div>
              <p className="mb-2 text-sm text-slate-300">Choose a template archetype</p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {archetypes.map(({ name, detail, icon: Icon }) => (
                  <motion.button key={name} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} type="button" onClick={() => intakeForm.setValue('templateArchetype', name, { shouldDirty: true })} className={`rounded-xl border p-3 text-left transition ${selectedArchetype === name ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 bg-slate-900/70 hover:border-white/20'}`}>
                    <Icon className="mb-2 h-4 w-4" style={{ color: intakeForm.watch('primaryColor') }} />
                    <span className="block text-xs font-medium text-white">{name}</span><span className="mt-1 block text-[10px] text-slate-400">{detail}</span>
                  </motion.button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Hero text (optional)"><input {...intakeForm.register('heroText')} className={fieldClass} placeholder="We will suggest editable text if blank" /></Field>
              <Field label="Photo URLs (comma separated, optional)"><input {...intakeForm.register('assetPhotos')} className={fieldClass} placeholder="https://... (fallback images used if blank)" /></Field>
              <Field label="Product catalog (one per line: name | price | category)">
                <textarea {...intakeForm.register('sampleProducts')} rows={3} className={fieldClass} placeholder={'Cotton Kurta | 1299 | Clothing'} />
              </Field>
              <p className="self-center text-xs leading-5 text-slate-400">Missing photos, copy, or catalog? DevOrbit adds category-specific editable placeholders, demo products, and sample map coordinates.</p>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Target platform"><select {...intakeForm.register('targetPlatform')} className={fieldClass}><option>Web App</option><option>Mobile PWA</option><option>Desktop</option></select></Field>
            <Field label="Authentication preference"><select {...intakeForm.register('authPreference')} className={fieldClass}><option>Email</option><option>Phone OTP</option></select></Field>
            <Field label="Project urgency"><select {...intakeForm.register('urgency')} className={fieldClass}><option value="STANDARD">Standard timeline</option><option value="URGENT">Urgent</option><option value="ASAP">ASAP</option></select></Field>
            <Field label="Reference URLs (comma separated)"><input {...intakeForm.register('sampleLinks')} className={fieldClass} placeholder="https://example.com" /></Field>
            <Field label="Logo URL"><input type="url" {...intakeForm.register('logoUrl')} className={fieldClass} placeholder="https://example.com/logo.png" /></Field>
            <Field label="Typography preference"><input {...intakeForm.register('fontPreference')} className={fieldClass} placeholder="e.g. clean geometric sans-serif" /></Field>
            <Field label="Attached asset URLs (comma separated)"><input {...intakeForm.register('assetLinks')} className={fieldClass} placeholder="https://example.com/brand-guide.pdf" /></Field>
          </div>
          <CheckGroup label="Languages" options={['English', 'Hindi', 'Marathi']} name="languages" register={intakeForm.register} />
          <CheckGroup label="Payment methods" options={['UPI', 'Credit/Debit Card', 'Net Banking', 'Cash on Delivery']} name="paymentMethods" register={intakeForm.register} />
          <CheckGroup label="Requested features" options={['Online Payment', 'WhatsApp Bot', 'Admin Panel', 'Inventory', 'Booking', 'Analytics']} name="features" register={intakeForm.register} />
          <CheckGroup label="Preferred technology stack" options={['React', 'FastAPI', 'Python', 'Tailwind', 'PostgreSQL', 'Docker']} name="techStack" register={intakeForm.register} />
          <p className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100">First month maintenance is included in onboarding. Recurring recharge begins after 30 days.</p>
          <button disabled={loading} type="submit" className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 font-medium text-white disabled:opacity-60">
            Submit project <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>
      <section id="projects" className={`${panelClass} space-y-5`}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Project tracking</h2><span className="text-xs uppercase tracking-wider text-violet-300">Live data</span></div>
        {subscriptions.map((subscription) => {
          const project = projects.find((item) => item.id === subscription.project_id);
          const days = Math.max(0, Math.ceil((new Date(subscription.next_billing_date).getTime() - currentTime) / 86_400_000));
          return <div key={subscription.id} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-white">Maintenance retainer · {project?.title ?? 'Project'}</p><p className="mt-1 text-xs text-slate-300">{money(subscription.monthly_amount)}/month · renews in {days} day{days === 1 ? '' : 's'}</p></div>
              <button type="button" onClick={() => void toggleAutopay(subscription)} className={`rounded-full px-3 py-2 text-xs font-medium ${subscription.auto_debit_enabled ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-800 text-slate-300'}`}>{subscription.auto_debit_enabled ? 'UPI Autopay · Active' : 'Enable Auto-Recharge'}</button>
            </div>
          </div>;
        })}
        {projects.length === 0 ? <p className="text-sm text-slate-400">Your submitted projects will appear here.</p> : projects.map((project) => {
          const activeMilestone = project.milestones?.find((milestone) => ['IN_PROGRESS', 'SUBMITTED', 'ESCROW_LOCKED'].includes(milestone.status)) ?? project.milestones?.find((milestone) => ['AWAITING_ESCROW', 'PENDING'].includes(milestone.status));
          const awaitingEscrow = project.milestones?.some((milestone) => ['AWAITING_ESCROW', 'PENDING'].includes(milestone.status));
          const escrow = lockedEscrow(project);
          const released = isProjectReleased(project);
          return (
            <motion.article key={project.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-white">{project.title}</h3><p className="text-sm text-slate-400">{project.business_category} · {project.status}</p></div><span className="text-sm font-medium text-violet-200">{project.progress_percentage}%</span></div>
              <div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-400" style={{ width: `${Math.min(100, Math.max(0, project.progress_percentage))}%` }} /></div>
              <p className="mt-3 text-sm text-slate-300">Active milestone: {activeMilestone?.title ?? (project.status === 'COMPLETED' ? 'Completed' : 'Awaiting estimate')}</p>
              {!!project.milestones?.length && <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/50 p-3">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Delivery roadmap</p>
                <ol className="flex min-w-max items-start">
                  {project.milestones.map((milestone, index) => {
                    const completed = milestone.status === 'PAID';
                    const current = !completed && milestone === activeMilestone;
                    return <li key={milestone.id} className="relative flex w-36 flex-col items-start pr-4">
                      {index < (project.milestones?.length ?? 0) - 1 && <span className={`absolute left-3 top-3 h-0.5 w-full ${completed ? 'bg-emerald-400' : 'bg-slate-700'}`} />}
                      <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${completed ? 'border-emerald-300 bg-emerald-400 text-slate-950' : current ? 'border-violet-300 bg-violet-500 text-white' : 'border-slate-600 bg-slate-900 text-slate-400'}`}>{completed ? '✓' : index + 1}</span>
                      <span className={`mt-2 text-xs font-medium ${completed ? 'text-emerald-200' : current ? 'text-violet-200' : 'text-slate-300'}`}>{milestone.title}</span>
                      <span className="mt-1 text-[10px] text-slate-500">{completed ? 'Completed' : current ? `Active · ${milestoneCountdown(milestone, currentTime)}` : `${milestone.status.replace(/_/g, ' ')} · ${milestoneCountdown(milestone, currentTime)}`}</span>
                    </li>;
                  })}
                </ol>
              </div>}
              {project.design_preferences.asset_fallback?.is_placeholder && <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/5 p-3">
                <p className="text-xs font-medium text-amber-100">Editable starter assets · placeholders</p>
                <p className="mt-1 text-xs text-slate-300">{project.design_preferences.asset_fallback.hero_text}</p>
                {project.design_preferences.asset_fallback.images[0] && <img src={project.design_preferences.asset_fallback.images[0]} alt="Editable sample project image" loading="lazy" className="mt-2 h-28 w-full rounded-lg object-cover" />}
                <div className="mt-2 flex flex-wrap gap-2">{project.design_preferences.asset_fallback.sample_products.slice(0, 3).map((product) => <span key={product.name} className="rounded-full bg-slate-900 px-2 py-1 text-[10px] text-slate-300">{product.name} · {money(product.price)}</span>)}</div>
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-500"><MapPin className="h-3 w-3" />Editable sample coordinates: {project.design_preferences.asset_fallback.map_coordinates.latitude}, {project.design_preferences.asset_fallback.map_coordinates.longitude}</span>
              </div>}
              {escrow > 0 && <p className="mt-3 inline-flex rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-200">₹{money(escrow)} Locked in DevOrbit Escrow · Safe to Build</p>}
              {awaitingEscrow && <button type="button" onClick={() => setEscrowProject(project)} className="mt-3 mr-2 rounded-full bg-emerald-500 px-3 py-2 text-xs font-medium text-slate-950">Fund Escrow</button>}
              {project.staging_preview_url && <button type="button" onClick={() => { setPreviewProject(project); setPinpointMode(false); }} className="mt-2 inline-block rounded-full border border-violet-300/30 px-3 py-1.5 text-xs text-violet-200">Open watermarked preview</button>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void openDiscussion(project)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200"><MessageCircle className="mr-1 inline h-3.5 w-3.5" />Discussion &amp; Assets</button>
                <button type="button" onClick={() => void openDocumentation(project)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200">Documentation Suite</button>
                <button type="button" disabled={!released} onClick={() => void downloadDeliverables(project)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Download source &amp; keys</button>
              </div>
              {project.status === 'IN_PROGRESS' && <p className="mt-2 text-xs text-slate-500">Scope Lock Active: Extra feature requests must be raised via “Request Change”.</p>}
              {project.status === 'IN_PROGRESS' && <button type="button" onClick={() => setChangeProject(project)} className="mt-3 rounded-full border border-violet-300/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-400/10">Request scope change</button>}
              {project.change_requests?.map((request) => <div key={request.id} className="mt-3 rounded-xl border border-white/10 bg-slate-900/80 p-3 text-xs">
                <p className="font-medium text-white">Scope request · {request.status}</p><p className="mt-1 text-slate-300">{request.change_description}</p>
                {request.status === 'QUOTED' && <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span>+{money(request.extra_cost)} client cost · +{money(request.extra_developer_payout)} developer bonus · +{request.timeline_extension_days} days</span><div className="flex gap-2"><button type="button" onClick={() => void rejectChangeQuote(request.id)} className="rounded-full bg-rose-500/15 px-3 py-1.5 text-rose-200">Reject</button><button type="button" onClick={() => void acceptChangeQuote(request.id)} className="rounded-full bg-emerald-500/20 px-3 py-1.5 text-emerald-200">Accept quote</button></div></div>}
              </div>)}
              {project.milestones?.filter((milestone) => milestone.status === 'SUBMITTED').map((milestone) => (
                <MilestoneFeedbackForm key={milestone.id} milestone={milestone} onSubmit={submitClientFeedback} />
              ))}
            </motion.article>
          );
        })}
      </section>
    </motion.div>
  );

  const renderDeveloper = () => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section id="available-gigs" className={panelClass}>
        <h2 className="mb-5 text-xl font-semibold text-white">Available projects</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {user && user.rating >= 4.8 && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-200"><Star className="mr-1 inline h-3 w-3" />Top Rated</span>}
          {user && <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">Verified Stack</span>}
          {activeProjects.some((project) => project.milestones?.some((milestone) => milestone.completed_at && milestone.due_at && new Date(milestone.completed_at) < new Date(milestone.due_at))) && <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">Fast Deliverer</span>}
        </div>
        <div className="space-y-4">
          {projects.length === 0 && <p className="text-sm text-slate-400">No matching projects are currently available.</p>}
          {projects.map((project) => <ProjectItem key={project.id} project={project} action={project.match_percentage !== undefined && project.match_percentage < 80
            ? <div className="text-right"><span className="block rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300">Locked: Requires &gt;=80% match</span><button disabled type="button" className="mt-2 cursor-not-allowed rounded-full bg-slate-700 px-4 py-2 text-sm text-slate-400">Claim Project</button></div>
            : <div className="text-right"><span className="mb-2 block rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">{project.match_percentage ?? 0}% Match</span><button type="button" onClick={() => void claimProject(project.id)} className="rounded-full bg-violet-500 px-4 py-2 text-sm font-medium text-white">Claim Project</button></div>} />)}
        </div>
      </section>
      <div className="space-y-6">
        <section id="wallet" className={panelClass}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Wallet</h2><Wallet className="h-5 w-5 text-violet-300" /></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Balance label="Available balance" value={wallet?.wallet_balance ?? 0} />
            <Balance label="Escrow balance" value={wallet?.escrow_balance ?? 0} />
          </div>
        </section>
        <section id="active-gigs" className={panelClass}>
          <h2 className="mb-4 text-xl font-semibold text-white">Active projects</h2>
          {activeProjects.length === 0 ? <p className="text-sm text-slate-400">Projects you claim will appear here.</p> : activeProjects.map((project) => <ProjectItem key={project.id} project={project} action={<div className="text-right"><span className="mb-2 block rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-200">₹{money(lockedEscrow(project))} Locked · Safe to Build</span><button type="button" onClick={() => void openDeveloperWorkDesk(project)} className="rounded-full border border-violet-300/30 px-4 py-2 text-sm text-violet-200">Open Work Desk</button></div>} />)}
        </section>
      </div>
    </motion.div>
  );

  const renderAdmin = () => (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section id="projects" className={panelClass}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Pending submissions</h2><span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200">{pendingProjects.length} pending</span></div>
        <div className="space-y-4">
          {pendingProjects.length === 0 && <p className="text-sm text-slate-400">No submissions waiting for an estimate.</p>}
          {pendingProjects.map((project) => <ProjectItem key={project.id} project={project} action={<button type="button" onClick={() => {
            const recommended = project.design_preferences.recommended_estimate;
            estimateForm.reset({
              client_budget: recommended?.client_budget ?? project.client_budget ?? 0,
              developer_payout: recommended?.developer_payout ?? project.developer_payout ?? 0,
              monthly_maintenance_fee: recommended?.monthly_maintenance_fee ?? project.monthly_maintenance_fee ?? 0,
              milestone_titles: 'Discovery, Design, Development, QA',
            });
            setSelectedProject(project);
          }} className="rounded-full bg-violet-500 px-4 py-2 text-sm font-medium text-white">Estimate &amp; Approve</button>} />)}
        </div>
        <div className="mt-7 border-t border-white/10 pt-5">
          <h3 className="mb-3 font-semibold text-rose-200">SLA risk alerts</h3>
          {slaRisks.length === 0 ? <p className="text-sm text-slate-400">No overdue milestones.</p> : slaRisks.map((risk) => <div key={risk.milestone_id} className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-500/5 p-4">
            <p className="text-sm font-medium text-rose-100">SLA Risk · {risk.project_title} / {risk.milestone_title}</p>
            <p className="mt-1 text-xs text-slate-300">Developer: {risk.developer_name} · due {new Date(risk.due_at).toLocaleString()} · late rating deduction applied once</p>
          </div>)}
        </div>
        <div className="mt-7 border-t border-white/10 pt-5">
          <h3 className="mb-3 font-semibold text-white">Scope-change quotes</h3>
          {pendingChanges.length === 0 ? <p className="text-sm text-slate-400">No change requests need quotes.</p> : pendingChanges.map((request) => <div key={request.id} className="mb-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <p className="font-medium text-white">{request.change_description}</p><p className="mt-1 text-xs text-slate-400">Project {request.project_id}</p>
            <button type="button" onClick={() => { quoteForm.reset({ extra_cost: request.extra_cost, extra_developer_payout: request.extra_developer_payout, timeline_extension_days: request.timeline_extension_days }); setQuoteRequest(request); }} className="mt-3 rounded-full bg-violet-500 px-4 py-2 text-sm text-white">Set quote &amp; timeline</button>
          </div>)}
        </div>
        <div className="mt-7 border-t border-white/10 pt-5">
          <h3 className="mb-3 font-semibold text-white">Milestone payout gate</h3>
          {submittedMilestones.length === 0 ? <p className="text-sm text-slate-400">No submitted milestones are awaiting review.</p> : submittedMilestones.map((milestone) => <div key={milestone.id} className="mb-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-white">{milestone.project_title} · {milestone.title}</p><p className="mt-1 text-sm text-slate-400">Payout {money(milestone.payout_amount)}</p></div>
              {milestone.client_rating !== null && milestone.client_rating >= 4
                ? <button type="button" disabled={!milestone.client_review} onClick={() => void releaseMilestonePayout(milestone.id)} className="rounded-full bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">Release payout</button>
                : <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-amber-200">{milestone.client_rating === null ? 'Awaiting client rating' : `Quality gate: ${milestone.client_rating}/5 · requires 4+`}</span>
                  {milestone.client_rating !== null && <button type="button" disabled={!milestone.client_review} onClick={() => {
                    if (window.confirm('Override the minimum 4-star quality gate and release this payout?')) void releaseMilestonePayout(milestone.id, true);
                  }} className="rounded-full border border-rose-300/30 px-3 py-2 text-xs text-rose-200 disabled:opacity-50">Admin override &amp; release</button>}
                </div>}
            </div>
            {milestone.client_rating !== null && <p className="mt-2 text-sm text-amber-200">{'★'.repeat(milestone.client_rating)}{'☆'.repeat(5 - milestone.client_rating)} · {milestone.client_review}</p>}
          </div>)}
        </div>
      </section>
      <section className={panelClass}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Financial overview</h2><Building2 className="h-5 w-5 text-violet-300" /></div>
        <div className="space-y-4 text-sm text-slate-300">
          <FinancialRow label="Total revenue" value={financials?.total_revenue ?? 0} />
          <FinancialRow label="Developer payouts" value={financials?.total_paid_to_developers ?? 0} />
          <FinancialRow label="Platform net profit" value={financials?.platform_net_profit ?? 0} />
          <FinancialRow label="Maintenance contracts" value={financials?.active_maintenance_contracts ?? 0} />
        </div>
      </section>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div id="home" className="mx-auto max-w-7xl px-4 pb-24 pt-8 md:px-6 md:pb-8 lg:px-8">
        {renderHeader()}
        {notice && <div role="status" className="mb-5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}
        {!user ? (
          <div className={`${panelClass} text-center`}><h2 className="text-xl font-semibold text-white">Sign in to DevOrbit</h2><p className="mt-2 text-slate-400">Authenticate to load your role-specific dashboard.</p><button type="button" onClick={() => setAuthOpen(true)} className="mt-5 rounded-full bg-violet-500 px-5 py-2.5 font-medium text-white">Login or Register</button></div>
        ) : (
          <>
            {renderMetrics()}
            {loading && <p className="mb-4 text-sm text-slate-400">Loading dashboard…</p>}
            {role === 'CLIENT' ? renderClient() : role === 'DEVELOPER' ? renderDeveloper() : renderAdmin()}
          </>
        )}
        <footer className="mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-500">
          {['Privacy Policy', 'Terms of Service · Escrow Rules', 'Agency Support'].map((page) => <button key={page} type="button" onClick={() => setLegalPage(page)} className="hover:text-violet-200">{page}</button>)}
        </footer>
      </div>

      {user && <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-slate-950/95 px-2 py-2 backdrop-blur-xl md:hidden">
        <MobileNavButton icon={<Rocket className="h-4 w-4" />} label="Home" onClick={() => document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' })} />
        <MobileNavButton icon={<BriefcaseBusiness className="h-4 w-4" />} label={role === 'DEVELOPER' ? 'Active Gigs' : 'Projects'} onClick={() => document.getElementById(role === 'DEVELOPER' ? 'active-gigs' : 'projects')?.scrollIntoView({ behavior: 'smooth' })} />
        <MobileNavButton icon={<MessageCircle className="h-4 w-4" />} label="Messages" onClick={() => {
          const project = role === 'DEVELOPER' ? activeProjects[0] : projects[0];
          if (project) void openDiscussion(project);
          else setNotice('No project is available for discussion yet.');
        }} />
        <MobileNavButton icon={<Wallet className="h-4 w-4" />} label={role === 'CLIENT' ? 'Invoices' : 'Wallet'} onClick={() => document.getElementById(role === 'DEVELOPER' ? 'wallet' : 'projects')?.scrollIntoView({ behavior: 'smooth' })} />
      </nav>}

      {authOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div><p className="text-xs uppercase tracking-[0.25em] text-violet-300">DevOrbit OS</p><h2 id="auth-title" className="mt-2 text-2xl font-semibold text-white">{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h2></div>
              {user && <button type="button" onClick={() => setAuthOpen(false)} className="text-sm text-slate-400">Close</button>}
            </div>
            <div className="mb-5 flex rounded-full bg-slate-950 p-1">
              {(['login', 'register'] as const).map((mode) => <button key={mode} type="button" onClick={() => { setAuthMode(mode); setAuthError(''); }} className={`flex-1 rounded-full px-4 py-2 text-sm capitalize ${authMode === mode ? 'bg-violet-500 text-white' : 'text-slate-400'}`}>{mode}</button>)}
            </div>
            <form className="space-y-4" onSubmit={authForm.handleSubmit(submitAuth)}>
              {authMode === 'register' && <>
                <Field label="Full name"><input {...authForm.register('full_name')} className={fieldClass} /></Field>
                <Field label="Phone number"><input {...authForm.register('phone_number')} className={fieldClass} /></Field>
              </>}
              <Field label="Account role"><select {...authForm.register('role')} className={fieldClass}><option value="CLIENT">Client</option><option value="DEVELOPER">Developer</option>{authMode === 'login' && <option value="ADMIN">Admin</option>}</select></Field>
              <Field label="Email"><input type="email" {...authForm.register('email')} className={fieldClass} /></Field>
              <Field label="Password"><input type="password" {...authForm.register('password')} className={fieldClass} /></Field>
              {authMode === 'register' && <>
                {authForm.watch('role') === 'DEVELOPER' && <>
                  <Field label="Skills (comma separated)"><input {...authForm.register('skills')} className={fieldClass} placeholder="React, Python, UI/UX" /></Field>
                  <Field label="Experience level"><select {...authForm.register('experience')} className={fieldClass}><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="EXPERT">Expert</option></select></Field>
                </>}
              </>}
              {authError && <p role="alert" className="text-sm text-rose-300">{authError}</p>}
              <button disabled={loading} className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white disabled:opacity-60" type="submit">{loading ? 'Please wait…' : authMode === 'login' ? 'Login' : 'Register & Login'}</button>
            </form>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="estimate-title">
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm text-slate-400">Estimate project</p><h2 id="estimate-title" className="text-xl font-semibold text-white">{selectedProject.title}</h2></div><button type="button" onClick={() => setSelectedProject(null)} className="text-slate-400">Close</button></div>
                {selectedProject.design_preferences.recommended_estimate && <div className="mb-4 rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-sm text-violet-100">
                  <p className="font-medium">AI heuristic recommendation · {selectedProject.design_preferences.recommended_estimate.urgency} ×{selectedProject.design_preferences.recommended_estimate.urgency_multiplier}</p>
                  <p className="mt-1 text-violet-100/80">Budget {money(selectedProject.design_preferences.recommended_estimate.client_budget)} · Developer payout {money(selectedProject.design_preferences.recommended_estimate.developer_payout)} · Maintenance {money(selectedProject.design_preferences.recommended_estimate.monthly_maintenance_fee)}/mo</p>
                </div>}
                <form className="space-y-4" onSubmit={estimateForm.handleSubmit(submitEstimate)}>
              <Field label="Client budget (₹)"><input type="number" min="0.01" step="0.01" {...estimateForm.register('client_budget')} className={fieldClass} /></Field>
              <Field label="Developer payout (₹)"><input type="number" min="0.01" step="0.01" {...estimateForm.register('developer_payout')} className={fieldClass} /></Field>
              <Field label="Monthly maintenance fee (₹)"><input type="number" min="0" step="0.01" {...estimateForm.register('monthly_maintenance_fee')} className={fieldClass} /></Field>
              <Field label="Milestone titles (comma separated)"><textarea rows={3} {...estimateForm.register('milestone_titles')} className={fieldClass} /></Field>
              <button disabled={loading} type="submit" className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white disabled:opacity-60">Estimate &amp; Approve</button>
            </form>
      </motion.div>
        </div>
      )}

      {workProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="work-desk-title">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="my-6 w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-violet-300">Developer work desk</p><h2 id="work-desk-title" className="mt-1 text-2xl font-semibold text-white">{workProject.title}</h2></div><button type="button" onClick={() => setWorkProject(null)} className="text-slate-400">Close</button></div>
            <div className="mb-5 rounded-xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100">Scope Lock Active: Extra feature requests must be raised via “Request Change”.</div>
            <div className="mb-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void openDiscussion(workProject)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-200"><MessageCircle className="mr-1 inline h-3.5 w-3.5" />Discussion &amp; Assets</button>
              <button type="button" onClick={() => void openDocumentation(workProject)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-200">Documentation Suite</button>
              <button type="button" disabled={!isProjectReleased(workProject)} onClick={() => void downloadDeliverables(workProject)} className="rounded-full border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Download source &amp; keys</button>
              {workProject.staging_preview_url && <button type="button" onClick={() => { setPreviewProject(workProject); setPinpointMode(false); }} className="rounded-full border border-violet-300/30 px-3 py-2 text-xs text-violet-200">Staging Preview</button>}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <h3 className="font-medium text-white">Project requirements</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{workProject.description || 'No additional description supplied.'}</p>
                <p className="mt-3 text-xs text-slate-400">Category · {workProject.business_category}</p>
                <p className="mt-1 text-xs text-slate-400">Platform · {String(workProject.design_preferences.target_platform ?? 'Web App')} · Auth · {String(workProject.design_preferences.auth_preference ?? 'Not specified')}</p>
                <p className="mt-1 text-xs text-slate-400">Languages · {(workProject.design_preferences.languages ?? []).join(', ') || 'Not specified'}</p>
                <p className="mt-1 text-xs text-slate-400">Payment methods · {(workProject.design_preferences.payment_methods ?? []).join(', ') || 'Not specified'}</p>
                <p className="mt-1 text-xs text-slate-400">Template · {String(workProject.design_preferences.template_archetype ?? 'Not specified')} · Theme · {String(workProject.design_preferences.theme ?? 'Not specified')}</p>
                <p className="mt-1 text-xs text-slate-400">Client budget · {money(workProject.client_budget)} · Payout pool · {money(workProject.developer_payout)}</p>
                <p className="mt-1 text-xs text-slate-400">Approved timeline extensions · {String(workProject.design_preferences.timeline_extension_days ?? 0)} days</p>
                <div className="mt-3 flex flex-wrap gap-2">{(workProject.design_preferences.features ?? []).map((feature) => <span key={feature} className="rounded-full bg-violet-400/10 px-2.5 py-1 text-xs text-violet-200">{feature}</span>)}</div>
                <div className="mt-3 flex flex-wrap gap-2">{(workProject.design_preferences.tech_stack ?? []).map((skill) => <span key={skill} className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200">{skill}</span>)}</div>
              </section>
              <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <h3 className="font-medium text-white">Client palette &amp; assets</h3>
                <div className="mt-3 flex flex-wrap gap-3">{Object.entries(workProject.design_preferences.colors ?? {}).map(([name, hex]) => <div key={name} className="flex items-center gap-2 text-xs text-slate-300"><i className="h-7 w-7 rounded-lg border border-white/20" style={{ backgroundColor: hex }} /><span>{name}: {hex}</span></div>)}</div>
                <h4 className="mt-4 text-sm text-slate-300">Reference / asset links</h4>
                {(workProject.design_preferences.sample_links ?? []).length === 0 ? <p className="mt-1 text-xs text-slate-500">No links provided.</p> : (workProject.design_preferences.sample_links ?? []).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 break-all text-xs text-violet-300 underline"><ExternalLink className="h-3 w-3 shrink-0" />{url}</a>)}
              </section>
            </div>
            <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <h3 className="mb-3 font-medium text-white">Milestones · escrow &amp; SLA status</h3>
              {!workProject.milestones?.length ? <p className="text-sm text-slate-400">No milestones are configured yet.</p> : <div className="space-y-3">{workProject.milestones.map((milestone) => <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
              <div><p className="text-sm font-medium text-white">{milestone.title}</p><p className="mt-1 text-xs text-slate-400">Escrow {money(milestone.payout_amount)} · {milestone.status === 'PAID' ? 'Released to wallet' : milestone.status === 'SUBMITTED' ? milestone.client_rating ? 'Client feedback captured · admin release pending' : 'Submitted · awaiting client feedback' : milestone.escrow_locked ? 'Locked · safe to build' : 'Awaiting escrow'}</p>
                <p className={`mt-1 text-xs ${milestone.due_at && new Date(milestone.due_at).getTime() <= currentTime ? 'text-rose-300' : 'text-amber-200'}`}>{slaCountdown(milestone.due_at, currentTime)} · {milestone.sla_hours}h SLA</p>
                {milestone.staging_url && <a href={milestone.staging_url} target="_blank" rel="noreferrer" className="mr-3 text-xs text-violet-300 underline">Staging</a>}
                {milestone.github_url && <a href={milestone.github_url} target="_blank" rel="noreferrer" className="text-xs text-violet-300 underline">Repository</a>}
              </div>
              {milestone.status === 'IN_PROGRESS' && <button type="button" onClick={() => { setSubmissionMilestone(milestone); setSubmissionUrls({ staging_url: '', github_url: '' }); }} className="rounded-full bg-violet-500 px-3 py-2 text-xs font-medium text-white">Submit milestone</button>}
              </div>)}</div>}
            </section>
            <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <h3 className="mb-3 font-medium text-white">Pinpoint QA checklist</h3>
              {pinpointNotes.length === 0 ? <p className="text-sm text-slate-400">No pinpoint feedback yet.</p> : <div className="space-y-2">{pinpointNotes.map((note) => <div key={note.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/10 p-3">
              <div><p className="text-sm text-white">{note.element_label} · ({note.x_percent}%, {note.y_percent}%)</p><p className="mt-1 text-xs text-slate-300">{note.feedback_note}</p></div>
              <button type="button" onClick={() => void updatePinpointStatus(note)} className={`rounded-full px-3 py-1.5 text-xs ${note.status === 'RESOLVED' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-100'}`}>{note.status === 'RESOLVED' ? 'Resolved · reopen' : 'Pending · mark resolved'}</button>
              </div>)}</div>}
            </section>
          </motion.div>
        </div>
      )}

      {submissionMilestone && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="submission-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm text-slate-400">Submit work for review</p><h2 id="submission-title" className="text-xl font-semibold text-white">{submissionMilestone.title}</h2></div><button type="button" onClick={() => setSubmissionMilestone(null)} className="text-slate-400">Close</button></div>
            <form className="space-y-4" onSubmit={submitWork}>
              <Field label="Live staging URL"><input type="url" required value={submissionUrls.staging_url} onChange={(event) => setSubmissionUrls({ ...submissionUrls, staging_url: event.target.value })} className={fieldClass} placeholder="https://staging.example.com" /></Field>
              <Field label="GitHub repository URL"><input type="url" required value={submissionUrls.github_url} onChange={(event) => setSubmissionUrls({ ...submissionUrls, github_url: event.target.value })} className={fieldClass} placeholder="https://github.com/org/repo" /></Field>
              <button type="submit" className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white">Submit for client review</button>
            </form>
          </div>
        </div>
      )}

      {changeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="change-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm text-slate-400">Scope escalation</p><h2 id="change-title" className="text-xl font-semibold text-white">{changeProject.title}</h2></div><button type="button" onClick={() => setChangeProject(null)} className="text-slate-400">Close</button></div>
            <p className="mb-4 text-sm text-amber-200">Development will pause until the agency quotes the change and you accept or reject the quote.</p>
            <form className="space-y-4" onSubmit={(event) => void submitChangeRequest(event)}>
              <Field label="Describe the extra work"><textarea name="change_description" required minLength={5} rows={4} className={fieldClass} placeholder="Explain what should be added or changed..." /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Extra client cost (₹)"><input name="extra_cost" type="number" min="0" step="0.01" defaultValue="0" required className={fieldClass} /></Field>
                <Field label="Developer salary bonus (₹)"><input name="developer_salary_bonus" type="number" min="0" step="0.01" defaultValue="0" required className={fieldClass} /></Field>
                <Field label="Days extension"><input name="days_extension" type="number" min="0" max="365" defaultValue="0" required className={fieldClass} /></Field>
              </div>
              <button type="submit" className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white">Submit scope-change request</button>
            </form>
          </div>
        </div>
      )}

      {quoteRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="quote-title">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm text-slate-400">Change request quote</p><h2 id="quote-title" className="text-xl font-semibold text-white">{quoteRequest.change_description}</h2></div><button type="button" onClick={() => setQuoteRequest(null)} className="text-slate-400">Close</button></div>
            <form className="space-y-4" onSubmit={quoteForm.handleSubmit(submitChangeQuote)}>
              <Field label="Extra client cost (₹)"><input type="number" min="0" step="0.01" {...quoteForm.register('extra_cost', { valueAsNumber: true })} className={fieldClass} /></Field>
              <Field label="Extra developer payout (₹)"><input type="number" min="0" step="0.01" {...quoteForm.register('extra_developer_payout', { valueAsNumber: true })} className={fieldClass} /></Field>
              <Field label="Timeline extension (days)"><input type="number" min="0" max="365" {...quoteForm.register('timeline_extension_days', { valueAsNumber: true })} className={fieldClass} /></Field>
              <button type="submit" className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white">Send quote to client</button>
            </form>
          </div>
        </div>
      )}

      {starterKit && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="starter-kit-title">
          <div className="w-full max-w-lg rounded-3xl border border-violet-300/20 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-violet-300">Instant-start developer kit</p><h2 id="starter-kit-title" className="mt-1 text-xl font-semibold text-white">Your project starter files are ready</h2></div><button type="button" onClick={() => setStarterKit(null)} className="text-sm text-slate-400">Close</button></div>
            <p className="mb-4 text-sm text-slate-300">Generated from the project category. Any generated content is clearly marked as an editable placeholder.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => downloadStarterFile('sample_products.json')} className="rounded-xl border border-white/10 bg-slate-950 p-4 text-left hover:border-violet-300/30"><FileText className="mb-2 h-5 w-5 text-violet-300" /><span className="block text-sm font-medium text-white">sample_products.json</span><span className="mt-1 block text-xs text-slate-400">{starterKit.sample_products.products.length} sample items · editable placeholder: {String(starterKit.sample_products.is_placeholder)}</span></button>
              <button type="button" onClick={() => downloadStarterFile('mock_content.json')} className="rounded-xl border border-white/10 bg-slate-950 p-4 text-left hover:border-violet-300/30"><FileText className="mb-2 h-5 w-5 text-cyan-300" /><span className="block text-sm font-medium text-white">mock_content.json</span><span className="mt-1 block text-xs text-slate-400">Hero, image URLs, map coordinates, and placeholder flags</span></button>
            </div>
            <button type="button" onClick={() => { downloadStarterFile('sample_products.json'); downloadStarterFile('mock_content.json'); }} className="mt-4 w-full rounded-full bg-violet-500 px-5 py-3 text-sm font-medium text-white">Download both starter files</button>
          </div>
        </div>
      )}

      {chatProject && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="chat-title">
          <div className="my-0 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl sm:my-3 sm:rounded-3xl">
            <header className="flex items-center justify-between border-b border-white/10 p-5"><div><p className="text-xs uppercase tracking-wider text-violet-300">Project collaboration</p><h2 id="chat-title" className="text-xl font-semibold text-white">{chatProject.title}</h2></div><button type="button" onClick={() => setChatProject(null)} className="text-sm text-slate-400">Close</button></header>
            <div className="m-4 rounded-xl border border-amber-300/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100">Scope Lock Active: Extra feature requests must be raised via “Request Change”.</div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-4 md:grid-cols-[1fr_0.8fr]">
              <section className="flex min-h-64 flex-col rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                <h3 className="mb-2 text-sm font-medium text-white">Discussion</h3>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {messages.length === 0 ? <p className="text-xs text-slate-500">No messages yet.</p> : messages.map((message) => <article key={message.id} className="rounded-xl bg-slate-900 p-3">
                    <p className="text-[11px] text-violet-200">{message.sender_name} · {message.sender_role} · {new Date(message.created_at).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{message.message_text}</p>
                    {message.attachment_url && <a href={message.attachment_url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-cyan-200 underline">Attachment</a>}
                  </article>)}
                </div>
                <form onSubmit={(event) => void sendProjectMessage(event)} className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1 space-y-2"><input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={10000} className={fieldClass} placeholder="Write a message..." required /><input type="url" value={messageAttachment} onChange={(event) => setMessageAttachment(event.target.value)} className={`${fieldClass} text-xs`} placeholder="Attachment URL (optional)" /></div>
                  <button type="submit" className="self-start rounded-xl bg-violet-500 px-4 py-3 text-sm font-medium text-white">Send</button>
                </form>
              </section>
              <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <h3 className="text-sm font-medium text-white">Shared assets</h3>
                <p className="mt-3 text-xs text-slate-400">Logo: {String(chatProject.design_preferences.logo_url ?? 'Not provided')}</p>
                <p className="mt-2 text-xs text-slate-400">Typography: {String(chatProject.design_preferences.font_preference ?? 'System sans-serif')}</p>
                <p className="mt-2 text-xs text-slate-400">Theme: {String(chatProject.design_preferences.theme ?? 'Custom')}</p>
                <div className="mt-3 flex flex-wrap gap-2">{Object.entries(chatProject.design_preferences.colors ?? {}).map(([name, hex]) => <span key={name} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-1 text-[11px] text-slate-300"><i className="h-3 w-3 rounded-full" style={{ backgroundColor: hex }} />{name} {hex}</span>)}</div>
                <h4 className="mt-4 text-xs font-medium text-slate-300">Reference URLs &amp; attachments</h4>
                {(chatProject.design_preferences.sample_links ?? []).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-violet-300 underline">{link}</a>)}
                {(chatProject.design_preferences.asset_links ?? []).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-cyan-300 underline">{link}</a>)}
              </section>
            </div>
          </div>
        </div>
      )}

      {previewProject && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="preview-title">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col rounded-t-3xl border border-white/10 bg-slate-900 p-3 shadow-2xl sm:rounded-3xl sm:p-4">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="preview-title" className="font-semibold text-white">Staging preview · {previewProject.title}</h2><p className="text-xs text-slate-400">Sandboxed preview only. Source and deployment keys remain locked until full release.</p></div><button type="button" onClick={() => setPreviewProject(null)} className="text-sm text-slate-400">Close</button></header>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {([
                ['desktop', Monitor, 'Desktop'],
                ['tablet', Tablet, 'Tablet'],
                ['mobile', Smartphone, 'Mobile'],
              ] as const).map(([value, Icon, label]) => <button key={value} type="button" onClick={() => setViewport(value)} className={`rounded-full px-3 py-1.5 text-xs ${viewport === value ? 'bg-violet-500 text-white' : 'bg-slate-800 text-slate-300'}`}><Icon className="mr-1 inline h-3.5 w-3.5" />{label}</button>)}
              {role === 'CLIENT' && previewProject.status === 'IN_PROGRESS' && <button type="button" onClick={() => setPinpointMode((enabled) => !enabled)} className={`ml-auto rounded-full px-3 py-1.5 text-xs ${pinpointMode ? 'bg-amber-400 text-slate-950' : 'border border-amber-300/30 text-amber-100'}`}>{pinpointMode ? 'Pinpoint mode · click preview' : 'Pinpoint Feedback Mode'}</button>}
              <button type="button" disabled={!isProjectReleased(previewProject)} onClick={() => void downloadDeliverables(previewProject)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-200 disabled:text-slate-600"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" />Download Source Bundle &amp; Deployment Keys</button>
            </div>
            <div className="relative mx-auto h-[min(70vh,700px)] w-full overflow-hidden rounded-xl border border-white/10 bg-white transition-all" style={{ maxWidth: viewport === 'desktop' ? '100%' : viewport === 'tablet' ? '768px' : '390px' }}>
              <iframe title={`${previewProject.title} staging preview`} src={previewProject.staging_preview_url ?? previewProject.milestones?.find((item) => item.staging_url)?.staging_url ?? 'about:blank'} sandbox="allow-scripts allow-forms" className="h-full w-full border-0" />
              {!isProjectReleased(previewProject) && <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-2 content-around -rotate-12 gap-8 overflow-hidden opacity-25 sm:grid-cols-3">
                {Array.from({ length: 15 }, (_, index) => <span key={index} className="whitespace-nowrap text-center text-sm font-bold text-rose-600">DevOrbit Preview · Unpaid Staging · Do Not Distribute</span>)}
              </div>}
              {pinpointMode && <div role="presentation" aria-label="Click the preview to add feedback" onClick={(event) => void submitPinpoint(event)} className="absolute inset-0 z-10 cursor-crosshair bg-violet-500/5" />}
            </div>
          </div>
        </div>
      )}

      {escrowProject && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="escrow-title">
          <div className="w-full max-w-lg rounded-t-3xl border border-emerald-300/20 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-emerald-200">Simulated payment · no money is charged</p><h2 id="escrow-title" className="mt-1 text-xl font-semibold text-white">Fund project escrow</h2></div><button type="button" onClick={() => setEscrowProject(null)} className="text-sm text-slate-400">Close</button></div>
            <p className="text-sm text-slate-300">{escrowProject.title}</p>
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-950 p-3 text-sm"><div className="flex justify-between"><span>Milestone escrow</span><span>{money((escrowProject.milestones ?? []).filter((item) => ['AWAITING_ESCROW', 'PENDING'].includes(item.status)).reduce((sum, item) => sum + item.payout_amount, 0))}</span></div><p className="mt-2 text-xs text-slate-500">Simulated UPI QR · GPay · PhonePe · Paytm</p></div>
            <SimulatedQr seed={`${escrowProject.id}-${upiProvider}-${lockedEscrow(escrowProject)}`} />
            <div className="mb-4 flex justify-center gap-2">{['GPay', 'PhonePe', 'Paytm'].map((provider) => <button key={provider} type="button" onClick={() => setUpiProvider(provider)} className={`rounded-full px-3 py-1.5 text-xs ${upiProvider === provider ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-200'}`}>{provider}</button>)}</div>
            <button type="button" onClick={() => void fundProjectEscrow()} className="w-full rounded-full bg-emerald-400 px-5 py-3 font-semibold text-slate-950">Simulate Successful UPI Payment</button>
          </div>
        </div>
      )}

      {docsProject && docsKit && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="docs-title">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 p-4 sm:rounded-3xl sm:p-5">
            <header className="mb-4 flex items-center justify-between"><div><p className="text-xs uppercase tracking-wider text-violet-300">Automated documentation suite</p><h2 id="docs-title" className="text-xl font-semibold text-white">{docsProject.title}</h2></div><div className="flex gap-2"><button type="button" onClick={downloadDocumentation} className="rounded-full bg-violet-500 px-3 py-2 text-xs text-white"><Download className="mr-1 inline h-3.5 w-3.5" />Export all</button><button type="button" onClick={() => { setDocsProject(null); setDocsKit(null); }} className="text-sm text-slate-400">Close</button></div></header>
            <div className="grid gap-3 overflow-y-auto md:grid-cols-2">
              <DocumentPreview title="Project report" content={docsKit.report.content} />
              <section className="rounded-xl border border-white/10 bg-slate-950 p-4"><h3 className="mb-2 text-sm font-medium text-white">10-slide pitch deck</h3><ol className="list-inside list-decimal space-y-1 text-xs text-slate-300">{docsKit.pitch_deck.slides.map((slide) => <li key={slide.title}><strong>{slide.title}:</strong> {slide.content}</li>)}</ol></section>
              <DocumentPreview title="Technical thesis / SRS" content={docsKit.technical_thesis.content} />
              <section className="rounded-xl border border-white/10 bg-slate-950 p-4"><h3 className="mb-2 text-sm font-medium text-white">Marketing banner mockup</h3><iframe title="Marketing banner mockup" srcDoc={docsKit.marketing_banner.content} sandbox="" className="h-48 w-full rounded-lg bg-white" /></section>
            </div>
          </div>
        </div>
      )}

      {virtualPreviewOpen && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="virtual-preview-title">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between"><div><p className="text-xs uppercase tracking-wider text-violet-300">Design Studio sandbox</p><h2 id="virtual-preview-title" className="mt-1 text-xl font-semibold text-white">Virtual experience preview</h2></div><button type="button" onClick={() => setVirtualPreviewOpen(false)} className="text-sm text-slate-400">Close</button></div>
            <VirtualExperienceSandbox category={intakeForm.watch('category')} fabricColor={intakeForm.watch('primaryColor')} onFabricColorChange={(color) => intakeForm.setValue('primaryColor', color, { shouldDirty: true })} />
          </div>
        </div>
      )}

      {legalPage && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="legal-title">
          <div className="w-full max-w-xl rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl sm:p-6"><div className="mb-4 flex justify-between"><h2 id="legal-title" className="text-xl font-semibold text-white">{legalPage}</h2><button type="button" onClick={() => setLegalPage(null)} className="text-slate-400">Close</button></div>
            <p className="text-sm leading-6 text-slate-300">{legalPage.startsWith('Privacy') ? 'DevOrbit uses account and project information to provide the agency workspace. Avoid sharing passwords or sensitive payment credentials in project chat. This prototype simulates payments and does not process or store UPI credentials.' : legalPage.startsWith('Terms') ? 'Escrow shown in DevOrbit is a workflow simulation, not a regulated payment service. Client-funded milestone amounts are represented as locked only after the simulation action. Source release remains gated on project completion and all milestone payouts.' : 'Agency Support: support@devorbit.io · Include your project ID and a short description of the issue. For urgent account access concerns, sign out on shared devices.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function VirtualExperienceSandbox({
  category,
  fabricColor,
  onFabricColorChange,
}: {
  category: string;
  fabricColor: string;
  onFabricColorChange: (color: string) => void;
}) {
  const clothesPreview = /clothes|clothing|fashion|kapde|kapda/i.test(category);
  const [garment, setGarment] = useState('Kurta');
  const [furniture, setFurniture] = useState([
    { id: 'sofa', label: 'Sofa', x: 16, y: 58, color: '#6366f1' },
    { id: 'table', label: 'Table', x: 50, y: 63, color: '#b77942' },
    { id: 'lamp', label: 'Lamp', x: 76, y: 28, color: '#fbbf24' },
  ]);
  const moveFurniture = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(3, Math.min(85, ((event.clientX - bounds.left) / bounds.width) * 100 - 6));
    const y = Math.max(4, Math.min(80, ((event.clientY - bounds.top) / bounds.height) * 100 - 5));
    setFurniture((current) => current.map((item) => item.id === id ? { ...item, x, y } : item));
  };

  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-300">{clothesPreview ? <><Shirt className="mr-1 inline h-4 w-4 text-violet-300" />Try garment types and fabric colors on a mannequin preview.</> : 'Drag furniture pieces to arrange the room mockup.'}</p>
      {clothesPreview && <div className="flex items-center gap-2 text-xs text-slate-300"><label htmlFor="fabric-color">Fabric color</label><input id="fabric-color" type="color" value={fabricColor} onChange={(event) => onFabricColorChange(event.target.value)} className="h-9 w-12 rounded-lg border border-white/10 bg-slate-950 p-1" /></div>}
    </div>
    {clothesPreview ? <>
      <label className="flex items-center gap-2 text-xs text-slate-300">Garment type
        <select value={garment} onChange={(event) => setGarment(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white"><option>Kurta</option><option>Dress</option><option>Shirt</option><option>Saree</option></select>
      </label>
      <div className="relative flex min-h-80 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950">
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-white/5" />
        <svg viewBox="0 0 220 300" role="img" aria-label={`Mannequin wearing a ${garment.toLowerCase()} in selected fabric color`} className="relative z-10 h-72 w-56 drop-shadow-2xl">
          <ellipse cx="110" cy="285" rx="66" ry="9" fill="#00000055" />
          <circle cx="110" cy="35" r="23" fill="#d9b49a" />
          <path d="M98 58h24v23H98z" fill="#d9b49a" />
          <path d="M78 79 97 69h26l19 10 17 59-20 7-8-29v74H89v-74l-8 29-20-7z" fill={fabricColor} stroke="#ffffff66" strokeWidth="2" />
          {garment === 'Dress' && <path d="M85 151h50l18 100H67z" fill={fabricColor} stroke="#ffffff66" strokeWidth="2" />}
          {garment === 'Saree' && <path d="m134 82 29 24-28 83-16-6 17-53-28 22-18-13 39-39z" fill={`${fabricColor}dd`} stroke="#ffffff66" strokeWidth="2" />}
          {garment === 'Kurta' && <path d="m110 79 0 121m-13-111 13 12 13-12" fill="none" stroke="#ffffffaa" strokeWidth="2" />}
          <path d="M94 200h15v67H94zm17 0h15v67h-15z" fill="#d9b49a" />
          <path d="M88 267h27v10H86zm22 0h27v10h-29z" fill="#1e293b" />
        </svg>
        <span className="absolute bottom-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs text-slate-300">Interactive {garment} preview · editable placeholder avatar</span>
      </div>
    </> : <>
      <div onDragOver={(event) => event.preventDefault()} onDrop={moveFurniture} className="relative h-80 overflow-hidden rounded-2xl border-2 border-dashed border-amber-200/30 bg-[linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] bg-[size:40px_40px]">
        <div className="absolute inset-x-0 bottom-0 h-5 border-t-4 border-amber-100/20 bg-amber-200/5" />
        <div className="absolute right-4 top-4 rounded-lg border border-cyan-200/20 bg-cyan-300/10 px-4 py-8 text-[10px] text-cyan-100">WINDOW</div>
        {furniture.map((item) => <div key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)} style={{ left: `${item.x}%`, top: `${item.y}%`, backgroundColor: item.color }} className="absolute flex h-12 min-w-16 cursor-grab items-center justify-center rounded-xl border border-white/25 px-3 text-xs font-medium text-white shadow-lg active:cursor-grabbing">{item.label}</div>)}
      </div>
      <p className="text-xs text-slate-400"><Sofa className="mr-1 inline h-3.5 w-3.5" />Drag the sofa, table, and lamp to rearrange the room. Positions reset when the preview is closed.</p>
    </>}
  </section>;
}

function MobileNavButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 py-1 text-[10px] text-slate-300 active:text-violet-200">{icon}<span>{label}</span></button>;
}

function SimulatedQr({ seed }: { seed: string }) {
  const seedValue = Array.from(seed).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  return <div className="mx-auto my-5 grid h-44 w-44 grid-cols-11 gap-0.5 rounded-lg bg-white p-2" aria-label="Simulated dynamic UPI QR code">
    {Array.from({ length: 121 }, (_, index) => {
      const row = Math.floor(index / 11);
      const column = index % 11;
      const finderArea = (row < 3 && column < 3) || (row < 3 && column > 7) || (row > 7 && column < 3);
      const finderDark = finderArea && (
        row % 8 === 0 || row % 8 === 2 || column % 8 === 0 || column % 8 === 2
        || (row % 8 === 1 && column % 8 === 1)
      );
      const dark = finderDark || (!finderArea && ((index * 17 + Math.floor(index / 7) * 13 + seedValue) % 7 < 3));
      return <span key={index} className={`rounded-[1px] ${dark ? 'bg-slate-950' : 'bg-white'}`} />;
    })}
  </div>;
}

function DocumentPreview({ title, content }: { title: string; content: string }) {
  return <section className="rounded-xl border border-white/10 bg-slate-950 p-4"><h3 className="mb-2 text-sm font-medium text-white">{title}</h3><pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">{content}</pre></section>;
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm text-slate-300"><span>{label}</span>{children}{error && <span className="block text-xs text-rose-300">{error}</span>}</label>;
}

function MilestoneFeedbackForm({ milestone, onSubmit }: { milestone: Milestone; onSubmit: (milestoneId: string, rating: number, review: string) => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (milestone.client_rating !== null) {
    return <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/5 p-3 text-xs text-emerald-100">
      <p>{'★'.repeat(milestone.client_rating)}{'☆'.repeat(5 - milestone.client_rating)} · Feedback submitted</p>
      {milestone.client_review && <p className="mt-1 text-slate-300">{milestone.client_review}</p>}
    </div>;
  }
  return <form className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/5 p-3" onSubmit={async (event) => {
    event.preventDefault();
    if (rating === 0 || review.trim().length < 5) return;
    setSubmitting(true);
    try {
      await onSubmit(milestone.id, rating, review.trim());
    } finally {
      setSubmitting(false);
    }
  }}>
    <p className="text-xs font-medium text-amber-100">Review submitted work · {milestone.title}</p>
    <div className="my-2 flex gap-1" aria-label={`Rating ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`Rate ${value} stars`} onClick={() => setRating(value)} className="p-1"><Star className={`h-5 w-5 ${value <= rating ? 'fill-amber-300 text-amber-300' : 'text-slate-500'}`} /></button>)}
    </div>
    <textarea value={review} onChange={(event) => setReview(event.target.value)} minLength={5} required rows={2} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white" placeholder="Share a short review for the developer..." />
    <button disabled={submitting || rating === 0 || review.trim().length < 5} type="submit" className="mt-2 rounded-full bg-amber-400/20 px-3 py-1.5 text-xs font-medium text-amber-100 disabled:opacity-50">Submit rating &amp; review</button>
  </form>;
}

function CheckGroup({ label, options, name, register }: { label: string; options: string[]; name: 'languages' | 'paymentMethods' | 'features' | 'techStack'; register: UseFormRegister<ProjectForm> }) {
  return <fieldset><legend className="mb-2 text-sm text-slate-300">{label}</legend><div className="flex flex-wrap gap-2">
    {options.map((option) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 transition hover:border-violet-400/50">
      <input type="checkbox" value={option} {...register(name)} className="accent-violet-500" />{option}
    </label>)}
  </div></fieldset>;
}

function ProjectItem({ project, action }: { project: DashboardProject; action?: ReactNode }) {
  return <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -2 }} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-white">{project.title}</h3><p className="text-sm text-slate-400">{project.business_category} · {project.status}</p>
      {project.match_percentage !== undefined && <span className="mt-2 inline-flex rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">{project.match_percentage}% Match</span>}
    </div>{action}</div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span>Client budget: {money(project.client_budget)}</span><span>Developer payout: {money(project.developer_payout)}</span>
    </div>
  </motion.article>;
}

function Balance({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-950 p-4"><p className="text-slate-400">{label}</p><p className="mt-2 text-xl font-semibold text-white">{money(value)}</p></div>;
}

function FinancialRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between border-b border-white/10 pb-3"><span>{label}</span><span className="font-medium text-white">{money(value)}</span></div>;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function roleLabel(role: User['role']): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function suggestClientFeatures(category: string, description: string): string[] {
  const text = `${category} ${description}`.toLowerCase();
  const suggestions = new Set<string>();
  const categorySuggestions: Record<string, string[]> = {
    kirana: ['Inventory', 'Online Payment', 'WhatsApp Bot', 'Admin Panel'],
    restaurant: ['Online Payment', 'Booking', 'WhatsApp Bot', 'Admin Panel'],
    clinic: ['Booking', 'WhatsApp Bot', 'Admin Panel'],
    salon: ['Booking', 'WhatsApp Bot'],
    coaching: ['Booking', 'Online Payment', 'Admin Panel'],
    portfolio: ['Analytics', 'Booking'],
    'e-commerce': ['Inventory', 'Online Payment', 'Admin Panel'],
    clothes: ['Inventory', 'Online Payment', 'Analytics'],
    clothing: ['Inventory', 'Online Payment', 'Analytics'],
    'furniture / interior': ['Inventory', 'Booking', 'Online Payment', 'Analytics'],
  };
  for (const feature of categorySuggestions[category.toLowerCase()] ?? []) suggestions.add(feature);

  const keywordSuggestions: Array<[RegExp, string]> = [
    [/\b(book|appointment|schedule|slot|visit|booking)\b|बुकिंग|अपॉइंटमेंट/, 'Booking'],
    [/\b(pay|payment|checkout|upi|order online|bill|billing)\b|भुगतान|बिल/, 'Online Payment'],
    [/\b(stock|inventory|product|store|shop|kapde|kapda|clothes?|furniture)\b|कपड़े|कपड़ों|कपडे|कपड़ा|कपडा|फर्नीचर/, 'Inventory'],
    [/\b(whatsapp|message|chat|reminder|whats app)\b|व्हाट्सएप/, 'WhatsApp Bot'],
    [/\b(manage|dashboard|staff|control|admin)\b|प्रबंधन/, 'Admin Panel'],
    [/\b(report|analytics|insight|track)\b|रिपोर्ट/, 'Analytics'],
  ];
  for (const [pattern, feature] of keywordSuggestions) {
    if (pattern.test(text)) suggestions.add(feature);
  }
  return [...suggestions];
}

export default App;

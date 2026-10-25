import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight, BriefcaseBusiness, Building2, CheckCircle2, CreditCard, DollarSign,
  FileText, Gauge, LogOut, Rocket, ShieldCheck, Sparkles, Wallet,
} from 'lucide-react';
import axios from 'axios';
import { api, clearAuthToken, setAuthToken } from './lib/api';
import type { AuthResponse, DashboardProject, User } from './types';

const panelClass = 'rounded-3xl border border-white/10 bg-slate-900/70 p-6';
const fieldClass = 'w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-white outline-none transition focus:border-violet-400';

const projectSchema = z.object({
  title: z.string().min(3, 'Project title is required').max(200),
  category: z.string().min(2),
  description: z.string().min(12, 'Please describe the project in more detail'),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  features: z.array(z.string()),
  sampleLinks: z.string(),
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
  const [financials, setFinancials] = useState<Record<string, number> | null>(null);
  const [selectedProject, setSelectedProject] = useState<DashboardProject | null>(null);

  const intakeForm = useForm<ProjectForm>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: '', category: 'Kirana', description: '', primaryColor: '#7c3aed',
      secondaryColor: '#e2e8f0', features: [], sampleLinks: '',
    },
  });
  const estimateForm = useForm<EstimateForm>({
    resolver: zodResolver(estimateSchema),
    defaultValues: { client_budget: 0, developer_payout: 0, monthly_maintenance_fee: 0, milestone_titles: 'Discovery, Design, Development, QA' },
  });
  const authForm = useForm<AuthForm>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: '', password: '', full_name: '', phone_number: '', role: 'CLIENT', skills: '', experience: 'BEGINNER' },
  });

  const role = user?.role;

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
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setNotice('');
    const load = async () => {
      try {
        if (user.role === 'CLIENT') {
          const { data } = await api.get<DashboardProject[]>('/client/projects');
          const withProgress = await Promise.all(data.map(async (project) => {
            const response = await api.get<{ project: DashboardProject; milestones: DashboardProject['milestones'] }>(`/client/projects/${project.id}/progress`);
            return { ...response.data.project, milestones: response.data.milestones };
          }));
          if (!cancelled) setProjects(withProgress);
        } else if (user.role === 'DEVELOPER') {
          const [available, active, walletResponse] = await Promise.all([
            api.get<DashboardProject[]>('/developer/projects/available'),
            api.get<DashboardProject[]>('/developer/projects/active'),
            api.get<{ wallet_balance: number; escrow_balance: number; released_earnings: number }>('/developer/wallet'),
          ]);
          if (!cancelled) {
            setProjects(available.data);
            setActiveProjects(active.data);
            setWallet(walletResponse.data);
          }
        } else {
          const [pending, stats] = await Promise.all([
            api.get<DashboardProject[]>('/admin/projects/pending'),
            api.get<Record<string, number>>('/admin/analytics/financials'),
          ]);
          if (!cancelled) {
            setPendingProjects(pending.data);
            setFinancials(stats.data);
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

  const refreshDashboard = async () => {
    if (!user) return;
    if (user.role === 'CLIENT') {
      const { data } = await api.get<DashboardProject[]>('/client/projects');
      const rows = await Promise.all(data.map(async (project) => {
        const response = await api.get<{ project: DashboardProject; milestones: DashboardProject['milestones'] }>(`/client/projects/${project.id}/progress`);
        return { ...response.data.project, milestones: response.data.milestones };
      }));
      setProjects(rows);
    } else if (user.role === 'DEVELOPER') {
      const [available, active, walletResponse] = await Promise.all([
        api.get<DashboardProject[]>('/developer/projects/available'),
        api.get<DashboardProject[]>('/developer/projects/active'),
        api.get<{ wallet_balance: number; escrow_balance: number; released_earnings: number }>('/developer/wallet'),
      ]);
      setProjects(available.data);
      setActiveProjects(active.data);
      setWallet(walletResponse.data);
    } else {
      const [pending, stats] = await Promise.all([
        api.get<DashboardProject[]>('/admin/projects/pending'),
        api.get<Record<string, number>>('/admin/analytics/financials'),
      ]);
      setPendingProjects(pending.data);
      setFinancials(stats.data);
    }
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
    setProjects([]);
    setActiveProjects([]);
    setPendingProjects([]);
    setWallet(null);
    setFinancials(null);
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
      await api.post('/client/projects', {
        title: values.title,
        business_category: values.category,
        description: values.description,
        design_preferences: {
          colors: { primary: values.primaryColor, secondary: values.secondaryColor },
          sample_links: values.sampleLinks.split(/\s*,\s*/).filter(Boolean),
          features: values.features,
        },
      });
      intakeForm.reset();
      setNotice('Project submitted successfully.');
      await refreshDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const claimProject = async (projectId: string) => {
    setNotice('');
    try {
      await api.post(`/developer/projects/${projectId}/claim`);
      setNotice('Project claimed successfully.');
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
      {metrics.map(({ label, value, icon: Icon }) => (
        <div key={label} className={panelClass}>
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300"><Icon className="h-5 w-5" /></div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
        </div>
      ))}
    </section>
  );

  const renderClient = () => (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className={panelClass}>
        <div className="mb-5 flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-300" /><h2 className="text-xl font-semibold text-white">Project intake</h2></div>
        <form className="space-y-5" onSubmit={intakeForm.handleSubmit(submitProject)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project title" error={intakeForm.formState.errors.title?.message}><input {...intakeForm.register('title')} className={fieldClass} /></Field>
            <Field label="Business category"><select {...intakeForm.register('category')} className={fieldClass}>{['Kirana', 'Restaurant', 'Clinic', 'Salon', 'Coaching', 'Portfolio', 'E-Commerce'].map((item) => <option key={item}>{item}</option>)}</select></Field>
          </div>
          <Field label="Functional description" error={intakeForm.formState.errors.description?.message}><textarea {...intakeForm.register('description')} rows={4} className={fieldClass} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Primary color"><input type="color" {...intakeForm.register('primaryColor')} className={`${fieldClass} h-12 p-1`} /></Field>
            <Field label="Secondary color"><input type="color" {...intakeForm.register('secondaryColor')} className={`${fieldClass} h-12 p-1`} /></Field>
          </div>
          <Field label="Reference URLs (comma separated)"><input {...intakeForm.register('sampleLinks')} className={fieldClass} placeholder="https://example.com" /></Field>
          <fieldset>
            <legend className="mb-2 text-sm text-slate-300">Requested features</legend>
            <div className="flex flex-wrap gap-3">
              {['Online Payment', 'WhatsApp Bot', 'Admin Panel', 'Inventory'].map((feature) => (
                <label key={feature} className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300">
                  <input type="checkbox" value={feature} {...intakeForm.register('features')} className="accent-violet-500" />{feature}
                </label>
              ))}
            </div>
          </fieldset>
          <button disabled={loading} type="submit" className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 font-medium text-white disabled:opacity-60">
            Submit project <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>
      <section className={`${panelClass} space-y-5`}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Project tracking</h2><span className="text-xs uppercase tracking-wider text-violet-300">Live data</span></div>
        {projects.length === 0 ? <p className="text-sm text-slate-400">Your submitted projects will appear here.</p> : projects.map((project) => {
          const activeMilestone = project.milestones?.find((milestone) => ['IN_PROGRESS', 'SUBMITTED'].includes(milestone.status)) ?? project.milestones?.find((milestone) => milestone.status === 'PENDING');
          return (
            <article key={project.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-white">{project.title}</h3><p className="text-sm text-slate-400">{project.business_category} · {project.status}</p></div><span className="text-sm font-medium text-violet-200">{project.progress_percentage}%</span></div>
              <div className="mt-3 h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-400" style={{ width: `${Math.min(100, Math.max(0, project.progress_percentage))}%` }} /></div>
              <p className="mt-3 text-sm text-slate-300">Active milestone: {activeMilestone?.title ?? (project.status === 'COMPLETED' ? 'Completed' : 'Awaiting estimate')}</p>
              {project.staging_preview_url && <a className="mt-2 inline-block text-sm text-violet-300 underline" href={project.staging_preview_url} target="_blank" rel="noreferrer">Open preview {project.is_watermarked ? '(watermarked)' : ''}</a>}
            </article>
          );
        })}
      </section>
    </div>
  );

  const renderDeveloper = () => (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className={panelClass}>
        <h2 className="mb-5 text-xl font-semibold text-white">Available projects</h2>
        <div className="space-y-4">
          {projects.length === 0 && <p className="text-sm text-slate-400">No matching projects are currently available.</p>}
          {projects.map((project) => <ProjectItem key={project.id} project={project} action={<button type="button" onClick={() => void claimProject(project.id)} className="rounded-full bg-violet-500 px-4 py-2 text-sm font-medium text-white">Claim Project</button>} />)}
        </div>
      </section>
      <div className="space-y-6">
        <section className={panelClass}>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Wallet</h2><Wallet className="h-5 w-5 text-violet-300" /></div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Balance label="Available balance" value={wallet?.wallet_balance ?? 0} />
            <Balance label="Escrow balance" value={wallet?.escrow_balance ?? 0} />
          </div>
        </section>
        <section className={panelClass}>
          <h2 className="mb-4 text-xl font-semibold text-white">Active projects</h2>
          {activeProjects.length === 0 ? <p className="text-sm text-slate-400">Projects you claim will appear here.</p> : activeProjects.map((project) => <ProjectItem key={project.id} project={project} />)}
        </section>
      </div>
    </div>
  );

  const renderAdmin = () => (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <section className={panelClass}>
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold text-white">Pending submissions</h2><span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200">{pendingProjects.length} pending</span></div>
        <div className="space-y-4">
          {pendingProjects.length === 0 && <p className="text-sm text-slate-400">No submissions waiting for an estimate.</p>}
          {pendingProjects.map((project) => <ProjectItem key={project.id} project={project} action={<button type="button" onClick={() => { estimateForm.reset(); setSelectedProject(project); }} className="rounded-full bg-violet-500 px-4 py-2 text-sm font-medium text-white">Estimate &amp; Approve</button>} />)}
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
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
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
      </div>

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
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6">
            <div className="mb-5 flex items-start justify-between"><div><p className="text-sm text-slate-400">Estimate project</p><h2 id="estimate-title" className="text-xl font-semibold text-white">{selectedProject.title}</h2></div><button type="button" onClick={() => setSelectedProject(null)} className="text-slate-400">Close</button></div>
            <form className="space-y-4" onSubmit={estimateForm.handleSubmit(submitEstimate)}>
              <Field label="Client budget (₹)"><input type="number" min="0.01" step="0.01" {...estimateForm.register('client_budget')} className={fieldClass} /></Field>
              <Field label="Developer payout (₹)"><input type="number" min="0.01" step="0.01" {...estimateForm.register('developer_payout')} className={fieldClass} /></Field>
              <Field label="Monthly maintenance fee (₹)"><input type="number" min="0" step="0.01" {...estimateForm.register('monthly_maintenance_fee')} className={fieldClass} /></Field>
              <Field label="Milestone titles (comma separated)"><textarea rows={3} {...estimateForm.register('milestone_titles')} className={fieldClass} /></Field>
              <button disabled={loading} type="submit" className="w-full rounded-full bg-violet-500 px-5 py-3 font-medium text-white disabled:opacity-60">Estimate &amp; Approve</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="block space-y-2 text-sm text-slate-300"><span>{label}</span>{children}{error && <span className="block text-xs text-rose-300">{error}</span>}</label>;
}

function ProjectItem({ project, action }: { project: DashboardProject; action?: ReactNode }) {
  return <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-white">{project.title}</h3><p className="text-sm text-slate-400">{project.business_category} · {project.status}</p></div>{action}</div>
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-300">
      <span>Client budget: {money(project.client_budget)}</span><span>Developer payout: {money(project.developer_payout)}</span>
    </div>
  </article>;
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

export default App;

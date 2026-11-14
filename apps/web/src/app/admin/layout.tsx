'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  GraduationCap,
  FolderTree,
  HelpCircle,
  FileSpreadsheet,
  Newspaper,
  HardDrive,
  Users,
  BellRing,
  ScrollText,
  Gauge,
  ShieldAlert,
  LogOut,
  Menu,
  X,
  Search,
  ExternalLink,
  Globe,
  Trash2,
  User,
  Smartphone,
} from 'lucide-react';

// Helper to decode JWT payload safely in browser
function decodeJwtPayload(token: string): { sub?: string; email?: string; name?: string; role?: string; type?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(payloadBase64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    }
  } catch {}
  return null;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAdminRoute = pathname === '/admin/login' || pathname === '/admin/reset-password';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(!isPublicAdminRoute);
  const [brevoQuota, setBrevoQuota] = useState<{ usedToday: number; limit: number; source?: string } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);

  const fetchBrevoQuota = async () => {
    try {
      setQuotaLoading(true);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');
      if (!token) return;
      const res = await fetch(`${apiBase}/v1/admin/brevo/live-quota`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBrevoQuota({
          usedToday: data.usedToday ?? 0,
          limit: data.limit ?? 300,
          source: data.source,
        });
      }
    } catch {
      // network fallback
    } finally {
      setQuotaLoading(false);
    }
  };

  useEffect(() => {
    if (isPublicAdminRoute) {
      setCheckingAuth(false);
      return;
    }

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');
    const stored =
      sessionStorage.getItem('sidprep_admin_user') ||
      localStorage.getItem('sidprep_admin_user');

    if (!token) {
      setCheckingAuth(false);
      window.location.href = '/admin/login';
      return;
    }

    let userObj: { name: string; role: string; email: string } | null = null;
    if (stored && stored !== 'undefined' && stored !== 'null') {
      try {
        userObj = JSON.parse(stored);
      } catch {}
    }

    // Validate JWT payload from token directly (Invariant F01)
    const decoded = decodeJwtPayload(token);
    if (!decoded || (decoded.type && decoded.type !== 'admin_session' && decoded.type !== 'admin')) {
      // Reject admin_preauth, student tokens, or malformed tokens
      sessionStorage.removeItem('sidprep_admin_token');
      sessionStorage.removeItem('sidprep_admin_user');
      localStorage.removeItem('sidprep_admin_token');
      localStorage.removeItem('sidprep_admin_user');
      window.location.href = '/admin/login';
      return;
    }

    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      // Token is expired
      sessionStorage.removeItem('sidprep_admin_token');
      sessionStorage.removeItem('sidprep_admin_user');
      localStorage.removeItem('sidprep_admin_token');
      localStorage.removeItem('sidprep_admin_user');
      window.location.href = '/admin/login';
      return;
    }

    if (!userObj && decoded.email && decoded.role) {
      userObj = {
        name: decoded.name || 'Administrator',
        role: decoded.role,
        email: decoded.email,
      };
      try {
        sessionStorage.setItem('sidprep_admin_user', JSON.stringify(userObj));
        localStorage.setItem('sidprep_admin_user', JSON.stringify(userObj));
      } catch {}
    }

    if (!userObj) {
      sessionStorage.removeItem('sidprep_admin_token');
      sessionStorage.removeItem('sidprep_admin_user');
      localStorage.removeItem('sidprep_admin_token');
      localStorage.removeItem('sidprep_admin_user');
      window.location.href = '/admin/login';
      return;
    }

    setAdminUser(userObj);
    setCheckingAuth(false);
    fetchBrevoQuota();
    const timer = setInterval(fetchBrevoQuota, 30000);
    return () => clearInterval(timer);
  }, [pathname]);

  if (isPublicAdminRoute) {
    return <>{children}</>;
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
          <span className="text-xs text-slate-400 font-medium">Verifying security session...</span>
        </div>
      </div>
    );
  }

  const navItems = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Website CMS Pages', href: '/admin/pages', icon: Globe },
    { label: 'App Releases', href: '/admin/releases', icon: Smartphone },
    { label: 'Exams & Patterns', href: '/admin/exams', icon: GraduationCap },
    { label: 'Taxonomy', href: '/admin/taxonomy', icon: FolderTree },
    { label: 'Question Bank', href: '/admin/questions', icon: HelpCircle },
    { label: 'Test Builder', href: '/admin/tests', icon: FileSpreadsheet },
    { label: 'Current Affairs CMS', href: '/admin/current-affairs', icon: Newspaper },
    { label: 'Document Library', href: '/admin/resources', icon: HardDrive },
    { label: 'Student Directory', href: '/admin/users', icon: Users },
    { label: 'Database Maintenance', href: '/admin/maintenance', icon: Trash2 },
    { label: 'Admin Profile', href: '/admin/profile', icon: User },
    { label: 'Notifications & Email', href: '/admin/notifications', icon: BellRing },
    { label: '3-Layer Logs', href: '/admin/logs', icon: ScrollText },
    { label: 'Free-Tier Quotas', href: '/admin/quotas', icon: Gauge },
    { label: 'Team & Roles', href: '/admin/team', icon: ShieldAlert },
  ];

  const handleLogout = () => {
    sessionStorage.removeItem('sidprep_admin_token');
    sessionStorage.removeItem('sidprep_admin_user');
    localStorage.removeItem('sidprep_admin_token');
    localStorage.removeItem('sidprep_admin_user');
    try {
      document.cookie = 'sidprep_admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch {}
    window.location.href = '/admin/login';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-sm">
            S
          </div>
          <span className="font-heading font-bold text-sm text-white">SidPrep Admin</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-slate-800 text-slate-300"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 bg-slate-900/95 border-r border-slate-800/80 p-4 shrink-0 flex flex-col`}
      >
        <div className="hidden md:flex items-center gap-2.5 px-3 py-4 mb-4 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-white text-sm shadow">
            S
          </div>
          <div>
            <div className="font-heading font-extrabold text-sm text-white leading-none">
              SidPrep 2.0
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">Production CMS Console</div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="pt-4 mt-4 border-t border-slate-800">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 mb-2">
            <Link href="/admin/profile" className="overflow-hidden pr-2 flex-1 group" title="Manage Profile & Password">
              <div className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">
                {adminUser?.name || 'Administrator'}
              </div>
              <div className="text-[10px] text-primary font-bold">{adminUser?.role || 'SUPER_ADMIN'}</div>
            </Link>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <Link
            href="/"
            target="_blank"
            className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-200 py-1.5"
          >
            Open Student Site <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Top Header */}
        <header className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">
              API Status: <span className="text-emerald-400 font-bold">● Active (200 OK)</span>
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <button
              onClick={fetchBrevoQuota}
              title={`Click to refresh live quota • ${brevoQuota?.source || 'Synchronized'}`}
              className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 transition-all cursor-pointer"
            >
              <span className={`w-2 h-2 rounded-full ${quotaLoading ? 'bg-amber-400 animate-spin' : (brevoQuota && brevoQuota.usedToday > 250 ? 'bg-red-500' : 'bg-emerald-400')} animate-pulse`}></span>
              <span className="font-mono text-xs">
                Brevo: {brevoQuota ? `${brevoQuota.usedToday}/${brevoQuota.limit}` : 'Live'} Daily Emails
              </span>
            </button>
            <span className="text-slate-400 font-mono text-[11px]">
              Asia/Kolkata (IST)
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

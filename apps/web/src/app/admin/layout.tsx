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
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<{ name: string; role: string; email: string } | null>(null);

  useEffect(() => {
    if (pathname === '/admin/login') return;

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');
    const stored =
      sessionStorage.getItem('sidprep_admin_user') ||
      localStorage.getItem('sidprep_admin_user');
    if (!token || !stored) {
      router.push('/admin/login');
    } else {
      try {
        setAdminUser(JSON.parse(stored));
      } catch {
        sessionStorage.clear();
        localStorage.removeItem('sidprep_admin_token');
        localStorage.removeItem('sidprep_admin_user');
        router.push('/admin/login');
      }
    }
  }, [pathname, router]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const navItems = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Website CMS Pages', href: '/admin/pages', icon: Globe },
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
    router.push('/admin/login');
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
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse"></span>
              <span>Brevo: 14/300 Daily Emails</span>
            </div>
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

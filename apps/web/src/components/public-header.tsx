'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Newspaper,
  FileText,
  Smartphone,
  ArrowRight,
  User,
  LogOut,
  LayoutDashboard,
  Menu,
  X,
  BookOpen,
} from 'lucide-react';
import { getStudentUser, clearStudentSession, StudentUser } from '@/lib/auth';

/**
 * Responsive, accessible public website header with mobile drawer & keyboard support (F32)
 */
export function PublicHeader() {
  const [student, setStudent] = useState<StudentUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setStudent(getStudentUser());
  }, []);

  const handleLogout = () => {
    clearStudentSession();
    setStudent(null);
    window.location.href = '/';
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-primary outline-none">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-heading font-extrabold text-xl shadow-sm">
            S
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-extrabold text-xl text-slate-900 tracking-tight leading-none">
              SidPrep<span className="text-primary font-bold text-sm ml-1 px-1.5 py-0.5 bg-primary/10 rounded">2.0</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium tracking-wide">SSC • RRB • WBPSC • IBPS</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600" aria-label="Main Navigation">
          <Link href="/features" className="hover:text-primary transition-colors rounded-md focus-visible:ring-2 focus-visible:ring-primary outline-none py-1">
            Features
          </Link>
          <div className="relative group py-2">
            <span className="cursor-pointer hover:text-primary transition-colors flex items-center gap-1 py-1" tabIndex={0} role="button" aria-haspopup="true">
              Exams
            </span>
            <div className="absolute top-full -left-4 hidden group-hover:block w-52 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50">
              <Link href="/exams/ssc" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                SSC (CGL, CHSL, MTS)
              </Link>
              <Link href="/exams/rrb" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                RRB (NTPC, Group D)
              </Link>
              <Link href="/exams/wbpsc" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                WBPSC (Clerkship, Misc)
              </Link>
              <Link href="/exams/ibps" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                IBPS (PO, Clerk, RRB)
              </Link>
            </div>
          </div>
          <Link href="/current-affairs" className="hover:text-primary transition-colors flex items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-primary outline-none py-1">
            <Newspaper className="w-4 h-4 text-primary" />
            Current Affairs
          </Link>
          <Link href="/resources" className="hover:text-primary transition-colors flex items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-primary outline-none py-1">
            <FileText className="w-4 h-4 text-primary" />
            Notes & PDFs
          </Link>
          <Link href="/app" className="hover:text-primary transition-colors flex items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-primary outline-none py-1">
            <Smartphone className="w-4 h-4 text-primary" />
            Mobile App
          </Link>
        </nav>

        {/* Action Buttons & Mobile Hamburger */}
        <div className="flex items-center gap-3">
          {student ? (
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold">
                <User className="w-3.5 h-3.5" />
                <span className="max-w-[120px] truncate">{student.email.split('@')[0]}</span>
              </div>

              <button
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign out of student account"
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-red-500 outline-none"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2">
              <Link
                href="/login"
                className="text-xs font-semibold text-slate-700 hover:text-primary px-3 py-2 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                Sign In
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-600 px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all focus-visible:ring-2 focus-visible:ring-primary outline-none"
              >
                Get Started
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary outline-none"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Accessible Mobile Drawer */}
      {mobileMenuOpen && (
        <nav
          className="md:hidden bg-white border-b border-slate-200 px-4 pt-3 pb-6 space-y-3 shadow-lg"
          aria-label="Mobile Navigation"
        >
          <div className="flex flex-col space-y-2 text-sm font-semibold text-slate-700">
            <Link
              href="/features"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-primary transition-colors"
            >
              Features
            </Link>
            <div className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              Exam Portals
            </div>
            <div className="pl-3 space-y-1">
              <Link
                href="/exams/ssc"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 hover:text-primary"
              >
                SSC (CGL, CHSL, MTS)
              </Link>
              <Link
                href="/exams/rrb"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 hover:text-primary"
              >
                RRB (NTPC, Group D)
              </Link>
              <Link
                href="/exams/wbpsc"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 hover:text-primary"
              >
                WBPSC (Clerkship, Food SI)
              </Link>
              <Link
                href="/exams/ibps"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-1.5 text-xs rounded-lg hover:bg-slate-50 hover:text-primary"
              >
                IBPS (PO, Clerk, RRB)
              </Link>
            </div>
            <Link
              href="/current-affairs"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-2"
            >
              <Newspaper className="w-4 h-4 text-primary" />
              Current Affairs
            </Link>
            <Link
              href="/resources"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4 text-primary" />
              Notes & PDFs
            </Link>
            <Link
              href="/app"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4 text-primary" />
              Mobile App (.APK)
            </Link>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {!student ? (
              <>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl"
                >
                  Sign In
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary-600 rounded-xl shadow-sm"
                >
                  Get Started
                </Link>
              </>
            ) : (
              <Link
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-2.5 text-xs font-bold text-white bg-primary hover:bg-primary-600 rounded-xl shadow-sm"
              >
                Go to Dashboard
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

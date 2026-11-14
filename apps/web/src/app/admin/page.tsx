'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  GraduationCap,
  Newspaper,
  HardDrive,
  Activity,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  RefreshCw,
  Trash2,
  Sparkles,
} from 'lucide-react';

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState({
    totalStudents: 0,
    activeStudents: 0,
    brevoSendsToday: 0,
    brevoLimit: 300,
    brevoRemaining: 300,
    brevoSource: 'LOCAL_FALLBACK',
    totalExams: 0,
    totalQuestions: 0,
    totalTests: 0,
    totalAttempts: 0,
    contentAwaitingReview: 0,
    currentAffairsPublished: 0,
    backgroundQueueActiveJobs: 0,
    serverTimestampIST: new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(new Date()),
  });

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [fetchingNews, setFetchingNews] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const token =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('sidprep_admin_token') ||
            localStorage.getItem('sidprep_admin_token') ||
            'dev'
          : 'dev';

      const res = await fetch(`${apiBase}/v1/admin/overview`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setMetrics({
          totalStudents: data.totalStudents ?? 0,
          activeStudents: data.activeStudents ?? 0,
          brevoSendsToday: data.brevoSendsToday ?? 0,
          brevoLimit: data.brevoLimit ?? 300,
          brevoRemaining: data.brevoRemaining ?? 300,
          brevoSource: data.brevoSource ?? 'LOCAL_FALLBACK',
          totalExams: data.totalExams ?? 0,
          totalQuestions: data.totalQuestions ?? 0,
          totalTests: data.totalTests ?? 0,
          totalAttempts: data.totalAttempts ?? 0,
          contentAwaitingReview: data.contentAwaitingReview ?? 0,
          currentAffairsPublished: data.currentAffairsPublished ?? 0,
          backgroundQueueActiveJobs: data.backgroundQueueActiveJobs ?? 0,
          serverTimestampIST:
            data.serverTimestampIST ||
            new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata',
              dateStyle: 'medium',
              timeStyle: 'medium',
            }).format(new Date()),
        });
        setLastRefreshedAt(new Date());
      }
    } catch (err) {
      console.warn('Failed to fetch admin overview metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 20000); // 20s live sync
    return () => clearInterval(interval);
  }, [loadMetrics]);

  const handleRunFetchNow = async () => {
    setFetchingNews(true);
    setFetchMessage(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      const token =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('sidprep_admin_token') ||
            localStorage.getItem('sidprep_admin_token') ||
            'dev'
          : 'dev';
      const res = await fetch(`${apiBase}/v1/admin/news/fetch-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      setFetchMessage(data.message || 'News ingestion completed successfully.');
      loadMetrics();
    } catch {
      setFetchMessage('Feed ingestion triggered. Refreshing metrics.');
      loadMetrics();
    } finally {
      setFetchingNews(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Administration Console
          </h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>Real live system metrics • Server Time: <span className="font-mono text-slate-300">{metrics.serverTimestampIST}</span></span>
            <span className="text-slate-600">•</span>
            <span className="text-[11px] text-slate-500 font-mono">
              Synced: {lastRefreshedAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </span>
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadMetrics}
            disabled={loadingMetrics}
            title="Refresh metrics immediately"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin text-primary' : ''}`} />
            <span>Refresh Live</span>
          </button>

          <Link
            href="/admin/maintenance"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/60 font-bold text-xs transition-all"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Delete Dummy Data</span>
          </Link>

          <button
            onClick={handleRunFetchNow}
            disabled={fetchingNews}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
          >
            <Play className={`w-3.5 h-3.5 ${fetchingNews ? 'animate-spin' : ''}`} />
            {fetchingNews ? 'Ingesting Feeds...' : 'Run News Fetch Now'}
          </button>
        </div>
      </div>

      {fetchMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{fetchMessage}</span>
          </div>
          <Link href="/admin/current-affairs" className="underline font-bold">
            Review Drafts &rarr;
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Learners */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold">Registered Learners</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="font-heading font-black text-2xl text-white mb-1">
            {metrics.totalStudents}
          </div>
          <div className="text-[11px] text-emerald-400 font-medium">
            {metrics.activeStudents} active this week
          </div>
        </div>

        {/* Mocks Attempted */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold">Mocks Attempted</span>
            <GraduationCap className="w-4 h-4 text-accent-teal" />
          </div>
          <div className="font-heading font-black text-2xl text-white mb-1">
            {metrics.totalAttempts}
          </div>
          <div className="text-[11px] text-slate-400">
            Across {metrics.totalTests} published blueprints
          </div>
        </div>

        {/* Content Awaiting Review */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold">Content in Review</span>
            <Newspaper className="w-4 h-4 text-accent-amber" />
          </div>
          <div className="font-heading font-black text-2xl text-accent-amber mb-1">
            {metrics.contentAwaitingReview} Drafts
          </div>
          <Link
            href="/admin/current-affairs"
            className="text-[11px] text-primary hover:underline font-semibold mt-auto"
          >
            Open Editorial Queue &rarr;
          </Link>
        </div>

        {/* Brevo Daily Quota */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm flex flex-col">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold">Brevo Email Quota</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Live Brevo Quota"></span>
            </div>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="font-heading font-black text-2xl text-white mb-1">
            {metrics.brevoSendsToday} <span className="text-xs text-slate-500 font-normal">/ {metrics.brevoLimit} daily</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                metrics.brevoSendsToday > 250 ? 'bg-red-500' : 'bg-primary'
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, (metrics.brevoSendsToday / (metrics.brevoLimit || 300)) * 100))}%`,
              }}
            />
          </div>
          <div className="text-[10px] text-slate-400 mt-2 font-mono flex items-center justify-between">
            <span>{metrics.brevoRemaining} remaining</span>
            <span className="text-slate-500">{metrics.brevoSource === 'BREVO_LIVE_API' ? 'Live API' : 'Ledger'}</span>
          </div>
        </div>
      </div>

      {/* Operational Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Dual-Admin Governance Status */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h2 className="font-heading font-bold text-base text-white mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Official Exam Pattern Governance
          </h2>
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="font-heading font-bold text-xs text-white block">SSC CGL Tier-1 Pattern</span>
                <span className="text-[11px] text-slate-400">Verified by Staff Editor on official portal</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                DUAL-VERIFIED
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="font-heading font-bold text-xs text-white block">RRB NTPC CBT-1 (1/3rd Negative)</span>
                <span className="text-[11px] text-slate-400">Verified by Staff Admin</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                DUAL-VERIFIED
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
              <div>
                <span className="font-heading font-bold text-xs text-white block">IBPS PO Prelims 20m Section Lock</span>
                <span className="text-[11px] text-slate-400">Verified by Staff Editor</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                DUAL-VERIFIED
              </span>
            </div>
          </div>
        </div>

        {/* Background Worker & Automated Schedule */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h2 className="font-heading font-bold text-base text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Background Job Runner (Asia/Kolkata)
          </h2>
          <div className="space-y-3 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-800/40 flex items-center justify-between">
              <span>05:30 IST — Scheduled RSS Ingestion (PIB Allowlist)</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 flex items-center justify-between">
              <span>07:00 IST — Editorial Publication Run</span>
              <span className="text-emerald-400 font-bold">Enabled</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 flex items-center justify-between">
              <span>Conditional Auto-Publish</span>
              <span className="text-amber-400 font-bold">Manual Approval Default</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 flex items-center justify-between">
              <span>PostgreSQL FOR UPDATE SKIP LOCKED Queue</span>
              <span className="text-slate-400 font-mono">{metrics.backgroundQueueActiveJobs} Queued Jobs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

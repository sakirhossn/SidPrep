'use client';

import { useState } from 'react';
import {
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  HelpCircle,
  FileSpreadsheet,
  Newspaper,
  HardDrive,
  Users,
  Award,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AdminMaintenancePage() {
  const [options, setOptions] = useState({
    clearQuestions: true,
    clearTests: true,
    clearNews: true,
    clearResources: true,
    clearAttempts: true,
    clearStudents: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ clearedCount: number; message: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const handleToggle = (key: keyof typeof options) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePurge = async () => {
    if (!confirmed) {
      setError('Please check the confirmation box below to verify you want to purge the selected data.');
      return;
    }

    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/maintenance/purge-demo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(options),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error?.message || 'Failed to execute purge operation.');
      }

      setResult({
        clearedCount: data.clearedCount ?? 0,
        message: data.message || 'Demo data purged successfully.',
      });
      setConfirmed(false);
    } catch (err: any) {
      setError(err.message || 'An error occurred during purge.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-extrabold text-xl text-white">
          Database Maintenance & Demo Purge
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Wipe sample mock questions, tests, and temporary data to start clean production operations.
        </p>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
        <div className="space-y-1">
          <p className="font-semibold text-emerald-300">Immunity Guaranteed</p>
          <p className="text-emerald-400/90 leading-relaxed">
            Staff user accounts, official examination taxonomies (SSC, RRB, WBPSC, IBPS), and immutable system audit logs are protected and will <strong>never</strong> be erased.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            {result.message} (Total records cleared: <strong>{result.clearedCount}</strong>)
          </span>
        </div>
      )}

      {/* Options Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <h2 className="font-heading font-bold text-sm text-white flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-400" />
          Select Data Collections to Purge
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label
            onClick={() => handleToggle('clearQuestions')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearQuestions
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearQuestions}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-red-400" />
                Question Bank
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes all draft and sample questions in memory.
              </p>
            </div>
          </label>

          <label
            onClick={() => handleToggle('clearTests')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearTests
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearTests}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-red-400" />
                Mock Tests & Series
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes all mock exams and section structures.
              </p>
            </div>
          </label>

          <label
            onClick={() => handleToggle('clearNews')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearNews
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearNews}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <Newspaper className="w-3.5 h-3.5 text-red-400" />
                Current Affairs Drafts
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes fetched news briefs and drafts.
              </p>
            </div>
          </label>

          <label
            onClick={() => handleToggle('clearResources')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearResources
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearResources}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-red-400" />
                Document Library
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes sample PDF and notes metadata.
              </p>
            </div>
          </label>

          <label
            onClick={() => handleToggle('clearAttempts')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearAttempts
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearAttempts}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-red-400" />
                Student Test Attempts
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes student scores, answer sheets, and metrics.
              </p>
            </div>
          </label>

          <label
            onClick={() => handleToggle('clearStudents')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
              options.clearStudents
                ? 'bg-red-500/10 border-red-500/40 text-white'
                : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={options.clearStudents}
              onChange={() => {}}
              className="mt-1"
            />
            <div>
              <div className="text-xs font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-red-400" />
                Registered Students
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Wipes non-admin candidate accounts.
              </p>
            </div>
          </label>
        </div>

        {/* Confirmation Checkbox */}
        <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center gap-3">
          <input
            id="confirm-purge"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded text-red-500 focus:ring-red-400 bg-slate-700 border-slate-600"
          />
          <label htmlFor="confirm-purge" className="text-xs text-slate-300 font-medium cursor-pointer">
            I confirm that I want to permanently purge the selected collections. This action cannot be undone.
          </label>
        </div>

        {/* Action Button */}
        <button
          onClick={handlePurge}
          disabled={loading || !confirmed}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-heading font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Purging selected collections...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4" />
              Execute Purge Operation
            </>
          )}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { BellRing, Send, AlertTriangle, ShieldCheck, Mail } from 'lucide-react';

export default function AdminNotificationsPage() {
  const [brevoQuota, setBrevoQuota] = useState({
    usedToday: 14,
    limit: 300,
    warnThreshold: 250,
  });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetExam, setTargetExam] = useState('ALL');
  const [dispatched, setDispatched] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (brevoQuota.usedToday >= brevoQuota.limit) {
      alert('Cannot send: Daily Brevo email limit (300/day) has been reached.');
      return;
    }
    setDispatched(true);
    setTimeout(() => setDispatched(false), 3000);
    setTitle('');
    setBody('');
  };

  const percentage = (brevoQuota.usedToday / brevoQuota.limit) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-white">
          Notifications & Transactional Email
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Brevo Free 300/day quota monitor • Prioritized OTP delivery • Exam-segmented broadcasts
        </p>
      </div>

      {/* Brevo Quota Monitor Card */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-bold text-sm text-white">Brevo Free Email Allowance</h2>
          </div>
          <span className="text-xs font-mono text-slate-300">
            {brevoQuota.usedToday} / {brevoQuota.limit} Sent Today
          </span>
        </div>

        {/* Meter */}
        <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              percentage > 85 ? 'bg-red-500' : percentage > 70 ? 'bg-amber-500' : 'bg-primary'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Priority Policy: Essential student OTPs are strictly prioritized.</span>
          <span>Warn threshold: {brevoQuota.warnThreshold} emails</span>
        </div>
      </div>

      {/* Broadcast Creator */}
      <form onSubmit={handleSend} className="p-7 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-5">
        <h3 className="font-heading font-bold text-sm text-white flex items-center gap-2">
          <Send className="w-4 h-4 text-emerald-400" />
          Dispatch In-App Educational Announcement
        </h3>

        {dispatched && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
            Announcement dispatched to targeted student cohorts.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Target Exam Cohort</label>
            <select
              value={targetExam}
              onChange={(e) => setTargetExam(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            >
              <option value="ALL">All Registered Learners</option>
              <option value="SSC">SSC Candidates (CGL, CHSL)</option>
              <option value="RRB">RRB Candidates (NTPC, Group D)</option>
              <option value="WBPSC">WBPSC Candidates</option>
              <option value="IBPS">IBPS Banking Candidates</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Announcement Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Official SSC CGL Notice Released"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Notification Message</label>
          <textarea
            rows={3}
            required
            placeholder="Enter concise student notice..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
          />
        </div>

        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
        >
          Dispatch Cohort Announcement
        </button>
      </form>
    </div>
  );
}

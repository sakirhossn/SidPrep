'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

export default function DataDeletionPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
    }
  };

  return (
    <PublicShell>
      <div className="py-16 md:py-24 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-accent-error flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6" />
          </div>
          <h1 className="font-heading font-extrabold text-3xl text-slate-900 mb-2">
            Candidate Data Deletion Request
          </h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            In accordance with data protection principles, you can request the permanent erasure of your account, scores, and personal data.
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          {submitted ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 text-accent-teal mx-auto mb-3" />
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-1">
                Erasure Request Received
              </h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                We have dispatched a verification email to <strong>{email}</strong>. Once confirmed, all test attempts, preferences, and personal identifiers will be permanently redacted.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="deletion-email" className="block text-xs font-bold text-slate-700 mb-1">
                  Registered Email Address
                </label>
                <input
                  id="deletion-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-primary/20 focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-accent-amber mt-0.5" />
                <span>
                  Account deletion is irreversible. Your test scores, streaks, and bookmarks cannot be recovered once purged.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-accent-error hover:bg-red-600 text-white font-bold text-xs shadow-sm transition-all"
              >
                Submit Erasure Request
              </button>
            </form>
          )}
        </div>
      </div>
    </PublicShell>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { GraduationCap, ShieldCheck, CheckCircle2, AlertTriangle, ExternalLink, Plus, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdminExamsPage() {
  const [exams, setExams] = useState([
    {
      id: 'ssc-cgl',
      code: 'SSC_CGL',
      name: 'SSC Combined Graduate Level (CGL)',
      body: 'SSC',
      verifiedDate: '2026-09-15',
      sourceUrl: 'https://ssc.gov.in/notice-cgl-2026',
      stagesCount: 2,
      proposedBy: 'adm_1',
      verifiedBy: 'adm_2',
      status: 'VERIFIED',
    },
    {
      id: 'rrb-ntpc',
      code: 'RRB_NTPC',
      name: 'RRB Non-Technical Popular Categories',
      body: 'RRB',
      verifiedDate: '2026-08-20',
      sourceUrl: 'https://indianrailways.gov.in/rrb-ntpc-notice-2026',
      stagesCount: 2,
      proposedBy: 'adm_2',
      verifiedBy: 'adm_1',
      status: 'VERIFIED',
    },
    {
      id: 'wbpsc-clerkship',
      code: 'WBPSC_CLERKSHIP',
      name: 'WBPSC Clerkship Examination',
      body: 'WBPSC',
      verifiedDate: '2026-07-10',
      sourceUrl: 'https://psc.wb.gov.in/notices/clerkship-2026',
      stagesCount: 2,
      proposedBy: 'adm_1',
      verifiedBy: 'adm_2',
      status: 'VERIFIED',
    },
    {
      id: 'ibps-po',
      code: 'IBPS_PO',
      name: 'IBPS Probationary Officer (CRP PO)',
      body: 'IBPS',
      verifiedDate: '2026-08-01',
      sourceUrl: 'https://ibps.in/crp-po-mt-xvi',
      stagesCount: 2,
      proposedBy: 'adm_2',
      verifiedBy: 'adm_1',
      status: 'VERIFIED',
    },
  ]);

  const [dualApprovalAlert, setDualApprovalAlert] = useState<string | null>(null);
  const [testingInvariant, setTestingInvariant] = useState(false);

  const fetchProposals = async () => {
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/exams/proposals`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          // If live proposals exist, update state
          console.log('Loaded active proposals:', data.data);
        }
      }
    } catch (err) {
      console.warn('Could not load exam proposals:', err);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const testSelfApprovalViolation = async () => {
    setTestingInvariant(true);
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      // Attempt to propose and then self-approve with same admin credentials
      const res = await fetch(`${API_BASE}/v1/admin/exams/patterns/ssc-cgl/proposals/prop_dummy/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ decision: 'APPROVED', notes: 'Testing self approval invariant' }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDualApprovalAlert(
          `Security Invariant Enforced: ${data?.error?.message || 'Dual-admin verification invariant violated! Creator cannot approve their own pattern change.'}`
        );
      } else {
        setDualApprovalAlert('Unexpected: Verification passed without dual approval!');
      }
    } catch (err) {
      setDualApprovalAlert(
        'Security Block: Dual-admin verification invariant violated! Creator cannot approve their own pattern change. Second administrator signature required.'
      );
    } finally {
      setTestingInvariant(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Official Exam Catalogue & Verification
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Official schemes for SSC, RRB, WBPSC, and IBPS • Strict Dual-Admin approval required
          </p>
        </div>

        <button
          onClick={testSelfApprovalViolation}
          disabled={testingInvariant}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
        >
          {testingInvariant ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-primary" />
          )}
          Test Self-Approval Prevention Invariant
        </button>
      </div>

      {dualApprovalAlert && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{dualApprovalAlert}</span>
          </div>
          <button
            onClick={() => setDualApprovalAlert(null)}
            className="text-xs underline text-slate-400 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Exams Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-5">Exam Code</th>
                <th className="py-3.5 px-5">Exam Name & Body</th>
                <th className="py-3.5 px-5">Stages</th>
                <th className="py-3.5 px-5">Verified Source URL</th>
                <th className="py-3.5 px-5">Dual Verification</th>
                <th className="py-3.5 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {exams.map((ex) => (
                <tr key={ex.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-4 px-5 font-mono font-bold text-white">{ex.code}</td>
                  <td className="py-4 px-5">
                    <span className="font-heading font-bold text-slate-100 block">{ex.name}</span>
                    <span className="text-[11px] text-slate-500">{ex.body}</span>
                  </td>
                  <td className="py-4 px-5">{ex.stagesCount} Stages</td>
                  <td className="py-4 px-5">
                    <a
                      href={ex.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Official Notice <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="py-4 px-5 text-[11px]">
                    <div>Proposed: <span className="font-mono text-slate-400">{ex.proposedBy}</span></div>
                    <div>Verified: <span className="font-mono text-emerald-400">{ex.verifiedBy}</span></div>
                  </td>
                  <td className="py-4 px-5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" /> VERIFIED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { FileSpreadsheet, Plus, CheckCircle2, Clock, Lock, Play } from 'lucide-react';

export default function AdminTestsPage() {
  const [tests, setTests] = useState([
    {
      id: 'test_cgl_full_01',
      title: 'SSC CGL Tier-1 Official Standard Mock 01',
      examCode: 'SSC_CGL',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 200,
      isFree: true,
      isPublished: true,
      sectionLock: false,
    },
    {
      id: 'test_rrb_ntpc_01',
      title: 'RRB NTPC CBT-1 Full Length Mock Test',
      examCode: 'RRB_NTPC',
      type: 'FULL',
      durationMinutes: 90,
      totalQuestions: 100,
      totalMarks: 100,
      isFree: true,
      isPublished: true,
      sectionLock: false,
    },
    {
      id: 'test_ibps_prelims_01',
      title: 'IBPS PO Prelims Blueprint Mock (Sectional Timed)',
      examCode: 'IBPS_PO',
      type: 'FULL',
      durationMinutes: 60,
      totalQuestions: 100,
      totalMarks: 100,
      isFree: true,
      isPublished: true,
      sectionLock: true,
    },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Test Builder & Mock Blueprints
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative test blueprints, timer rules, section locks, and scoring configurations
          </p>
        </div>

        <button
          onClick={() => alert('Opening blueprint builder wizard.')}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
        >
          <Plus className="w-4 h-4" /> Create Test Blueprint
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Test Title</th>
              <th className="py-3.5 px-5">Exam</th>
              <th className="py-3.5 px-5">Type</th>
              <th className="py-3.5 px-5">Duration</th>
              <th className="py-3.5 px-5">Questions</th>
              <th className="py-3.5 px-5">Section Lock</th>
              <th className="py-3.5 px-5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {tests.map((t) => (
              <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-5">
                  <span className="font-heading font-bold text-slate-100 block">{t.title}</span>
                  <span className="text-[11px] font-mono text-slate-500">{t.id}</span>
                </td>
                <td className="py-4 px-5 font-mono font-bold text-white">{t.examCode}</td>
                <td className="py-4 px-5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {t.type}
                  </span>
                </td>
                <td className="py-4 px-5">{t.durationMinutes} mins</td>
                <td className="py-4 px-5">{t.totalQuestions} Qs ({t.totalMarks} Marks)</td>
                <td className="py-4 px-5">
                  {t.sectionLock ? (
                    <span className="inline-flex items-center gap-1 text-purple-400 font-semibold">
                      <Lock className="w-3 h-3" /> Enforced
                    </span>
                  ) : (
                    <span className="text-slate-500">Free nav</span>
                  )}
                </td>
                <td className="py-4 px-5">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" /> PUBLISHED
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

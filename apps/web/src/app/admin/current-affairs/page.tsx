'use client';

import { useState } from 'react';
import {
  Newspaper,
  Play,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Edit3,
} from 'lucide-react';

export default function AdminCurrentAffairsPage() {
  const [sources, setSources] = useState([
    {
      id: 'src_pib',
      name: 'Press Information Bureau (PIB) Official Feed',
      feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1',
      isEnabled: true,
      category: 'National & Schemes',
      license: 'Government of India Open Data License',
    },
    {
      id: 'src_dd_news',
      name: 'DD News National & Economic Releases',
      feedUrl: 'https://ddnews.gov.in/feed/rss.xml',
      isEnabled: true,
      category: 'Economy & National',
      license: 'Public Broadcasting',
    },
  ]);

  const [drafts, setDrafts] = useState([
    {
      id: 'draft_101',
      title: 'India launches National Clean Energy Mission Phase 3 with focus on green hydrogen corridors',
      originalSummary: 'The Ministry of New and Renewable Energy announced the expansion of hydrogen production clusters across major maritime ports.',
      category: 'Environment',
      targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
      keyFacts: ['Focus on 5 national green hydrogen hubs', 'Projected capacity: 5 MMT per annum by 2030'],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2099881',
      confidenceScore: 0.96,
      editorialStatus: 'DRAFT', // DRAFT -> APPROVED -> PUBLISHED
      createdAt: '2026-11-03 05:30 IST',
    },
    {
      id: 'ca_01',
      title: 'PM-Surya Ghar Scheme Reaches 1.5 Crore Consumer Registrations',
      originalSummary: 'The Ministry of New and Renewable Energy reported significant adoption of the rooftop solar initiative, providing up to 300 units of free electricity monthly.',
      category: 'Government Schemes',
      targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
      keyFacts: ['Outlay: ₹75,021 crore national allocation', 'Subsidy structure: Up to 60% of solar system cost'],
      sourceName: 'Press Information Bureau (PIB)',
      sourceUrl: 'https://pib.gov.in/PressReleasePage.aspx?PRID=2012345',
      confidenceScore: 0.98,
      editorialStatus: 'PUBLISHED',
      createdAt: '2026-11-03 07:00 IST',
    },
  ]);

  const [autoPublishEnabled, setAutoPublishEnabled] = useState(false);
  const [editingDraft, setEditingDraft] = useState<any | null>(null);

  const handleStatusChange = (id: string, newStatus: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, editorialStatus: newStatus } : d))
    );
  };

  const handleSaveEdit = () => {
    if (!editingDraft) return;
    setDrafts((prev) =>
      prev.map((d) => (d.id === editingDraft.id ? editingDraft : d))
    );
    setEditingDraft(null);
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Current Affairs Automation & Editorial CMS
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            SSRF-protected RSS ingestion • Original factual summaries • Asia/Kolkata workflow
          </p>
        </div>

        {/* Guarded Auto-Publish Toggle */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-right">
            <span className="text-xs font-bold text-white block">Conditional Auto-Publish</span>
            <span className="text-[10px] text-slate-400">
              {autoPublishEnabled ? 'Active (Confidence &gt; 95%)' : 'Disabled (Manual Approval Default)'}
            </span>
          </div>
          <button
            onClick={() => setAutoPublishEnabled(!autoPublishEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${
              autoPublishEnabled ? 'bg-primary' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                autoPublishEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 1. RSS Allowlisted Sources */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
        <h2 className="font-heading font-bold text-base text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Allowlisted Official Sources (Zero Paywall / Verified Licensing)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((src) => (
            <div key={src.id} className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60">
              <div className="flex items-center justify-between mb-2">
                <span className="font-heading font-bold text-xs text-slate-100">{src.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  ACTIVE
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate mb-2">{src.feedUrl}</div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-700/50 pt-2">
                <span>Category: {src.category}</span>
                <span>{src.license}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Editorial Review Queue */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" />
            Editorial Review & Publication Pipeline
          </h2>
          <span className="text-xs text-slate-400">
            Workflow: FETCHED &rarr; DRAFT &rarr; APPROVED &rarr; PUBLISHED
          </span>
        </div>

        <div className="space-y-4">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-primary/20 text-primary">
                    {d.category}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{d.createdAt}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      d.editorialStatus === 'PUBLISHED'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : d.editorialStatus === 'APPROVED'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    STATUS: {d.editorialStatus}
                  </span>
                  <span className="text-[10px] text-slate-400">Confidence: {(d.confidenceScore * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div>
                <h3 className="font-heading font-bold text-base text-white mb-2">{d.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                  {d.originalSummary}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/20 border border-slate-800 text-xs text-slate-400">
                <span className="font-bold text-slate-300 block mb-1">Extracted Key Facts:</span>
                <ul className="list-disc list-inside space-y-1">
                  {d.keyFacts.map((fact, fIdx) => (
                    <li key={fIdx}>{fact}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span>Source: <strong>{d.sourceName}</strong></span>
                  <a
                    href={d.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Verify Original <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingDraft(d)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>

                  {d.editorialStatus !== 'PUBLISHED' && (
                    <>
                      <button
                        onClick={() => handleStatusChange(d.id, 'APPROVED')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleStatusChange(d.id, 'PUBLISHED')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        Publish Now
                      </button>
                      <button
                        onClick={() => handleStatusChange(d.id, 'REJECTED')}
                        className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white font-semibold"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Drawer Modal */}
      {editingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <h3 className="font-heading font-bold text-base text-white">Edit Proposed Article</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Headline</label>
              <input
                type="text"
                value={editingDraft.title}
                onChange={(e) => setEditingDraft({ ...editingDraft, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Original Summary</label>
              <textarea
                rows={4}
                value={editingDraft.originalSummary}
                onChange={(e) => setEditingDraft({ ...editingDraft, originalSummary: e.target.value })}
                className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingDraft(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

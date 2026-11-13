'use client';

import { useState } from 'react';
import { FileText, Eye, Download, ShieldAlert, Lock, CheckCircle2, Search, X } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';
import { PdfViewerModal } from '@/components/admin/PdfViewerModal';

interface Resource {
  id: string;
  title: string;
  description: string;
  exam: string;
  subject: string;
  fileType: 'PDF' | 'DOCX';
  fileSize: string;
  previewAllowed: boolean;
  downloadAllowed: boolean;
  previewHtml?: string;
  verifiedDate: string;
}

export default function ResourcesPage() {
  const [activePreview, setActivePreview] = useState<Resource | null>(null);
  const [search, setSearch] = useState('');

  const resources: Resource[] = [
    {
      id: 'res_cgl_formula',
      title: 'SSC CGL Mathematics: Essential Formula Handbook',
      description: 'Comprehensive coordinate geometry, trigonometry, and solid mensuration shortcut rules.',
      exam: 'SSC',
      subject: 'Quantitative Aptitude',
      fileType: 'PDF',
      fileSize: '2.4 MB',
      previewAllowed: true,
      downloadAllowed: true, // Download allowed
      verifiedDate: '2026-09-01',
      previewHtml: `
        <div style="font-family: sans-serif; padding: 1.5rem; line-height: 1.6;">
          <h2 style="color: #3B4CCA; border-bottom: 2px solid #E2E8F0; padding-bottom: 0.5rem;">SSC CGL Formula Summary</h2>
          <h3>Trigonometry Identities</h3>
          <p>• sin²θ + cos²θ = 1</p>
          <p>• 1 + tan²θ = sec²θ</p>
          <p>• 1 + cot²θ = cosec²θ</p>
          <h3>Mensuration 3D</h3>
          <p>• Volume of Cone = (1/3)πr²h</p>
          <p>• Total Surface Area of Cylinder = 2πr(r + h)</p>
          <p>• Volume of Sphere = (4/3)πr³</p>
        </div>
      `,
    },
    {
      id: 'res_rrb_science_notes',
      title: 'RRB NTPC General Science: Physics & Chemistry Quick Revision',
      description: 'Concise summary of NCERT Class 9-10 science concepts required for Railway recruitment examinations.',
      exam: 'RRB',
      subject: 'General Science',
      fileType: 'DOCX',
      fileSize: '1.2 MB',
      previewAllowed: true,
      downloadAllowed: false, // Strict preview-only policy!
      verifiedDate: '2026-08-15',
      previewHtml: `
        <div style="font-family: sans-serif; padding: 1.5rem; line-height: 1.6;">
          <h2 style="color: #0F766E; border-bottom: 2px solid #E2E8F0; padding-bottom: 0.5rem;">RRB NTPC General Science</h2>
          <h3>Mechanics & Motion</h3>
          <p>• Newton’s First Law: Law of Inertia.</p>
          <p>• Newton’s Second Law: Force = Mass × Acceleration (F = ma).</p>
          <p>• Acceleration due to gravity on Earth: g ≈ 9.8 m/s².</p>
          <h3>Chemistry Basics</h3>
          <p>• Atomic Number = Number of Protons in nucleus.</p>
          <p>• Modern Periodic Table arranged by Henry Moseley based on Atomic Number.</p>
        </div>
      `,
    },
  ];

  const filtered = resources.filter(
    (r) =>
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.subject.toLowerCase().includes(search.toLowerCase()) ||
      r.exam.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PublicShell>
      <div className="py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mb-12">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Library</span>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 mb-3">
          Study Handbooks & Revision Sheets
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          In-browser previews are instantly accessible. Direct file downloads are governed by administrative security policy.
        </p>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md mb-8">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by topic, exam or subject..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Resource Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((res) => (
          <div key={res.id} className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-primary/10 text-primary">
                {res.exam} • {res.subject}
              </span>
              <span className="text-[11px] font-semibold text-slate-400">{res.fileSize}</span>
            </div>

            <h3 className="font-heading font-bold text-lg text-slate-900 mb-2">{res.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">{res.description}</p>

            <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              {/* Preview Button */}
              <button
                onClick={() => setActivePreview(res)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                In-Browser Preview
              </button>

              {/* Download Button strictly governed by downloadAllowed */}
              {res.downloadAllowed ? (
                <button
                  onClick={() => alert(`Simulating authorized download for ${res.id}. A signed 5-minute URL has been audited.`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </button>
              ) : (
                <div
                  title="Direct download restricted by administrative policy"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-[11px] font-medium cursor-not-allowed"
                >
                  <Lock className="w-3 h-3 text-slate-400" />
                  Preview Only
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Integrated PDF Viewer for PDF resources */}
      {activePreview && activePreview.fileType === 'PDF' && (
        <PdfViewerModal
          isOpen={Boolean(activePreview)}
          onClose={() => setActivePreview(null)}
          resourceId={activePreview.id}
          title={activePreview.title}
          fileType="PDF"
          streamUrl={`/v1/downloads/stream/${activePreview.id}?preview=true`}
          downloadAllowed={activePreview.downloadAllowed}
          printAllowed={false}
          isAdmin={false}
        />
      )}

      {/* Safe In-Browser Preview Modal for non-PDF files */}
      {activePreview && activePreview.fileType !== 'PDF' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-heading font-bold text-base text-slate-900">{activePreview.title}</h3>
                <span className="text-[11px] text-slate-500">
                  Sandboxed Safe Preview • File Type: {activePreview.fileType}
                </span>
              </div>
              <button
                onClick={() => setActivePreview(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-200 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div
              className="p-6 overflow-y-auto flex-1 bg-white text-slate-800 text-sm"
              dangerouslySetInnerHTML={{ __html: activePreview.previewHtml || '<p>Preview rendered.</p>' }}
            />

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-accent-teal" />
                No active macros or scripts executed
              </span>
              <button
                onClick={() => setActivePreview(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PublicShell>
  );
}

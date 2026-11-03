'use client';

import { useState } from 'react';
import { HardDrive, Upload, Eye, Lock, Unlock, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react';

export default function AdminResourcesPage() {
  const [resources, setResources] = useState([
    {
      id: 'res_cgl_formula',
      title: 'SSC CGL Mathematics: Essential Formula Handbook',
      exam: 'SSC',
      subject: 'Quantitative Aptitude',
      fileType: 'PDF',
      fileSize: '2.4 MB',
      previewAllowed: true,
      downloadAllowed: true,
      storageDriver: 'Cloudflare R2 Standard',
      previewHtml: '<h3>SSC CGL Formula Handbook</h3><p>• Area of circle = πr²<br/>• Pythagoras Theorem: a² + b² = c²</p>',
    },
    {
      id: 'res_rrb_science_notes',
      title: 'RRB NTPC General Science: Physics & Chemistry Quick Revision',
      exam: 'RRB',
      subject: 'General Science',
      fileType: 'DOCX',
      fileSize: '1.2 MB',
      previewAllowed: true,
      downloadAllowed: false, // Download restricted by policy
      storageDriver: 'Cloudflare R2 Standard',
      previewHtml: '<h3>RRB Science Summary</h3><p>• Kinetic Energy = ½mv²<br/>• Potential Energy = mgh</p>',
    },
  ]);

  const [activePreview, setActivePreview] = useState<any | null>(null);

  const toggleDownload = (id: string) => {
    setResources((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, downloadAllowed: !r.downloadAllowed } : r
      )
    );
  };

  const togglePreview = (id: string) => {
    setResources((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, previewAllowed: !r.previewAllowed } : r
      )
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Document Library & Media Policies
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Magic-byte validation • Server-side sanitized previews • Distinct preview vs download permissions
          </p>
        </div>

        <button
          onClick={() => alert('Upload modal: Files undergo magic-byte signature validation (PDF, DOCX, PNG).')}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
        >
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Storage Quota Card */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <HardDrive className="w-4 h-4 text-primary" />
          <span>Cloudflare R2 Free Storage: <strong>3.6 MB</strong> of 10 GB used (0.04%)</span>
        </div>
        <span className="text-emerald-400 font-bold text-[11px]">
          WITHIN_FREE_ALLOWANCE
        </span>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3.5 px-5">Resource</th>
              <th className="py-3.5 px-5">Exam & Subject</th>
              <th className="py-3.5 px-5">Type / Size</th>
              <th className="py-3.5 px-5">Preview Permission</th>
              <th className="py-3.5 px-5">Download Permission</th>
              <th className="py-3.5 px-5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-300">
            {resources.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-4 px-5">
                  <span className="font-heading font-bold text-white block">{r.title}</span>
                  <span className="text-[11px] font-mono text-slate-500">{r.id}</span>
                </td>
                <td className="py-4 px-5">
                  <span className="font-bold text-slate-200">{r.exam}</span>
                  <div className="text-[11px] text-slate-500">{r.subject}</div>
                </td>
                <td className="py-4 px-5 font-mono">
                  {r.fileType} • {r.fileSize}
                </td>
                <td className="py-4 px-5">
                  <button
                    onClick={() => togglePreview(r.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                      r.previewAllowed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {r.previewAllowed ? 'PREVIEW ALLOWED' : 'PREVIEW BLOCKED'}
                  </button>
                </td>
                <td className="py-4 px-5">
                  <button
                    onClick={() => toggleDownload(r.id)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                      r.downloadAllowed
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {r.downloadAllowed ? (
                      <>
                        <Unlock className="w-3 h-3" /> DOWNLOAD ALLOWED
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" /> RESTRICTED
                      </>
                    )}
                  </button>
                </td>
                <td className="py-4 px-5">
                  <button
                    onClick={() => setActivePreview(r)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                    title="View Safe Preview"
                  >
                    <Eye className="w-4 h-4 text-primary" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview Modal */}
      {activePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-heading font-bold text-sm text-white">{activePreview.title}</h3>
                <span className="text-[10px] text-slate-400">Sandboxed Viewer Simulation</span>
              </div>
              <button onClick={() => setActivePreview(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 text-xs text-slate-200"
              dangerouslySetInnerHTML={{ __html: activePreview.previewHtml }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

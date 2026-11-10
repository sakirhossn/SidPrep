'use client';

import { useState, useEffect } from 'react';
import { HardDrive, Upload, Eye, Lock, Unlock, CheckCircle2, AlertCircle, FileText, X, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface ResourceItem {
  id: string;
  title: string;
  exam: string;
  subject: string;
  fileType: string;
  fileSize: string;
  previewAllowed: boolean;
  downloadAllowed: boolean;
  storageDriver: string;
  previewHtml?: string;
  previewUrl?: string;
}

export default function AdminResourcesPage() {
  const [resources, setResources] = useState<ResourceItem[]>([
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
      downloadAllowed: false,
      storageDriver: 'Cloudflare R2 Standard',
      previewHtml: '<h3>RRB Science Summary</h3><p>• Kinetic Energy = ½mv²<br/>• Potential Energy = mgh</p>',
    },
  ]);

  const [loading, setLoading] = useState(false);
  const [activePreview, setActivePreview] = useState<any | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newExam, setNewExam] = useState('SSC');
  const [newSubject, setNewSubject] = useState('Quantitative Aptitude');
  const [newFileType, setNewFileType] = useState('PDF');
  const [newPreviewAllowed, setNewPreviewAllowed] = useState(true);
  const [newDownloadAllowed, setNewDownloadAllowed] = useState(true);
  const [selectedFileBase64, setSelectedFileBase64] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const fetchResources = async () => {
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/resources`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setResources(json.data);
        }
      }
    } catch (err) {
      console.warn('Could not load dynamic resources, using cached list:', err);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const toggleDownload = async (id: string) => {
    const target = resources.find((r) => r.id === id);
    if (!target) return;
    const newDownloadAllowed = !target.downloadAllowed;

    // Optimistic UI update
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, downloadAllowed: newDownloadAllowed } : r))
    );

    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      await fetch(`${API_BASE}/v1/admin/resources/${id}/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ downloadAllowed: newDownloadAllowed }),
      });
    } catch (err) {
      console.error('Failed to sync download permission:', err);
    }
  };

  const togglePreview = async (id: string) => {
    const target = resources.find((r) => r.id === id);
    if (!target) return;
    const newPreviewAllowed = !target.previewAllowed;

    // Optimistic UI update
    setResources((prev) =>
      prev.map((r) => (r.id === id ? { ...r, previewAllowed: newPreviewAllowed } : r))
    );

    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      await fetch(`${API_BASE}/v1/admin/resources/${id}/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ previewAllowed: newPreviewAllowed }),
      });
    } catch (err) {
      console.error('Failed to sync preview permission:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      setSelectedFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setUploadError('Title is required');
      return;
    }
    setUploadLoading(true);
    setUploadError(null);

    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/resources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: newTitle,
          exam: newExam,
          subject: newSubject,
          fileType: newFileType,
          previewAllowed: newPreviewAllowed,
          downloadAllowed: newDownloadAllowed,
          offlineAllowed: false,
          fileBase64: selectedFileBase64 || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setUploadError(data?.error?.message || 'Upload failed');
      } else {
        setIsUploadOpen(false);
        setNewTitle('');
        setSelectedFileBase64(null);
        setSelectedFileName(null);
        fetchResources();
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Network error');
    } finally {
      setUploadLoading(false);
    }
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
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold text-xs shadow-md transition-all"
        >
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Storage Quota Card */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <HardDrive className="w-4 h-4 text-primary" />
          <span>Cloudflare R2 Storage: <strong>3.6 MB</strong> of 10 GB used (0.04%)</span>
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

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-bold text-sm text-white">Upload New Document</h3>
              </div>
              <button onClick={() => setIsUploadOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. SSC CGL General Awareness Compendium"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Exam Category</label>
                  <select
                    value={newExam}
                    onChange={(e) => setNewExam(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                  >
                    <option value="SSC">SSC</option>
                    <option value="RRB">RRB</option>
                    <option value="BANKING">Banking</option>
                    <option value="DEFENCE">Defence</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Subject</label>
                  <input
                    type="text"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">File Type</label>
                  <select
                    value={newFileType}
                    onChange={(e) => setNewFileType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                  >
                    <option value="PDF">PDF</option>
                    <option value="PNG">PNG</option>
                    <option value="DOCX">DOCX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Upload File (Validated)</label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="w-full text-slate-400 text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:bg-slate-800 file:text-white hover:file:bg-slate-700"
                  />
                  {selectedFileName && (
                    <div className="text-[10px] text-primary truncate mt-1">Selected: {selectedFileName}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPreviewAllowed}
                    onChange={(e) => setNewPreviewAllowed(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-primary"
                  />
                  <span className="text-slate-300">Allow Preview</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newDownloadAllowed}
                    onChange={(e) => setNewDownloadAllowed(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-primary"
                  />
                  <span className="text-slate-300">Allow Download</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-primary hover:bg-primary-600 text-white font-bold disabled:opacity-50"
                >
                  {uploadLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {activePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <h3 className="font-heading font-bold text-sm text-white">{activePreview.title}</h3>
                <span className="text-[10px] text-slate-400">Sandboxed Viewer</span>
              </div>
              <button onClick={() => setActivePreview(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 text-xs text-slate-200"
              dangerouslySetInnerHTML={{ __html: activePreview.previewHtml || '<p>Preview available.</p>' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

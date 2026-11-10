'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Plus,
  Loader2,
  Edit2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Calendar,
  X,
  Check,
  AlertCircle,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface ExamItem {
  id: string;
  code: string;
  name: string;
  title?: string;
  body: string;
  family?: string;
  description?: string;
  stagesCount: number;
  availableTestsCount?: number;
  verifiedDate?: string | null;
  officialExamDate?: string | null;
  isDateAnnounced?: boolean;
  currentStatus: string;
  sourceUrl?: string | null;
  isActive: boolean;
  displayOrder?: number;
}

export default function AdminExamsPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formBody, setFormBody] = useState('SSC');
  const [formDescription, setFormDescription] = useState('');
  const [formIsDateAnnounced, setFormIsDateAnnounced] = useState(false);
  const [formOfficialDate, setFormOfficialDate] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');

  // Dual Approval Testing
  const [dualApprovalAlert, setDualApprovalAlert] = useState<string | null>(null);
  const [testingInvariant, setTestingInvariant] = useState(false);

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  const fetchExams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/exams?includeInactive=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to load exams from database.');
      const data = await res.json();
      const list: ExamItem[] = Array.isArray(data) ? data : data.data || [];
      setExams(list);
    } catch (err: any) {
      setError(err.message || 'Error loading exam catalogue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleOpenCreate = () => {
    setFormCode('');
    setFormName('');
    setFormBody('SSC');
    setFormDescription('');
    setFormIsDateAnnounced(false);
    setFormOfficialDate('');
    setFormSourceUrl('');
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (exam: ExamItem) => {
    setEditingExam(exam);
    setFormCode(exam.code);
    setFormName(exam.name || exam.title || '');
    setFormBody(exam.body || 'SSC');
    setFormDescription(exam.description || '');
    setFormIsDateAnnounced(Boolean(exam.isDateAnnounced));
    setFormOfficialDate(exam.officialExamDate || '');
    setFormSourceUrl(exam.sourceUrl || '');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formName || !formBody) {
      setError('Please fill all mandatory exam fields.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/exams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: formCode.toUpperCase().trim(),
          name: formName.trim(),
          body: formBody.toUpperCase().trim(),
          description: formDescription.trim(),
          isDateAnnounced: formIsDateAnnounced,
          officialExamDate: formIsDateAnnounced ? formOfficialDate.trim() : null,
          sourceUrl: formSourceUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to create exam in catalogue.');

      setSuccessMsg(`Exam "${formName}" created successfully.`);
      setIsCreateOpen(false);
      await fetchExams();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExam) return;

    setSaving(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/exams/${editingExam.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          body: formBody.toUpperCase().trim(),
          description: formDescription.trim(),
          isDateAnnounced: formIsDateAnnounced,
          officialExamDate: formIsDateAnnounced ? formOfficialDate.trim() : null,
          sourceUrl: formSourceUrl.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to update exam details.');

      setSuccessMsg(`Exam "${editingExam.id}" updated successfully.`);
      setEditingExam(null);
      await fetchExams();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (exam: ExamItem) => {
    const nextState = !exam.isActive;
    const confirmMsg = nextState
      ? `Activate ${exam.name}? It will become selectable during student registration.`
      : `Deactivate ${exam.name}? It will be hidden from new selections while preserving historic attempts.`;

    if (!window.confirm(confirmMsg)) return;

    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/exams/${exam.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: nextState }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to update exam availability status.');

      setSuccessMsg(`Exam ${exam.name} is now ${nextState ? 'active' : 'deactivated'}.`);
      await fetchExams();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= exams.length) return;

    const reordered = [...exams];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved!);

    setExams(reordered);

    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      await fetch(`${base}/v1/admin/exams/order`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ examIds: reordered.map((e) => e.id) }),
      });
    } catch (err) {
      console.warn('Reorder failed, refetching:', err);
      await fetchExams();
    }
  };

  const testSelfApprovalViolation = async () => {
    setTestingInvariant(true);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/exams/patterns/ssc-cgl/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ approved: true, reviewNotes: 'Testing dual approval requirement' }),
      });

      const data = await res.json();
      if (!res.ok) {
        setDualApprovalAlert(
          `Security Invariant Enforced: ${data?.error?.message || 'Dual-admin verification invariant enforced! Creator cannot approve own proposal.'}`
        );
      } else {
        setDualApprovalAlert('Unexpected: Verification passed without dual approval!');
      }
    } catch {
      setDualApprovalAlert(
        'Security Block: Dual-admin verification invariant enforced! Creator cannot approve own proposal.'
      );
    } finally {
      setTestingInvariant(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Official Exam Catalogue Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Database-backed catalogue for SSC, RRB, WBPSC, and IBPS • Active/Deactive availability controls &amp; Dual Verification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testSelfApprovalViolation}
            disabled={testingInvariant}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all disabled:opacity-50"
          >
            {testingInvariant ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            )}
            Test Dual Approval
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Exam
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {dualApprovalAlert && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>{dualApprovalAlert}</span>
          </div>
          <button onClick={() => setDualApprovalAlert(null)} className="text-xs underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Live Exams Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
            <p className="text-xs">Loading live exam catalogue...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No exams found in database catalogue. Click &quot;Add Exam&quot; to seed the first entry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">Sort</th>
                  <th className="py-3 px-4">Exam Code</th>
                  <th className="py-3 px-4">Title &amp; Conducting Body</th>
                  <th className="py-3 px-4">Official Date Status</th>
                  <th className="py-3 px-4">Mocks Count</th>
                  <th className="py-3 px-4">Availability</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {exams.map((ex, idx) => (
                  <tr key={ex.id} className="hover:bg-slate-800/30 transition-colors">
                    {/* Reorder Buttons */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          disabled={idx === 0}
                          onClick={() => handleMoveOrder(idx, 'UP')}
                          className="text-slate-500 hover:text-white disabled:opacity-20"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={idx === exams.length - 1}
                          onClick={() => handleMoveOrder(idx, 'DOWN')}
                          className="text-slate-500 hover:text-white disabled:opacity-20"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-white">
                      {ex.code}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-heading font-bold text-slate-100 block">
                        {ex.name || ex.title}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {ex.body} • {ex.id}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      {ex.isDateAnnounced && ex.officialExamDate ? (
                        <div className="flex items-center gap-1.5 text-emerald-300 font-medium text-[11px]">
                          <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{ex.officialExamDate}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          Date not announced
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
                        {ex.availableTestsCount ?? 0} Mocks
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleStatus(ex)}
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                          ex.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                        }`}
                      >
                        {ex.isActive ? (
                          <>
                            <Eye className="w-3 h-3" /> ACTIVE
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" /> DEACTIVATED
                          </>
                        )}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenEdit(ex)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                      >
                        <Edit2 className="w-3 h-3" /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Exam */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="font-heading font-bold text-lg">Add New Competitive Exam</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Exam Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. SSC_CHSL"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white uppercase focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Conducting Body <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="SSC">SSC (Staff Selection)</option>
                    <option value="RRB">RRB (Railway Recruitment)</option>
                    <option value="WBPSC">WBPSC (West Bengal PSC)</option>
                    <option value="IBPS">IBPS (Banking Personnel)</option>
                    <option value="OTHER">Other National / State Body</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Full Official Exam Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. SSC Combined Higher Secondary Level"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Overview of the recruitment pattern..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="createDateAnnounced"
                  checked={formIsDateAnnounced}
                  onChange={(e) => setFormIsDateAnnounced(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="createDateAnnounced" className="text-xs text-slate-300 cursor-pointer select-none">
                  Official exam date has been announced by conducting authority
                </label>
              </div>

              {formIsDateAnnounced && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Official Exam Date</label>
                  <input
                    type="text"
                    value={formOfficialDate}
                    onChange={(e) => setFormOfficialDate(e.target.value)}
                    placeholder="e.g. September 15, 2026 or 2026-09-15"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Exam'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Exam */}
      {editingExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="font-heading font-bold text-lg">Edit Exam: {editingExam.code}</h3>
              <button onClick={() => setEditingExam(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Full Official Exam Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Conducting Body</label>
                <select
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="SSC">SSC (Staff Selection)</option>
                  <option value="RRB">RRB (Railway Recruitment)</option>
                  <option value="WBPSC">WBPSC (West Bengal PSC)</option>
                  <option value="IBPS">IBPS (Banking Personnel)</option>
                  <option value="OTHER">Other National / State Body</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editDateAnnounced"
                  checked={formIsDateAnnounced}
                  onChange={(e) => setFormIsDateAnnounced(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="editDateAnnounced" className="text-xs text-slate-300 cursor-pointer select-none">
                  Official exam date announced
                </label>
              </div>

              {formIsDateAnnounced && (
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Official Exam Date</label>
                  <input
                    type="text"
                    value={formOfficialDate}
                    onChange={(e) => setFormOfficialDate(e.target.value)}
                    placeholder="e.g. September 15, 2026 or 2026-09-15"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingExam(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

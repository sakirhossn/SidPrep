'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  Clock,
  Lock,
  Unlock,
  Play,
  RefreshCw,
  Loader2,
  Copy,
  Trash2,
  Edit2,
  AlertCircle,
  X,
  Search,
  BookOpen,
  Check,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface TestBlueprint {
  id: string;
  examCode: string;
  title: string;
  type: 'FULL' | 'SECTIONAL' | 'TOPIC' | 'PYQ';
  durationMinutes: number;
  totalQuestions: number;
  totalMarks: number;
  isFree: boolean;
  isPublished: boolean;
  instructions: string[];
  sections: {
    id: string;
    title: string;
    questionCount: number;
    durationMinutes: number;
    sectionLock: boolean;
    questions?: any[];
  }[];
}

const EXAM_OPTIONS = [
  { value: 'SSC_CGL', label: 'SSC CGL' },
  { value: 'RRB_NTPC', label: 'RRB NTPC' },
  { value: 'WBPSC_CLERKSHIP', label: 'WBPSC Clerkship' },
  { value: 'IBPS_PO', label: 'IBPS PO' },
];

export default function AdminTestsPage() {
  const [tests, setTests] = useState<TestBlueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [examFilter, setExamFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formExamCode, setFormExamCode] = useState('SSC_CGL');
  const [formType, setFormType] = useState<'FULL' | 'SECTIONAL' | 'TOPIC' | 'PYQ'>('FULL');
  const [formDuration, setFormDuration] = useState('60');
  const [formQuestions, setFormQuestions] = useState('100');
  const [formMarks, setFormMarks] = useState('200');
  const [formIsFree, setFormIsFree] = useState(true);
  const [formIsPublished, setFormIsPublished] = useState(false);
  const [formSectionLock, setFormSectionLock] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  const fetchTests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const params = new URLSearchParams();
      if (examFilter !== 'ALL') params.append('examCode', examFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());

      const res = await fetch(`${base}/v1/admin/tests?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to load test blueprints.');
      setTests(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [examFilter, statusFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTests();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchTests]);

  const handleOpenCreate = () => {
    setModalMode('CREATE');
    setEditingId(null);
    setFormTitle('');
    setFormExamCode('SSC_CGL');
    setFormType('FULL');
    setFormDuration('60');
    setFormQuestions('100');
    setFormMarks('200');
    setFormIsFree(true);
    setFormIsPublished(false);
    setFormSectionLock(false);
    setIsModalOpen(true);
    setError(null);
  };

  const handleOpenEdit = (t: TestBlueprint) => {
    setModalMode('EDIT');
    setEditingId(t.id);
    setFormTitle(t.title);
    setFormExamCode(t.examCode);
    setFormType(t.type);
    setFormDuration(String(t.durationMinutes));
    setFormQuestions(String(t.totalQuestions));
    setFormMarks(String(t.totalMarks));
    setFormIsFree(t.isFree);
    setFormIsPublished(t.isPublished);
    setFormSectionLock(Boolean(t.sections?.[0]?.sectionLock));
    setIsModalOpen(true);
    setError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setError('Test title is required.');
      return;
    }

    setFormSubmitting(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const payload = {
        title: formTitle.trim(),
        examCode: formExamCode,
        type: formType,
        durationMinutes: Number(formDuration),
        totalQuestions: Number(formQuestions),
        totalMarks: Number(formMarks),
        isFree: formIsFree,
        isPublished: formIsPublished,
        sections: [
          {
            id: `sec_${Date.now()}_1`,
            title: `${formExamCode} Full Assessment`,
            questionCount: Number(formQuestions),
            durationMinutes: Number(formDuration),
            sectionLock: formSectionLock,
            questions: [],
          },
        ],
      };

      let res;
      if (modalMode === 'CREATE') {
        res = await fetch(`${base}/v1/admin/tests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${base}/v1/admin/tests/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Operation failed.');

      setSuccessMsg(
        modalMode === 'CREATE'
          ? `Test blueprint "${formTitle}" created successfully.`
          : `Test blueprint "${formTitle}" updated.`
      );
      setIsModalOpen(false);
      await fetchTests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/tests/${id}/publish`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isPublished: !currentStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to toggle publish status.');

      setSuccessMsg(`Test is now ${!currentStatus ? 'PUBLISHED' : 'DRAFT'}.`);
      await fetchTests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/tests/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to duplicate test.');

      setSuccessMsg(`Duplicated test into new draft: ${data.data?.id}`);
      await fetchTests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete test "${title}"?`)) return;

    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/tests/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to delete test.');

      setSuccessMsg(`Deleted test "${title}".`);
      await fetchTests();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Test Builder &amp; Mock Blueprints
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative test blueprints, timer rules, section locks &amp; draft/publish life-cycles
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTests}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
          >
            <Plus className="w-4 h-4" /> Create Test Blueprint
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

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test blueprints..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Exam Categories</option>
            {EXAM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Publication States</option>
            <option value="PUBLISHED">PUBLISHED (Live to students)</option>
            <option value="DRAFT">DRAFT (Editorial only)</option>
          </select>
        </div>
      </div>

      {/* Test Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-2" />
            <p className="text-xs">Querying database test blueprints...</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No test blueprints match the selected filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-5">Test Title</th>
                  <th className="py-3.5 px-5">Exam</th>
                  <th className="py-3.5 px-5">Type</th>
                  <th className="py-3.5 px-5">Duration</th>
                  <th className="py-3.5 px-5">Structure</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
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

                    <td className="py-4 px-5">
                      <div className="text-[11px] text-slate-200">
                        {t.totalQuestions} Qs ({t.totalMarks} Marks)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {t.sections?.[0]?.sectionLock ? '🔒 Section Lock Enforced' : '🔓 Free Navigation'}
                      </div>
                    </td>

                    <td className="py-4 px-5">
                      <button
                        onClick={() => handleTogglePublish(t.id, t.isPublished)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                          t.isPublished
                            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                        }`}
                      >
                        {t.isPublished ? 'PUBLISHED' : 'DRAFT'}
                      </button>
                    </td>

                    <td className="py-4 px-5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Edit Blueprint"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDuplicate(t.id)}
                          title="Duplicate into Draft"
                          className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(t.id, t.title)}
                          title="Delete Blueprint"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Blueprint Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                <h3 className="font-heading font-bold text-base">
                  {modalMode === 'CREATE' ? 'Create Test Blueprint' : 'Edit Test Blueprint'}
                </h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Blueprint Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. SSC CGL Tier-1 Full Assessment 02"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Target Exam</label>
                  <select
                    value={formExamCode}
                    onChange={(e) => setFormExamCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    {EXAM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Test Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="FULL">FULL LENGTH</option>
                    <option value="SECTIONAL">SECTIONAL</option>
                    <option value="TOPIC">TOPIC ASSESSMENT</option>
                    <option value="PYQ">PREVIOUS YEAR PAPER</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Duration (min)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={360}
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Questions</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formQuestions}
                    onChange={(e) => setFormQuestions(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Total Marks</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formMarks}
                    onChange={(e) => setFormMarks(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsFree}
                    onChange={(e) => setFormIsFree(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                  />
                  <span className="text-xs text-slate-300">Free Assessment (open to all registered candidates)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formSectionLock}
                    onChange={(e) => setFormSectionLock(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                  />
                  <span className="text-xs text-slate-300">Enforce Sectional Timing Lock (Banking/IBPS pattern)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsPublished}
                    onChange={(e) => setFormIsPublished(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600"
                  />
                  <span className="text-xs text-slate-300">Publish immediately to student app</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving...' : modalMode === 'CREATE' ? 'Create Blueprint' : 'Update Blueprint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

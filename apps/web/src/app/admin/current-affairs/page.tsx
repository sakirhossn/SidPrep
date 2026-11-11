'use client';

import { useState, useEffect, useCallback } from 'react';
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
  Plus,
  RefreshCw,
  Loader2,
  Calendar,
  Clock,
  Eye,
  Check,
  X,
  AlertCircle,
  Archive,
  Send,
  Radio,
  BookOpen,
  HelpCircle,
  Tag,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface NewsSource {
  id: string;
  name: string;
  feed_url?: string;
  feedUrl?: string;
  is_enabled?: boolean;
  isEnabled?: boolean;
  category: string;
  language?: string;
  fetch_interval_minutes?: number;
  health_status?: string;
  last_fetched_at?: string;
}

interface NewsDraft {
  id: string;
  title: string;
  headline?: string;
  originalSummary: string;
  summary?: string;
  category: string;
  targetExams?: string[];
  keyFacts?: string[];
  whyItMatters?: string;
  staticGkBackground?: string;
  practiceMcqs?: Array<{
    question: string;
    options: Array<{ id: string; text: string }>;
    correctOptionId: string;
    explanation: string;
  }>;
  sourceName: string;
  sourceUrl: string;
  editorialStatus: string;
  eventDate?: string;
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
}

interface FetchJob {
  id: string;
  source_id?: string;
  source_name?: string;
  status: string;
  items_fetched: number;
  items_new: number;
  items_duplicate: number;
  items_rejected: number;
  items_failed: number;
  created_at: string;
  completed_at?: string;
}

const ALL_EXAM_TAGS = ['SSC', 'RRB', 'WBPSC', 'IBPS'];

export default function AdminCurrentAffairsPage() {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [drafts, setDrafts] = useState<NewsDraft[]>([]);
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingNow, setFetchingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [examFilter, setExamFilter] = useState('ALL');

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceCategory, setNewSourceCategory] = useState('Government Schemes');
  const [addSourceLoading, setAddSourceLoading] = useState(false);

  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Edit Draft Modal State
  const [editingDraft, setEditingDraft] = useState<NewsDraft | null>(null);
  const [editHeadline, setEditHeadline] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editCategory, setEditCategory] = useState('Government Schemes');
  const [editTargetExams, setEditTargetExams] = useState<string[]>([]);
  const [editKeyFactsText, setEditKeyFactsText] = useState('');
  const [editStaticGk, setEditStaticGk] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editOptA, setEditOptA] = useState('');
  const [editOptB, setEditOptB] = useState('');
  const [editOptC, setEditOptC] = useState('');
  const [editOptD, setEditOptD] = useState('');
  const [editCorrectOpt, setEditCorrectOpt] = useState('opt_a');
  const [editExplanation, setEditExplanation] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [schedulingDraftId, setSchedulingDraftId] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [sourcesRes, draftsRes, jobsRes] = await Promise.all([
        fetch(`${base}/v1/admin/news/sources`, { headers }),
        fetch(`${base}/v1/admin/news/drafts`, { headers }),
        fetch(`${base}/v1/admin/news/jobs`, { headers }),
      ]);

      if (sourcesRes.ok) {
        const d = await sourcesRes.json();
        setSources(d.data || []);
      }
      if (draftsRes.ok) {
        const d = await draftsRes.json();
        setDrafts(Array.isArray(d) ? d : d.data || []);
      }
      if (jobsRes.ok) {
        const d = await jobsRes.json();
        setJobs(d.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to news ingestion backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFetchNow = async (sourceId?: string) => {
    setFetchingNow(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/fetch-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to trigger feed ingestion.');

      setSuccessMsg(
        `Fetch completed! ${data.itemsNew || 0} exam-relevant items drafted. ${data.itemsRejected || 0} non-exam items filtered out.`
      );
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetchingNow(false);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;

    setAddSourceLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newSourceName.trim(),
          feedUrl: newSourceUrl.trim(),
          category: newSourceCategory,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to add source.');

      setSuccessMsg(`Feed source "${newSourceName}" added successfully.`);
      setIsAddSourceOpen(false);
      setNewSourceName('');
      setNewSourceUrl('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddSourceLoading(false);
    }
  };

  const handleTestSource = async (sourceId: string) => {
    setTestingSourceId(sourceId);
    setTestResult(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/sources/${sourceId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult(data.data || data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingSourceId(null);
    }
  };

  const handleTransitionStatus = async (id: string, newStatus: string) => {
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/drafts/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Transition rejected.');

      setSuccessMsg(`Editorial status transitioned to ${newStatus}.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const openEditModal = (d: NewsDraft) => {
    setEditingDraft(d);
    setEditHeadline(d.headline || d.title || '');
    setEditSummary(d.summary || d.originalSummary || '');
    setEditCategory(d.category || 'Government Schemes');
    setEditTargetExams(d.targetExams && d.targetExams.length > 0 ? d.targetExams : ['SSC', 'RRB', 'WBPSC', 'IBPS']);
    setEditKeyFactsText(d.keyFacts ? d.keyFacts.join('\n') : '');
    setEditStaticGk(d.staticGkBackground || '');
    setEditEventDate(d.eventDate || new Date().toISOString().split('T')[0]);

    const firstMcq = d.practiceMcqs?.[0];
    if (firstMcq) {
      setEditQuestion(firstMcq.question || '');
      setEditOptA(firstMcq.options?.find((o) => o.id === 'opt_a')?.text || firstMcq.options?.[0]?.text || '');
      setEditOptB(firstMcq.options?.find((o) => o.id === 'opt_b')?.text || firstMcq.options?.[1]?.text || '');
      setEditOptC(firstMcq.options?.find((o) => o.id === 'opt_c')?.text || firstMcq.options?.[2]?.text || '');
      setEditOptD(firstMcq.options?.find((o) => o.id === 'opt_d')?.text || firstMcq.options?.[3]?.text || '');
      setEditCorrectOpt(firstMcq.correctOptionId || 'opt_a');
      setEditExplanation(firstMcq.explanation || '');
    } else {
      setEditQuestion('');
      setEditOptA('');
      setEditOptB('');
      setEditOptC('');
      setEditOptD('');
      setEditCorrectOpt('opt_a');
      setEditExplanation('');
    }
  };

  const toggleExamTag = (tag: string) => {
    if (editTargetExams.includes(tag)) {
      setEditTargetExams(editTargetExams.filter((t) => t !== tag));
    } else {
      setEditTargetExams([...editTargetExams, tag]);
    }
  };

  const handleSaveDraftEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraft) return;

    setSavingEdit(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const keyFacts = editKeyFactsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 5);

      const practiceMcqs = editQuestion.trim()
        ? [
            {
              question: editQuestion.trim(),
              options: [
                { id: 'opt_a', text: editOptA.trim() || 'Option A' },
                { id: 'opt_b', text: editOptB.trim() || 'Option B' },
                { id: 'opt_c', text: editOptC.trim() || 'Option C' },
                { id: 'opt_d', text: editOptD.trim() || 'Option D' },
              ],
              correctOptionId: editCorrectOpt,
              explanation: editExplanation.trim() || 'Authoritative fact-backed explanation.',
            },
          ]
        : [];

      const payload = {
        headline: editHeadline.trim(),
        title: editHeadline.trim(),
        summary: editSummary.trim(),
        originalSummary: editSummary.trim(),
        category: editCategory,
        targetExams: editTargetExams.length > 0 ? editTargetExams : ['SSC', 'RRB', 'WBPSC', 'IBPS'],
        keyFacts,
        staticGkBackground: editStaticGk.trim(),
        practiceMcqs,
        eventDate: editEventDate,
      };

      const res = await fetch(`${base}/v1/admin/news/drafts/${editingDraft.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to save edits.');

      setSuccessMsg('Article content, exam tags, and MCQ updated successfully.');
      setEditingDraft(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingDraftId || !scheduleDateTime) return;

    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/drafts/${schedulingDraftId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduledFor: new Date(scheduleDateTime).toISOString() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Scheduling failed.');

      setSuccessMsg('Article scheduled for publication.');
      setSchedulingDraftId(null);
      setScheduleDateTime('');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredDrafts = drafts.filter((d) => {
    if (statusFilter !== 'ALL' && d.editorialStatus !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && d.category.toLowerCase() !== categoryFilter.toLowerCase()) return false;
    if (examFilter !== 'ALL') {
      const exams = (d.targetExams || []).map((x) => x.toUpperCase());
      const req = examFilter.toUpperCase();
      const match = exams.some((e) => e === req || e.startsWith(req) || req.startsWith(e));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Competitive Exam Current Affairs Pipeline
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Engineered specifically for SSC, RRB, WBPSC, &amp; IBPS. Filters out partisan noise, crime, &amp; ads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddSourceOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Official Feed
          </button>

          <button
            onClick={() => handleFetchNow()}
            disabled={fetchingNow}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition-all"
          >
            {fetchingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            Fetch Feeds Now
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Official Feed Sources Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            Configured Official News Feeds
          </h2>
          <span className="text-[11px] font-mono text-slate-400">{sources.length} Sources Active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Source Name</th>
                <th className="p-3">Domain Category</th>
                <th className="p-3">Feed Endpoint</th>
                <th className="p-3">Health Status</th>
                <th className="p-3">Last Ingested</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sources.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="p-3 font-semibold text-white">{s.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                      {s.category}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400 max-w-xs truncate">{s.feed_url || s.feedUrl}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        (s.health_status || 'HEALTHY') === 'HEALTHY'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {s.health_status || 'HEALTHY'}
                    </span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleTimeString() : 'Pending'}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => handleTestSource(s.id)}
                      disabled={testingSourceId === s.id}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-sans"
                    >
                      {testingSourceId === s.id ? 'Testing...' : 'Test Feed'}
                    </button>
                    <button
                      onClick={() => handleFetchNow(s.id)}
                      disabled={fetchingNow}
                      className="px-2.5 py-1 rounded bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-sans"
                    >
                      Fetch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editorial Review & Publishing Queue */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-indigo-400" />
            Editorial Review &amp; Publishing Queue ({filteredDrafts.length})
          </h2>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT (Unverified)</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>

            {/* Exam Filter */}
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Exams</option>
              <option value="SSC">SSC (CGL, CHSL, MTS)</option>
              <option value="RRB">RRB (NTPC, Group D)</option>
              <option value="WBPSC">WBPSC (WBCS, Clerkship)</option>
              <option value="IBPS">IBPS (PO, Clerk, SBI)</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Categories</option>
              <option value="Government Schemes">Government Schemes</option>
              <option value="Economy & Banking">Economy &amp; Banking</option>
              <option value="Science & Technology">Science &amp; Technology</option>
              <option value="Defence & Security">Defence &amp; Security</option>
              <option value="Appointments & Resignations">Appointments &amp; Resignations</option>
              <option value="Awards & Honours">Awards &amp; Honours</option>
              <option value="Sports">Sports</option>
              <option value="International Summits">International Summits</option>
              <option value="Reports & Indices">Reports &amp; Indices</option>
              <option value="Environment & Ecology">Environment &amp; Ecology</option>
              <option value="Important Days & Themes">Important Days &amp; Themes</option>
              <option value="State Affairs">State Affairs (WB Focus)</option>
            </select>
          </div>
        </div>

        {filteredDrafts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800 text-xs">
            No articles match the selected filters. Click &ldquo;Fetch Feeds Now&rdquo; to pull the latest competitive-exam news.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredDrafts.map((d) => (
              <div
                key={d.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 hover:border-slate-700 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {d.category}
                    </span>

                    {/* Target Exam Badges */}
                    {(d.targetExams || ['SSC', 'RRB', 'WBPSC', 'IBPS']).map((ex, idx) => (
                      <span
                        key={idx}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                      >
                        {ex}
                      </span>
                    ))}

                    <span className="text-[10px] text-slate-500 font-mono">{d.sourceName}</span>
                    <span className="text-[10px] text-slate-500">
                      • {d.eventDate || new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      d.editorialStatus === 'PUBLISHED'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : d.editorialStatus === 'APPROVED'
                        ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                        : d.editorialStatus === 'SCHEDULED'
                        ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}
                  >
                    {d.editorialStatus}
                  </span>
                </div>

                <div>
                  <h3 className="font-heading font-bold text-base text-white mb-1.5">{d.headline || d.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{d.summary || d.originalSummary}</p>
                </div>

                {/* 3 to 5 Exam Facts */}
                {d.keyFacts && d.keyFacts.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Exam-Relevant Facts (3–5 Pointers)
                    </span>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                      {d.keyFacts.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Static GK Connection */}
                {d.staticGkBackground && (
                  <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Related Static GK Foundation
                    </span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{d.staticGkBackground}</p>
                  </div>
                )}

                {/* Grounded Practice MCQ Preview */}
                {d.practiceMcqs && d.practiceMcqs.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <HelpCircle className="w-3 h-3" /> Reviewed Practice MCQ
                    </span>
                    <p className="font-semibold text-slate-200 text-xs">{d.practiceMcqs[0].question}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                      {d.practiceMcqs[0].options.map((opt) => (
                        <div
                          key={opt.id}
                          className={`p-1.5 rounded-lg border ${
                            opt.id === d.practiceMcqs![0].correctOptionId
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {opt.id.replace('opt_', '').toUpperCase()}: {opt.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Editorial Actions Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
                  <a
                    href={d.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                  >
                    Original Official Source <ExternalLink className="w-3 h-3" />
                  </a>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Edit & Verify Button */}
                    <button
                      onClick={() => openEditModal(d)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] border border-slate-700"
                    >
                      <Edit3 className="w-3 h-3" /> Edit &amp; Tags
                    </button>

                    {d.editorialStatus === 'DRAFT' && (
                      <button
                        onClick={() => handleTransitionStatus(d.id, 'IN_REVIEW')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                      >
                        Send to Review
                      </button>
                    )}

                    {d.editorialStatus === 'IN_REVIEW' && (
                      <button
                        onClick={() => handleTransitionStatus(d.id, 'REVIEWED')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-300 font-semibold text-[11px]"
                      >
                        Mark Reviewed
                      </button>
                    )}

                    {(d.editorialStatus === 'REVIEWED' || d.editorialStatus === 'DRAFT') && (
                      <button
                        onClick={() => handleTransitionStatus(d.id, 'APPROVED')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px]"
                      >
                        Approve
                      </button>
                    )}

                    {d.editorialStatus === 'APPROVED' && (
                      <>
                        <button
                          onClick={() => setSchedulingDraftId(d.id)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 font-semibold text-[11px]"
                        >
                          Schedule
                        </button>
                        <button
                          onClick={() => handleTransitionStatus(d.id, 'PUBLISHED')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px]"
                        >
                          Publish Now
                        </button>
                      </>
                    )}

                    {d.editorialStatus !== 'ARCHIVED' && (
                      <button
                        onClick={() => handleTransitionStatus(d.id, 'ARCHIVED')}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                        title="Archive"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit & Verify Article Modal */}
      {editingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl text-white my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-heading font-bold text-base">Editorial Verification &amp; Tag Correction</h3>
                <p className="text-[11px] text-slate-400">Review headline, factual pointers, static GK, MCQ, and exam syllabus tags.</p>
              </div>
              <button onClick={() => setEditingDraft(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDraftEdit} className="space-y-4 text-xs">
              {/* Headline */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Clear Headline</label>
                <input
                  type="text"
                  required
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Factual Summary */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Short Factual Explanation</label>
                <textarea
                  rows={3}
                  required
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Category & Event Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Government Schemes">Government Schemes</option>
                    <option value="Economy & Banking">Economy &amp; Banking</option>
                    <option value="Science & Technology">Science &amp; Technology</option>
                    <option value="Defence & Security">Defence &amp; Security</option>
                    <option value="Appointments & Resignations">Appointments &amp; Resignations</option>
                    <option value="Awards & Honours">Awards &amp; Honours</option>
                    <option value="Sports">Sports</option>
                    <option value="International Summits">International Summits</option>
                    <option value="Reports & Indices">Reports &amp; Indices</option>
                    <option value="Environment & Ecology">Environment &amp; Ecology</option>
                    <option value="Important Days & Themes">Important Days &amp; Themes</option>
                    <option value="State Affairs">State Affairs (WB Focus)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Event Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    value={editEventDate}
                    onChange={(e) => setEditEventDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Target Exam Tags */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" /> Target Exams (Select all that apply)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ALL_EXAM_TAGS.map((tag) => {
                    const isSelected = editTargetExams.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleExamTag(tag)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3 to 5 Key Facts */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Exam-Relevant Facts (3 to 5 lines, one per line)
                </label>
                <textarea
                  rows={4}
                  value={editKeyFactsText}
                  onChange={(e) => setEditKeyFactsText(e.target.value)}
                  placeholder="Fact 1: Sanctioned financial outlay...&#10;Fact 2: Nodal executing department...&#10;Fact 3: Key beneficiary thresholds..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono text-[11px]"
                />
              </div>

              {/* Static GK */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Related Static GK (Constitutional articles, parent act, headquarters, historical milestones)
                </label>
                <textarea
                  rows={2}
                  value={editStaticGk}
                  onChange={(e) => setEditStaticGk(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Practice MCQ */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <span className="font-bold text-slate-200 block text-xs">Practice MCQ</span>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Question Text</label>
                  <input
                    type="text"
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="block text-slate-400 mb-1">Option A</label>
                    <input
                      type="text"
                      value={editOptA}
                      onChange={(e) => setEditOptA(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Option B</label>
                    <input
                      type="text"
                      value={editOptB}
                      onChange={(e) => setEditOptB(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Option C</label>
                    <input
                      type="text"
                      value={editOptC}
                      onChange={(e) => setEditOptC(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Option D</label>
                    <input
                      type="text"
                      value={editOptD}
                      onChange={(e) => setEditOptD(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Correct Answer</label>
                    <select
                      value={editCorrectOpt}
                      onChange={(e) => setEditCorrectOpt(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white"
                    >
                      <option value="opt_a">Option A</option>
                      <option value="opt_b">Option B</option>
                      <option value="opt_c">Option C</option>
                      <option value="opt_d">Option D</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">MCQ Explanation</label>
                    <input
                      type="text"
                      value={editExplanation}
                      onChange={(e) => setEditExplanation(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDraft(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white disabled:opacity-50"
                >
                  {savingEdit ? 'Saving Changes...' : 'Save & Verify Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Feed Source Modal */}
      {isAddSourceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-heading font-bold text-base">Add Official News Feed</h3>
              <button onClick={() => setIsAddSourceOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSource} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Source Name</label>
                <input
                  type="text"
                  required
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="e.g. RBI Press Releases"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">RSS/Atom Feed URL</label>
                <input
                  type="url"
                  required
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Primary Category</label>
                <select
                  value={newSourceCategory}
                  onChange={(e) => setNewSourceCategory(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="Government Schemes">Government Schemes</option>
                  <option value="Economy & Banking">Economy &amp; Banking</option>
                  <option value="Science & Technology">Science &amp; Technology</option>
                  <option value="Defence & Security">Defence &amp; Security</option>
                  <option value="Appointments & Resignations">Appointments &amp; Resignations</option>
                  <option value="Awards & Honours">Awards &amp; Honours</option>
                  <option value="Sports">Sports</option>
                  <option value="International Summits">International Summits</option>
                  <option value="Reports & Indices">Reports &amp; Indices</option>
                  <option value="Environment & Ecology">Environment &amp; Ecology</option>
                  <option value="Important Days & Themes">Important Days &amp; Themes</option>
                  <option value="State Affairs">State Affairs</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSourceOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSourceLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white disabled:opacity-50"
                >
                  {addSourceLoading ? 'Adding...' : 'Add Source'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {schedulingDraftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-heading font-bold text-base">Schedule Publication</h3>
              <button onClick={() => setSchedulingDraftId(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Publication Date &amp; Time (IST)</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleDateTime}
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSchedulingDraftId(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
                >
                  Confirm Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

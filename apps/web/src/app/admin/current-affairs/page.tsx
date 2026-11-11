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
  Search,
  Filter,
  Layers,
  Globe,
  Sliders,
  Sparkles,
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
  source_group?: string;
  sourceGroup?: string;
  source_type?: 'DIRECT_FEED' | 'GOOGLE_NEWS_DISCOVERY';
  sourceType?: 'DIRECT_FEED' | 'GOOGLE_NEWS_DISCOVERY';
  query_template?: string;
  queryTemplate?: string;
  query_keywords?: string[];
  publisher_usage_rights?: 'OFFICIAL_GOVT' | 'PUBLIC_OPEN_ACCESS' | 'FAIR_DEALING_DISCOVERY' | 'REQUIRES_LICENSE';
  is_verified?: boolean;
  isVerified?: boolean;
  feed_format?: string;
  priority_tier?: number;
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
  canonicalUrl?: string;
  feedEntryId?: string;
  originalPublisher?: string;
  alternativeSourceUrls?: string[];
  needsSourceReview?: boolean;
  articleContent?: string;
  publisherUsageRights?: string;
  editorialStatus: string;
  eventDate?: string;
  scheduledFor?: string;
  publishedAt?: string;
  createdAt: string;
}

interface FetchJob {
  id: string;
  source_id?: string;
  source_group?: string;
  source_name?: string;
  status: string;
  items_fetched: number;
  items_new: number;
  items_duplicate: number;
  items_rejected: number;
  items_review_needed?: number;
  items_failed: number;
  created_at: string;
  completed_at?: string;
}

const ALL_EXAM_TAGS = ['SSC', 'RRB', 'WBPSC', 'IBPS'];

const SOURCE_GROUP_TABS = [
  { id: 'ALL', label: 'All Source Groups' },
  { id: 'national_governance', label: 'National Affairs' },
  { id: 'economy_banking', label: 'Economy & Banking' },
  { id: 'defence_sci_tech', label: 'Defence & Sci-Tech' },
  { id: 'international_affairs', label: 'International Affairs' },
  { id: 'sports', label: 'Sports' },
  { id: 'awards_appointments', label: 'Awards & Appointments' },
  { id: 'environment', label: 'Environment & Ecology' },
  { id: 'important_days', label: 'Important Days' },
  { id: 'west_bengal_affairs', label: 'West Bengal Affairs' },
];

export default function AdminCurrentAffairsPage() {
  const [sources, setSources] = useState<NewsSource[]>([]);
  const [drafts, setDrafts] = useState<NewsDraft[]>([]);
  const [jobs, setJobs] = useState<FetchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingNow, setFetchingNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedGroupTab, setSelectedGroupTab] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [examFilter, setExamFilter] = useState('ALL');
  const [reviewNeededOnly, setReviewNeededOnly] = useState(false);

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState<'DIRECT_FEED' | 'GOOGLE_NEWS_DISCOVERY'>('DIRECT_FEED');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newQueryTemplate, setNewQueryTemplate] = useState('');
  const [newSourceGroup, setNewSourceGroup] = useState('national_governance');
  const [newSourceCategory, setNewSourceCategory] = useState('Government Schemes');
  const [newPublisherRights, setNewPublisherRights] = useState<'OFFICIAL_GOVT' | 'PUBLIC_OPEN_ACCESS' | 'FAIR_DEALING_DISCOVERY' | 'REQUIRES_LICENSE'>('FAIR_DEALING_DISCOVERY');
  const [newPriorityTier, setNewPriorityTier] = useState<number>(2);
  const [addSourceLoading, setAddSourceLoading] = useState(false);

  // Test Connectivity Modal State
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [testResultModal, setTestResultModal] = useState<any | null>(null);

  // Fetch Summary Modal State
  const [lastFetchResult, setLastFetchResult] = useState<any | null>(null);

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
    try {
      setLoading(true);
      setError(null);
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [sourcesRes, draftsRes, jobsRes] = await Promise.all([
        fetch(`${base}/v1/admin/news/sources`, { headers }),
        fetch(`${base}/v1/admin/news/drafts`, { headers }),
        fetch(`${base}/v1/admin/news/jobs`, { headers }),
      ]);

      if (sourcesRes.ok) {
        const data = await sourcesRes.json();
        setSources(data.data || []);
      }
      if (draftsRes.ok) {
        const data = await draftsRes.json();
        setDrafts(Array.isArray(data) ? data : data.data || []);
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json();
        setJobs(data.data || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect to admin current affairs backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run Fetch Handler
  const handleFetchNow = async (sourceId?: string, sourceGroup?: string) => {
    try {
      setFetchingNow(true);
      setError(null);
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const res = await fetch(`${base}/v1/admin/news/fetch-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sourceId, sourceGroup }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'News ingestion failed');
      }

      setLastFetchResult(data);
      setSuccessMsg(`Fetched ${data.itemsFetched} items: ${data.itemsNew} new drafts created (${data.itemsReviewNeeded || 0} need source review), ${data.itemsRejected} filtered.`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetchingNow(false);
    }
  };

  // Test Source Handler
  const handleTestSource = async (sourceId: string) => {
    setTestingSourceId(sourceId);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const res = await fetch(`${base}/v1/admin/news/sources/${sourceId}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResultModal(data.data || data);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTestingSourceId(null);
    }
  };

  // Add Source Handler
  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAddSourceLoading(true);
      setError(null);
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const res = await fetch(`${base}/v1/admin/news/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newSourceName,
          sourceType: newSourceType,
          feedUrl: newSourceUrl,
          queryTemplate: newQueryTemplate,
          sourceGroup: newSourceGroup,
          category: newSourceCategory,
          publisherUsageRights: newPublisherRights,
          priorityTier: Number(newPriorityTier),
          isEnabled: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to configure news source');

      setIsAddSourceOpen(false);
      setNewSourceName('');
      setNewSourceUrl('');
      setNewQueryTemplate('');
      setSuccessMsg('News source configured. Remember to test connectivity before enabling in production.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddSourceLoading(false);
    }
  };

  // Status transition handler
  const handleStatusChange = async (draftId: string, newStatus: string) => {
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const res = await fetch(`${base}/v1/admin/news/drafts/${draftId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update editorial status');

      setSuccessMsg(`Status updated to ${newStatus}`);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Open Edit Draft Modal
  const handleOpenEdit = (draft: NewsDraft) => {
    setEditingDraft(draft);
    setEditHeadline(draft.headline || draft.title || '');
    setEditSummary(draft.summary || draft.originalSummary || '');
    setEditCategory(draft.category || 'Government Schemes');
    setEditTargetExams(draft.targetExams && draft.targetExams.length > 0 ? draft.targetExams : ['SSC']);
    setEditKeyFactsText((draft.keyFacts || []).join('\n'));
    setEditStaticGk(draft.staticGkBackground || '');

    const mcq = draft.practiceMcqs?.[0];
    setEditQuestion(mcq?.question || '');
    setEditOptA(mcq?.options?.find((o) => o.id === 'opt_a')?.text || '');
    setEditOptB(mcq?.options?.find((o) => o.id === 'opt_b')?.text || '');
    setEditOptC(mcq?.options?.find((o) => o.id === 'opt_c')?.text || '');
    setEditOptD(mcq?.options?.find((o) => o.id === 'opt_d')?.text || '');
    setEditCorrectOpt(mcq?.correctOptionId || 'opt_a');
    setEditExplanation(mcq?.explanation || '');
    setEditEventDate(draft.eventDate || '');
  };

  const toggleExamTag = (tag: string) => {
    setEditTargetExams((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Save Edit Draft
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDraft) return;

    try {
      setSavingEdit(true);
      setError(null);
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const factsArray = editKeyFactsText
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

      const practiceMcqs = editQuestion
        ? [
            {
              question: editQuestion,
              options: [
                { id: 'opt_a', text: editOptA || 'Option A' },
                { id: 'opt_b', text: editOptB || 'Option B' },
                { id: 'opt_c', text: editOptC || 'Option C' },
                { id: 'opt_d', text: editOptD || 'Option D' },
              ],
              correctOptionId: editCorrectOpt,
              explanation: editExplanation || 'Explanation verified by editor.',
            },
          ]
        : [];

      const res = await fetch(`${base}/v1/admin/news/drafts/${editingDraft.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          headline: editHeadline,
          summary: editSummary,
          category: editCategory,
          targetExams: editTargetExams,
          keyFacts: factsArray,
          staticGkBackground: editStaticGk,
          practiceMcqs,
          eventDate: editEventDate || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update article');

      setEditingDraft(null);
      setSuccessMsg('Article content, exam tags, and MCQ updated successfully.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Schedule Submit
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingDraftId) return;

    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();

      const res = await fetch(`${base}/v1/admin/news/drafts/${schedulingDraftId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduledFor: scheduleDateTime }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Scheduling failed');

      setSchedulingDraftId(null);
      setSuccessMsg('Draft scheduled for publication successfully.');
      await loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Filter sources
  const filteredSources = sources.filter((s) => {
    if (selectedGroupTab === 'ALL') return true;
    return (s.source_group || s.sourceGroup) === selectedGroupTab;
  });

  // Filter drafts
  const filteredDrafts = drafts.filter((d) => {
    if (statusFilter !== 'ALL' && d.editorialStatus !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && d.category !== categoryFilter) return false;
    if (examFilter !== 'ALL') {
      const exams = d.targetExams || [];
      if (!exams.some((ex) => ex.toUpperCase().includes(examFilter))) return false;
    }
    if (reviewNeededOnly && !d.needsSourceReview) return false;
    return true;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-bold mb-2 border border-indigo-500/20">
            <Radio className="w-3.5 h-3.5" />
            <span>9 Source Groups • Google News Discovery • Editorial Review</span>
          </div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">
            Competitive Exam Current Affairs CMS
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Adapts DailyDigest&apos;s source discovery and Unicode deduplication. All fetched items require factual verification before publishing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleFetchNow(undefined, selectedGroupTab !== 'ALL' ? selectedGroupTab : undefined)}
            disabled={fetchingNow}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
          >
            {fetchingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>{selectedGroupTab !== 'ALL' ? `Fetch Group (${selectedGroupTab})` : 'Fetch All Sources'}</span>
          </button>
          <button
            onClick={() => setIsAddSourceOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Feed / Discovery</span>
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Source Group Navigation Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            Select Source Group (DailyDigest Strategy)
          </span>
          <span className="text-[11px] font-mono text-slate-500">{filteredSources.length} configured in view</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none text-xs">
          {SOURCE_GROUP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedGroupTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap font-bold transition-all ${
                selectedGroupTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Configured Feed Sources Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            Configured Feeds &amp; Discovery Sources ({filteredSources.length})
          </h2>
          <span className="text-[11px] text-slate-400">
            Bounded Concurrency: 6 workers • Timeout: 10s • Test before enabling
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3">Source Name &amp; Group</th>
                <th className="p-3">Type</th>
                <th className="p-3">Usage Rights</th>
                <th className="p-3">Verified Status</th>
                <th className="p-3">Health</th>
                <th className="p-3">Last Ingested</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredSources.map((s) => {
                const isVerified = Boolean(s.is_verified || s.isVerified);
                const sourceType = s.source_type || s.sourceType || 'DIRECT_FEED';
                const usageRights = s.publisher_usage_rights || 'FAIR_DEALING_DISCOVERY';

                return (
                  <tr key={s.id} className="hover:bg-slate-800/30">
                    <td className="p-3">
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {s.source_group || s.sourceGroup || 'national_governance'} • {s.category}
                      </div>
                    </td>
                    <td className="p-3">
                      {sourceType === 'GOOGLE_NEWS_DISCOVERY' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 font-sans">
                          <Globe className="w-3 h-3" /> GNews Discovery
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 font-sans">
                          <Radio className="w-3 h-3" /> Direct Publisher
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-sans">
                        {usageRights}
                      </span>
                    </td>
                    <td className="p-3 font-sans">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Check className="w-3 h-3" /> Verified URL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <AlertCircle className="w-3 h-3" /> Test Needed
                        </span>
                      )}
                    </td>
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
                );
              })}
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
            {/* Needs Review Filter Toggle */}
            <button
              onClick={() => setReviewNeededOnly((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                reviewNeededOnly
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Needs Source Review Only
            </button>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT (Unverified)</option>
              <option value="NEEDS_SOURCE_REVIEW">NEEDS_SOURCE_REVIEW</option>
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
          </div>
        </div>

        {/* Drafts List */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
            <span>Loading drafts queue...</span>
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl text-xs">
            No articles match the selected filters. Click &ldquo;Fetch All Sources&rdquo; to pull the latest competitive-exam news.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDrafts.map((d) => (
              <div
                key={d.id}
                className={`p-5 rounded-2xl border transition-all ${
                  d.needsSourceReview
                    ? 'bg-amber-950/20 border-amber-500/40'
                    : 'bg-slate-900 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      {d.category}
                    </span>
                    {d.needsSourceReview && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Needs Source Review (Short / Low Facts)
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500">
                      {d.originalPublisher || d.sourceName} • {d.eventDate || new Date(d.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(d.targetExams || []).map((ex) => (
                      <span
                        key={ex}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                      >
                        {ex}
                      </span>
                    ))}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ml-2 ${
                        d.editorialStatus === 'PUBLISHED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : d.editorialStatus === 'APPROVED'
                          ? 'bg-blue-500/10 text-blue-400'
                          : d.editorialStatus === 'NEEDS_SOURCE_REVIEW'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {d.editorialStatus}
                    </span>
                  </div>
                </div>

                <h3 className="font-heading font-bold text-base text-white mb-2">{d.headline || d.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">{d.summary || d.originalSummary}</p>

                {/* Key Facts Pointers */}
                {d.keyFacts && d.keyFacts.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 mb-3 text-xs space-y-1">
                    <span className="font-bold text-slate-400 block mb-1">Key Facts Pointers:</span>
                    <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                      {d.keyFacts.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Alternative sources if deduplicated */}
                {d.alternativeSourceUrls && d.alternativeSourceUrls.length > 0 && (
                  <div className="text-[10px] text-slate-500 mb-3">
                    Covered by {d.alternativeSourceUrls.length} other sources:{' '}
                    {d.alternativeSourceUrls.map((u, idx) => (
                      <a key={idx} href={u} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline mr-2">
                        [Link {idx + 1}]
                      </a>
                    ))}
                  </div>
                )}

                {/* Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60 text-xs">
                  <div className="flex items-center gap-2">
                    <a
                      href={d.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-400 hover:text-indigo-400 text-[11px]"
                    >
                      Source <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(d)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 font-semibold text-xs flex items-center gap-1 border border-indigo-500/30"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit &amp; Tags</span>
                    </button>

                    {d.editorialStatus === 'DRAFT' || d.editorialStatus === 'NEEDS_SOURCE_REVIEW' ? (
                      <button
                        onClick={() => handleStatusChange(d.id, 'APPROVED')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                      >
                        Approve
                      </button>
                    ) : null}

                    {d.editorialStatus === 'APPROVED' ? (
                      <>
                        <button
                          onClick={() => handleStatusChange(d.id, 'PUBLISHED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                        >
                          Publish Now
                        </button>
                        <button
                          onClick={() => setSchedulingDraftId(d.id)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 font-bold text-xs border border-purple-500/30"
                        >
                          Schedule
                        </button>
                      </>
                    ) : null}

                    {d.editorialStatus !== 'REJECTED' && d.editorialStatus !== 'PUBLISHED' ? (
                      <button
                        onClick={() => handleStatusChange(d.id, 'REJECTED')}
                        className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold text-xs"
                      >
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connectivity Test Diagnostics Modal */}
      {testResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-heading font-bold text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-400" />
                Feed Connectivity &amp; Format Diagnostics
              </h3>
              <button onClick={() => setTestResultModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-slate-500 text-[10px]">HTTP Status</div>
                <div className="text-base font-bold text-white">{testResultModal.httpStatus || 200}</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-slate-500 text-[10px]">Detected Feed Format</div>
                <div className="text-base font-bold text-indigo-300">{testResultModal.detectedFormat}</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-slate-500 text-[10px]">Parsed Eligible Entries</div>
                <div className="text-base font-bold text-emerald-400">{testResultModal.itemCount}</div>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div className="text-slate-500 text-[10px]">Non-Exam Filtered</div>
                <div className="text-base font-bold text-amber-400">{testResultModal.rejectedCount}</div>
              </div>
            </div>

            <div className="text-xs">
              <span className="font-bold text-slate-400 block mb-1">Final Resolved URL:</span>
              <p className="font-mono text-[11px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 break-all">
                {testResultModal.finalUrl}
              </p>
            </div>

            {testResultModal.sampleEntries && testResultModal.sampleEntries.length > 0 && (
              <div className="text-xs space-y-2">
                <span className="font-bold text-slate-400 block">Sample Parsed Headlines:</span>
                {testResultModal.sampleEntries.map((sample: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded bg-slate-950 border border-slate-800 text-[11px]">
                    <div className="font-semibold text-white">{sample.headline}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Publisher: {sample.publisher} • Date: {sample.date}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {testResultModal.error && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {testResultModal.error}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setTestResultModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
              >
                Close Diagnostic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit & Tags Modal */}
      {editingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl text-white my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="font-heading font-bold text-base">Edit Article &amp; Exam Relevance</h3>
              <button onClick={() => setEditingDraft(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Headline</label>
                <input
                  type="text"
                  required
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Concise Summary (2-3 sentences)</label>
                <textarea
                  rows={3}
                  required
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Event Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    value={editEventDate}
                    onChange={(e) => setEditEventDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Target Exam Pills */}
              <div>
                <label className="block text-slate-400 mb-1.5 font-semibold">Target Competitive Exams</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_EXAM_TAGS.map((tag) => {
                    const isSelected = editTargetExams.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleExamTag(tag)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3-5 Key Facts */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Key Exam Pointers (One fact per line)</label>
                <textarea
                  rows={4}
                  value={editKeyFactsText}
                  onChange={(e) => setEditKeyFactsText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-[11px]"
                />
              </div>

              {/* Static GK Note */}
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Related Static GK Background</label>
                <textarea
                  rows={2}
                  value={editStaticGk}
                  onChange={(e) => setEditStaticGk(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Practice MCQ */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <span className="font-bold text-indigo-400 block">Practice MCQ for Students</span>
                <div>
                  <label className="block text-slate-400 mb-1">Question</label>
                  <input
                    type="text"
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
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
              <h3 className="font-heading font-bold text-base">Add Feed / Discovery Source</h3>
              <button onClick={() => setIsAddSourceOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSource} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Source Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewSourceType('DIRECT_FEED')}
                    className={`p-2 rounded-xl border text-center font-bold ${
                      newSourceType === 'DIRECT_FEED'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Direct RSS/Atom Feed
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSourceType('GOOGLE_NEWS_DISCOVERY')}
                    className={`p-2 rounded-xl border text-center font-bold ${
                      newSourceType === 'GOOGLE_NEWS_DISCOVERY'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Google News Discovery
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Source Name</label>
                <input
                  type="text"
                  required
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  placeholder="e.g. DD News Defence / GNews Sci-Tech"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {newSourceType === 'DIRECT_FEED' ? (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Direct Feed URL</label>
                  <input
                    type="url"
                    required
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://.../feed.xml"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Discovery Query Template (with OR &amp; quotes)
                  </label>
                  <input
                    type="text"
                    required
                    value={newQueryTemplate}
                    onChange={(e) => setNewQueryTemplate(e.target.value)}
                    placeholder='(ISRO OR DRDO OR "military exercise")'
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-[11px]"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Automatically applies Indian English locale and `when:1d` freshness condition.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Source Group</label>
                  <select
                    value={newSourceGroup}
                    onChange={(e) => setNewSourceGroup(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    {SOURCE_GROUP_TABS.filter((t) => t.id !== 'ALL').map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Usage Rights</label>
                  <select
                    value={newPublisherRights}
                    onChange={(e) => setNewPublisherRights(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="OFFICIAL_GOVT">Govt Official (PIB/RBI)</option>
                    <option value="FAIR_DEALING_DISCOVERY">Fair Dealing Discovery</option>
                    <option value="PUBLIC_OPEN_ACCESS">Public Open Access</option>
                    <option value="REQUIRES_LICENSE">Requires License</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSourceOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSourceLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white disabled:opacity-50"
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

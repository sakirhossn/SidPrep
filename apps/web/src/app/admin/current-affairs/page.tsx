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
  originalSummary: string;
  category: string;
  targetExams?: string[];
  keyFacts?: string[];
  whyItMatters?: string;
  staticGkBackground?: string;
  practiceMcqs?: any[];
  sourceName: string;
  sourceUrl: string;
  editorialStatus: string;
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

  // Modals
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceCategory, setNewSourceCategory] = useState('National');
  const [addSourceLoading, setAddSourceLoading] = useState(false);

  const [testingSourceId, setTestingSourceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);

  const [editingDraft, setEditingDraft] = useState<NewsDraft | null>(null);
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
      setError(err.message || 'Failed to load current affairs data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFetchNow = async () => {
    setFetchingNow(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/news/fetch-now`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Ingestion trigger failed.');

      setSuccessMsg(
        `Fetch completed: ${data.itemsNew} new items drafted (${data.itemsDuplicate} duplicates skipped).`
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
    if (!newSourceName.trim() || !newSourceUrl.trim()) {
      setError('Source name and feed URL are required.');
      return;
    }

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
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Current Affairs Automation &amp; Editorial Pipeline
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real official feeds (PIB, ISRO, RBI) • SSRF-protected XML parser • Deduplication • Exam syllabus enrichment
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            onClick={handleFetchNow}
            disabled={fetchingNow}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
          >
            {fetchingNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Fetch Feeds Now
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

      {/* Section 1: Feed Sources Configuration */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-400" />
            Configured Ingestion Sources
          </h2>
          <button
            onClick={() => setIsAddSourceOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300"
          >
            <Plus className="w-3.5 h-3.5" /> Add Official Feed
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((src) => {
            const isEnabled = src.is_enabled !== undefined ? src.is_enabled : src.isEnabled;
            const feedUrl = src.feed_url || src.feedUrl || '';

            return (
              <div
                key={src.id}
                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading font-bold text-sm text-white">{src.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isEnabled
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-500'
                  }`}>
                    {isEnabled ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </div>

                <div className="font-mono text-[11px] text-slate-400 truncate bg-slate-950 p-2 rounded-xl border border-slate-800">
                  {feedUrl}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <span>Category: <strong className="text-slate-300">{src.category}</strong></span>
                  <button
                    onClick={() => handleTestSource(src.id)}
                    disabled={testingSourceId === src.id}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    {testingSourceId === src.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    Test Connectivity
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Test Result Preview */}
        {testResult && (
          <div className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 text-xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Feed Connectivity Validated
              </span>
              <button onClick={() => setTestResult(null)} className="text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-300">
              Parsed <strong>{testResult.itemCount}</strong> items from live feed. Sample headline preview:
            </p>
            {testResult.previewItems?.[0] && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-medium text-slate-200">
                &ldquo;{testResult.previewItems[0].title}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Recent Ingestion Jobs History */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            Recent Ingestion Jobs &amp; Audit Telemetry
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4">Job ID</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Fetched</th>
                  <th className="py-2.5 px-4">New Drafted</th>
                  <th className="py-2.5 px-4">Duplicates</th>
                  <th className="py-2.5 px-4">Started At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {jobs.slice(0, 5).map((j) => (
                  <tr key={j.id}>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{j.id}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        j.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : j.status === 'RUNNING'
                          ? 'bg-indigo-500/10 text-indigo-400'
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono">{j.items_fetched}</td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-400">{j.items_new}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{j.items_duplicate}</td>
                    <td className="py-2.5 px-4 text-slate-500">{new Date(j.created_at).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Editorial Review & Publishing Queue */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-indigo-400" />
            Editorial Review &amp; Publishing Queue
          </h2>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="APPROVED">APPROVED</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
            >
              <option value="ALL">All Categories</option>
              <option value="National">National</option>
              <option value="Economy & Banking">Economy &amp; Banking</option>
              <option value="Science & Technology">Science &amp; Technology</option>
              <option value="Environment & Ecology">Environment &amp; Ecology</option>
              <option value="Polity & Governance">Polity &amp; Governance</option>
              <option value="International Affairs">International</option>
            </select>
          </div>
        </div>

        {filteredDrafts.length === 0 ? (
          <div className="p-12 text-center text-slate-500 bg-slate-900 rounded-2xl border border-slate-800 text-xs">
            No articles match the selected editorial filters. Run &ldquo;Fetch Feeds Now&rdquo; to pull the latest news.
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
                    <span className="text-[10px] text-slate-500 font-mono">{d.sourceName}</span>
                    <span className="text-[10px] text-slate-500">• {new Date(d.createdAt).toLocaleDateString()}</span>
                  </div>

                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    d.editorialStatus === 'PUBLISHED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : d.editorialStatus === 'APPROVED'
                      ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                      : d.editorialStatus === 'SCHEDULED'
                      ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                  }`}>
                    {d.editorialStatus}
                  </span>
                </div>

                <div>
                  <h3 className="font-heading font-bold text-base text-white mb-1.5">{d.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{d.originalSummary}</p>
                </div>

                {d.keyFacts && d.keyFacts.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Key Exam Facts
                    </span>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                      {d.keyFacts.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Editorial Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <a
                    href={d.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                  >
                    Original Source <ExternalLink className="w-3 h-3" />
                  </a>

                  <div className="flex items-center gap-2 flex-wrap">
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

                    {d.editorialStatus === 'REVIEWED' && (
                      <button
                        onClick={() => handleTransitionStatus(d.id, 'APPROVED')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px]"
                      >
                        Approve for Publishing
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
                  <option value="National">National</option>
                  <option value="Economy & Banking">Economy &amp; Banking</option>
                  <option value="Science & Technology">Science &amp; Technology</option>
                  <option value="Environment & Ecology">Environment &amp; Ecology</option>
                  <option value="Polity & Governance">Polity &amp; Governance</option>
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

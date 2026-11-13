'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  ChevronRight,
  ChevronDown,
  Layers,
  Plus,
  BookOpen,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Tag,
  ShieldCheck,
  X,
  FileQuestion,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

const API_BASE = getApiBaseUrl();

interface TaxonomyItem {
  id: string;
  name: string;
  level: 'SUBJECT' | 'TOPIC' | 'SUBTOPIC';
  parentId?: string;
  slug?: string;
  sortOrder: number;
  isActive: boolean;
  description?: string;
  aliases: string[];
  examMappings: string[];
  questionCount: number;
  childCount: number;
  children?: TaxonomyItem[];
}

export default function AdminTaxonomyPage() {
  const [tree, setTree] = useState<TaxonomyItem[]>([]);
  const [flatList, setFlatList] = useState<TaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT'>('CREATE');
  const [modalLevel, setModalLevel] = useState<'SUBJECT' | 'TOPIC' | 'SUBTOPIC'>('SUBJECT');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAliases, setFormAliases] = useState('');
  const [formExamMappings, setFormExamMappings] = useState<string[]>([]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete & Reassign Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<TaxonomyItem | null>(null);
  const [deleteDependencies, setDeleteDependencies] = useState<{
    questionCount: number;
    childCount: number;
    children: Array<{ id: string; name: string }>;
    sampleQuestions: Array<{ id: string; text: string }>;
  } | null>(null);
  const [reassignToId, setReassignToId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const getHeaders = useCallback(() => {
    const token = typeof window !== 'undefined'
      ? sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token')
      : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchTaxonomy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/taxonomy`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load taxonomy (HTTP ${res.status})`);
      }
      const data = await res.json();
      setTree(data.tree || []);
      setFlatList(data.flat || []);

      // Auto-expand all subjects by default
      const defaultExpanded: Record<string, boolean> = {};
      (data.tree || []).forEach((subj: TaxonomyItem) => {
        defaultExpanded[subj.id] = true;
      });
      setExpandedNodes((prev) => ({ ...defaultExpanded, ...prev }));
    } catch (err: any) {
      setError(err.message || 'Failed to connect to taxonomy service');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchTaxonomy();
  }, [fetchTaxonomy]);

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openCreateModal = (level: 'SUBJECT' | 'TOPIC' | 'SUBTOPIC', parentId = '') => {
    setModalMode('CREATE');
    setModalLevel(level);
    setEditingId(null);
    setFormName('');
    setFormParentId(parentId);
    setFormSlug('');
    setFormDescription('');
    setFormAliases('');
    setFormExamMappings([]);
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (item: TaxonomyItem) => {
    setModalMode('EDIT');
    setModalLevel(item.level);
    setEditingId(item.id);
    setFormName(item.name);
    setFormParentId(item.parentId || '');
    setFormSlug(item.slug || '');
    setFormDescription(item.description || '');
    setFormAliases((item.aliases || []).join(', '));
    setFormExamMappings(item.examMappings || []);
    setFormIsActive(item.isActive !== false);
    setIsModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const payload: any = {
      name: formName.trim(),
      level: modalLevel,
      parentId: formParentId || undefined,
      slug: formSlug.trim() || undefined,
      description: formDescription.trim() || undefined,
      aliases: formAliases.split(',').map((s) => s.trim()).filter(Boolean),
      examMappings: formExamMappings,
      isActive: formIsActive,
    };

    try {
      const url = modalMode === 'CREATE'
        ? `${API_BASE}/v1/admin/taxonomy`
        : `${API_BASE}/v1/admin/taxonomy/${editingId}`;

      const res = await fetch(url, {
        method: modalMode === 'CREATE' ? 'POST' : 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save category');
      }

      setSuccessMsg(modalMode === 'CREATE' ? `Created "${formName}" successfully.` : `Updated "${formName}" successfully.`);
      setIsModalOpen(false);
      fetchTaxonomy();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (item: TaxonomyItem) => {
    try {
      const res = await fetch(`${API_BASE}/v1/admin/taxonomy/${item.id}`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (res.ok) {
        fetchTaxonomy();
      }
    } catch (err) {
      console.warn('Failed to toggle active status:', err);
    }
  };

  const handleMoveSibling = async (item: TaxonomyItem, direction: 'UP' | 'DOWN', siblings: TaxonomyItem[]) => {
    const currentIndex = siblings.findIndex((s) => s.id === item.id);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const targetItem = siblings[targetIndex];
    const newItems = [
      { id: item.id, sortOrder: targetItem.sortOrder },
      { id: targetItem.id, sortOrder: item.sortOrder },
    ];

    try {
      await fetch(`${API_BASE}/v1/admin/taxonomy/reorder`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ items: newItems }),
      });
      fetchTaxonomy();
    } catch (err) {
      console.warn('Failed to reorder:', err);
    }
  };

  const openDeleteModal = async (item: TaxonomyItem) => {
    setDeletingItem(item);
    setReassignToId('');
    setIsDeleteModalOpen(true);
    setDeleteDependencies(null);

    try {
      const res = await fetch(`${API_BASE}/v1/admin/taxonomy/${item.id}/dependencies`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setDeleteDependencies(data);
      }
    } catch (err) {
      console.warn('Could not inspect dependencies:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;

    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/v1/admin/taxonomy/${deletingItem.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ reassignToId: reassignToId || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete category');
      }

      setSuccessMsg(data.message || `Deleted "${deletingItem.name}" successfully.`);
      setIsDeleteModalOpen(false);
      setDeletingItem(null);
      fetchTaxonomy();
    } catch (err: any) {
      setError(err.message || 'Deletion failed');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter tree by search query
  const matchesSearch = (item: TaxonomyItem, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.aliases?.some((a) => a.toLowerCase().includes(q))) return true;
    if (item.children?.some((c) => matchesSearch(c, query))) return true;
    return false;
  };

  const filteredTree = tree.filter((subj) => matchesSearch(subj, searchQuery));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-primary" />
            Curriculum Taxonomy Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Database-backed hierarchical Subject &gt; Topic &gt; Subtopic ontology with question dependency safeguards
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openCreateModal('SUBJECT')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-slate-950 font-semibold text-xs rounded-xl hover:bg-primary-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subjects, topics, or aliases..."
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span>Total Nodes: <strong className="text-white">{flatList.length}</strong></span>
          <span>Subjects: <strong className="text-white">{tree.length}</strong></span>
        </div>
      </div>

      {/* Hierarchy Tree */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-xs">Loading curriculum taxonomy from PostgreSQL...</span>
        </div>
      ) : filteredTree.length === 0 ? (
        <div className="p-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No taxonomy categories found. Create a root subject to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTree.map((subject, sIdx) => {
            const isExpanded = !!expandedNodes[subject.id];
            return (
              <div key={subject.id} className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
                {/* Subject Header */}
                <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExpand(subject.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <BookOpen className="w-4 h-4 text-primary" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-sm text-white">{subject.name}</span>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                          Subject
                        </span>
                        {!subject.isActive && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                            Inactive
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                          {subject.questionCount} Qs
                        </span>
                      </div>
                      {subject.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{subject.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Actions for Subject */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openCreateModal('TOPIC', subject.id)}
                      title="Add Topic under this Subject"
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-primary" />
                      Add Topic
                    </button>
                    <button
                      onClick={() => handleMoveSibling(subject, 'UP', filteredTree)}
                      disabled={sIdx === 0}
                      title="Move Up"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveSibling(subject, 'DOWN', filteredTree)}
                      disabled={sIdx === filteredTree.length - 1}
                      title="Move Down"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditModal(subject)}
                      title="Edit Subject"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(subject)}
                      title="Delete Subject"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Topics Container */}
                {isExpanded && (
                  <div className="p-4 space-y-3 bg-slate-950/40">
                    {(!subject.children || subject.children.length === 0) ? (
                      <p className="text-xs text-slate-500 italic py-2 pl-8">No topics created under this subject yet.</p>
                    ) : (
                      subject.children.map((topic, tIdx) => {
                        const isTopicExpanded = !!expandedNodes[topic.id];
                        return (
                          <div key={topic.id} className="rounded-xl bg-slate-900 border border-slate-800/80 p-3 ml-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleExpand(topic.id)}
                                  className="p-0.5 rounded text-slate-400 hover:text-white"
                                >
                                  {isTopicExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                                <span className="font-heading font-semibold text-xs text-slate-200">{topic.name}</span>
                                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  Topic
                                </span>
                                {!topic.isActive && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-red-500/20 text-red-400">
                                    Inactive
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                                  {topic.questionCount} Qs
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openCreateModal('SUBTOPIC', topic.id)}
                                  title="Add Subtopic"
                                  className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700"
                                >
                                  + Subtopic
                                </button>
                                <button
                                  onClick={() => handleMoveSibling(topic, 'UP', subject.children || [])}
                                  disabled={tIdx === 0}
                                  title="Move Up"
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleMoveSibling(topic, 'DOWN', subject.children || [])}
                                  disabled={tIdx === (subject.children?.length || 0) - 1}
                                  title="Move Down"
                                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => openEditModal(topic)}
                                  className="p-1 text-slate-400 hover:text-white"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => openDeleteModal(topic)}
                                  className="p-1 text-slate-400 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Subtopics List */}
                            {isTopicExpanded && (
                              <div className="mt-3 pl-6 space-y-1.5 border-l-2 border-slate-800">
                                {(!topic.children || topic.children.length === 0) ? (
                                  <p className="text-[11px] text-slate-500 italic py-1">No subtopics added.</p>
                                ) : (
                                  topic.children.map((sub, sIdx) => (
                                    <div
                                      key={sub.id}
                                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                        <span className="text-slate-300">{sub.name}</span>
                                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                          Subtopic
                                        </span>
                                        {!sub.isActive && (
                                          <span className="text-[9px] text-red-400 font-mono">Inactive</span>
                                        )}
                                        {sub.questionCount > 0 && (
                                          <span className="text-[10px] text-slate-400">({sub.questionCount} Qs)</span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleMoveSibling(sub, 'UP', topic.children || [])}
                                          disabled={sIdx === 0}
                                          className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                                        >
                                          <ArrowUp className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          onClick={() => handleMoveSibling(sub, 'DOWN', topic.children || [])}
                                          disabled={sIdx === (topic.children?.length || 0) - 1}
                                          className="p-1 text-slate-500 hover:text-white disabled:opacity-20"
                                        >
                                          <ArrowDown className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          onClick={() => openEditModal(sub)}
                                          className="p-1 text-slate-500 hover:text-white"
                                        >
                                          <Edit2 className="w-2.5 h-2.5" />
                                        </button>
                                        <button
                                          onClick={() => openDeleteModal(sub)}
                                          className="p-1 text-slate-500 hover:text-red-400"
                                        >
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-heading font-bold text-base text-white">
                {modalMode === 'CREATE' ? `Add New ${modalLevel}` : `Edit ${modalLevel}`}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Quantitative Aptitude"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Parent selection if TOPIC or SUBTOPIC */}
              {modalLevel !== 'SUBJECT' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Parent {modalLevel === 'TOPIC' ? 'Subject' : 'Topic'} <span className="text-red-400">*</span>
                  </label>
                  <select
                    required
                    value={formParentId}
                    onChange={(e) => setFormParentId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                  >
                    <option value="">-- Select Parent --</option>
                    {flatList
                      .filter((f) => modalLevel === 'TOPIC' ? f.level === 'SUBJECT' : f.level === 'TOPIC')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.level})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Summary of syllabus scope..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Aliases (Comma-separated, for question mapping)
                </label>
                <input
                  type="text"
                  value={formAliases}
                  onChange={(e) => setFormAliases(e.target.value)}
                  placeholder="e.g. Quants, Math, Numerical Ability"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Exam Mappings</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['SSC_CGL', 'RRB_NTPC', 'IBPS_PO', 'WBPSC_CLERKSHIP'].map((exam) => {
                    const isSelected = formExamMappings.includes(exam);
                    return (
                      <button
                        type="button"
                        key={exam}
                        onClick={() => {
                          setFormExamMappings(
                            isSelected
                              ? formExamMappings.filter((e) => e !== exam)
                              : [...formExamMappings, exam]
                          );
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-primary/20 text-primary border-primary/40 font-semibold'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {exam}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary w-4 h-4"
                />
                <label htmlFor="isActiveToggle" className="text-xs text-slate-300">
                  Active in Student Practice &amp; Test Blueprints
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-primary hover:bg-primary-hover transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {modalMode === 'CREATE' ? 'Create Category' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation & Question Reassignment Modal */}
      {isDeleteModalOpen && deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-heading font-bold text-base text-red-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                Delete &ldquo;{deletingItem.name}&rdquo;
              </h2>
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteDependencies === null ? (
              <div className="py-6 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                Checking question bank dependencies...
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                {deleteDependencies.childCount > 0 ? (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 space-y-1">
                    <p className="font-semibold">Cannot Delete: Has Child Categories</p>
                    <p>
                      This category contains {deleteDependencies.childCount} subcategories. You must reassign or delete the child categories first before removing this parent.
                    </p>
                  </div>
                ) : deleteDependencies.questionCount > 0 ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <FileQuestion className="w-4 h-4 text-amber-400" />
                        Referenced by {deleteDependencies.questionCount} Questions
                      </p>
                      <p>
                        To prevent broken references or question loss, you must select another active category to inherit these questions:
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Reassign Questions To <span className="text-red-400">*</span>
                      </label>
                      <select
                        required
                        value={reassignToId}
                        onChange={(e) => setReassignToId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-primary"
                      >
                        <option value="">-- Choose Reassignment Target --</option>
                        {flatList
                          .filter((f) => f.id !== deletingItem.id && f.isActive)
                          .map((target) => (
                            <option key={target.id} value={target.id}>
                              {target.name} ({target.level})
                            </option>
                          ))}
                      </select>
                    </div>

                    {deleteDependencies.sampleQuestions?.length > 0 && (
                      <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-800">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Sample Affected Questions:
                        </span>
                        <ul className="space-y-1 text-slate-300 list-disc list-inside">
                          {deleteDependencies.sampleQuestions.slice(0, 3).map((sq) => (
                            <li key={sq.id} className="truncate">
                              {sq.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-300">
                    No questions or child categories reference this category. It can be safely deleted.
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      isDeleting ||
                      deleteDependencies.childCount > 0 ||
                      (deleteDependencies.questionCount > 0 && !reassignToId)
                    }
                    onClick={handleConfirmDelete}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm Safe Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

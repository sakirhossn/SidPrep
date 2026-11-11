'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Edit3,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertCircle,
  Save,
  X,
  Lock,
  Globe,
  History,
  Eye,
  Code2,
  Columns,
  RotateCcw,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface RevisionItem {
  id: string;
  pageId: string;
  slug: string;
  title: string;
  contentHtml: string;
  revisionNumber: number;
  createdBy: string;
  createdAt: string;
}

interface PageItem {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  contentHtml: string;
  metaTitle?: string;
  metaDescription?: string;
  isPublished: boolean;
  isSystem: boolean;
  updatedAt: string;
  createdAt: string;
}

export default function AdminPagesManager() {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit / Create modal state
  const [editingPage, setEditingPage] = useState<PageItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    subtitle: '',
    contentHtml: '',
    metaTitle: '',
    metaDescription: '',
    isPublished: true,
  });

  // Split / Live Preview Mode
  const [editorView, setEditorView] = useState<'editor' | 'preview' | 'split'>('split');

  // Revisions State
  const [revisionsModalOpen, setRevisionsModalOpen] = useState(false);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loadingRevisions, setLoadingRevisions] = useState(false);
  const [revertingRevId, setRevertingRevId] = useState<string | null>(null);

  const fetchRevisions = async (pageId: string) => {
    setLoadingRevisions(true);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/pages/${pageId}/revisions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRevisions(data.revisions || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingRevisions(false);
    }
  };

  const handleRevert = async (revisionId: string) => {
    if (!editingPage) return;
    if (!confirm('Are you sure you want to revert to this revision? The current page content will be saved as a new revision snapshot.')) return;
    setRevertingRevId(revisionId);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/pages/${editingPage.id}/revert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ revisionId }),
      });
      if (!res.ok) throw new Error('Failed to revert revision');
      const data = await res.json();
      setFormData((prev) => ({
        ...prev,
        title: data.page.title,
        contentHtml: data.page.contentHtml,
        slug: data.page.slug,
      }));
      setSuccess(`Page successfully reverted to revision.`);
      setRevisionsModalOpen(false);
      fetchPages();
    } catch (err: any) {
      setError(err.message || 'Error reverting revision');
    } finally {
      setRevertingRevId(null);
    }
  };

  const fetchPages = async () => {
    setLoading(true);
    setError(null);
    try {
      const token =
        sessionStorage.getItem('sidprep_admin_token') ||
        localStorage.getItem('sidprep_admin_token');

      const res = await fetch(`${API_BASE}/v1/admin/pages`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load pages');
      const data = await res.json();
      setPages(data);
    } catch (err: any) {
      setError(err.message || 'Error fetching CMS pages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const openCreateModal = () => {
    setEditingPage(null);
    setFormData({
      title: '',
      slug: '',
      subtitle: '',
      contentHtml: '<h3>Introduction</h3>\n<p>Add your content here...</p>',
      metaTitle: '',
      metaDescription: '',
      isPublished: true,
    });
    setIsCreating(true);
    setError(null);
    setSuccess(null);
  };

  const openEditModal = (page: PageItem) => {
    setIsCreating(false);
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      subtitle: page.subtitle || '',
      contentHtml: page.contentHtml || '',
      metaTitle: page.metaTitle || '',
      metaDescription: page.metaDescription || '',
      isPublished: page.isPublished,
    });
    setError(null);
    setSuccess(null);
  };

  const closeModal = () => {
    setEditingPage(null);
    setIsCreating(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');

    try {
      if (isCreating) {
        const res = await fetch(`${API_BASE}/v1/admin/pages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to create page');
        setSuccess(`Page '${formData.title}' created successfully.`);
      } else if (editingPage) {
        const res = await fetch(`${API_BASE}/v1/admin/pages/${editingPage.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(formData),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || 'Failed to update page');
        setSuccess(`Page '${formData.title}' updated successfully.`);
      }

      closeModal();
      fetchPages();
    } catch (err: any) {
      setError(err.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (page: PageItem) => {
    if (page.isSystem) {
      alert('System pages cannot be deleted.');
      return;
    }

    if (!confirm(`Are you sure you want to delete '${page.title}'?`)) return;

    const token =
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token');

    try {
      const res = await fetch(`${API_BASE}/v1/admin/pages/${page.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete page');
      setSuccess(`Page '${page.title}' deleted successfully.`);
      fetchPages();
    } catch (err: any) {
      setError(err.message || 'Error deleting page');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-xl text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Website Page CMS
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage public website pages (About, Contact, Terms, Privacy) or publish new custom content pages.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold shadow-md transition-all self-start"
        >
          <Plus className="w-4 h-4" />
          Create New Page
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Pages Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            Loading website pages...
          </div>
        ) : pages.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No pages found. Click 'Create New Page' to publish one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Page Title & Path</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Last Updated</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pages.map((page) => (
                  <tr key={page.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-white text-sm">{page.title}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-slate-500" />
                        {page.isSystem ? `/${page.slug}` : `/p/${page.slug}`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {page.isSystem ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                          <Lock className="w-2.5 h-2.5" /> System Core
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold">
                          Custom CMS
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {page.isPublished ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                          <XCircle className="w-3.5 h-3.5" /> Draft
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400 text-[11px]">
                      {new Date(page.updatedAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <Link
                        href={page.isSystem ? `/${page.slug}` : `/p/${page.slug}`}
                        target="_blank"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors inline-block"
                        title="View Public Page"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>

                      <button
                        onClick={() => openEditModal(page)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-800 transition-colors"
                        title="Edit Page"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {!page.isSystem && (
                        <button
                          onClick={() => handleDelete(page)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                          title="Delete Page"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Create Modal */}
      {(isCreating || editingPage) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                {isCreating ? 'Create New Public Website Page' : `Edit Page: ${editingPage?.title}`}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Page Title
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Slug / URL Path
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingPage?.isSystem}
                    value={formData.slug}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs disabled:opacity-50 focus:ring-2 focus:ring-primary outline-none"
                  />
                  {editingPage?.isSystem && (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Core system slugs cannot be altered.
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Subtitle / Deck
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  placeholder="Short summary under main heading..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Page Content (HTML / Rich Text)
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
                    <button
                      type="button"
                      onClick={() => setEditorView('editor')}
                      className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        editorView === 'editor' ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Code2 className="w-3 h-3" />
                      Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorView('split')}
                      className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        editorView === 'split' ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Columns className="w-3 h-3" />
                      Split View
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorView('preview')}
                      className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                        editorView === 'preview' ? 'bg-primary text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      Live Preview
                    </button>
                  </div>
                </div>

                {/* Quick HTML Insertion Toolbar */}
                <div className="flex items-center gap-1.5 mb-2 overflow-x-auto py-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contentHtml: formData.contentHtml + '\n<h3>Section Heading</h3>\n' })}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                  >
                    + H3 Heading
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contentHtml: formData.contentHtml + '<b>Important text</b>' })}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                  >
                    + Bold
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contentHtml: formData.contentHtml + '\n<ul>\n  <li>Key point 1</li>\n  <li>Key point 2</li>\n</ul>\n' })}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                  >
                    + Bullet List
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contentHtml: formData.contentHtml + '\n<div class="p-3 bg-blue-900/30 border border-blue-800 rounded-lg text-blue-200 text-xs">Note message</div>\n' })}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                  >
                    + Callout Box
                  </button>
                </div>

                {/* Editor Content Area */}
                {editorView === 'editor' && (
                  <textarea
                    rows={12}
                    required
                    value={formData.contentHtml}
                    onChange={(e) => setFormData({ ...formData, contentHtml: e.target.value })}
                    className="w-full p-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-primary outline-none leading-relaxed"
                  />
                )}

                {editorView === 'preview' && (
                  <div
                    className="w-full min-h-[300px] max-h-[420px] overflow-y-auto p-4 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs leading-relaxed space-y-2"
                    dangerouslySetInnerHTML={{ __html: formData.contentHtml || '<em>No content entered yet</em>' }}
                  />
                )}

                {editorView === 'split' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <textarea
                      rows={12}
                      required
                      value={formData.contentHtml}
                      onChange={(e) => setFormData({ ...formData, contentHtml: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-primary outline-none leading-relaxed"
                    />
                    <div className="flex flex-col">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1 px-1">
                        Rendered Output
                      </div>
                      <div
                        className="w-full flex-1 max-h-[280px] overflow-y-auto p-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs leading-relaxed space-y-2"
                        dangerouslySetInnerHTML={{ __html: formData.contentHtml || '<em>Live preview will appear here</em>' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Meta Title (SEO)
                  </label>
                  <input
                    type="text"
                    value={formData.metaTitle}
                    onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Publishing Status
                  </label>
                  <select
                    value={formData.isPublished ? 'published' : 'draft'}
                    onChange={(e) =>
                      setFormData({ ...formData, isPublished: e.target.value === 'published' })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-primary outline-none"
                  >
                    <option value="published">Published (Visible Publicly)</option>
                    <option value="draft">Draft (Hidden)</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
                {editingPage && (
                  <button
                    type="button"
                    onClick={() => {
                      fetchRevisions(editingPage.id);
                      setRevisionsModalOpen(true);
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <History className="w-3.5 h-3.5 text-primary" />
                    Revision History
                  </button>
                )}

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                  >
                    {saving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save Page
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {revisionsModalOpen && editingPage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-heading font-bold text-base text-white flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                Revision History: {editingPage.title}
              </h2>
              <button
                onClick={() => setRevisionsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1">
              {loadingRevisions ? (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  Loading revisions...
                </div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No previous revisions saved for this page yet. Revisions are created automatically every time a page is updated.
                </div>
              ) : (
                revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded bg-primary/20 text-primary-300 font-mono text-[10px] font-bold">
                          Rev #{rev.revisionNumber}
                        </span>
                        <span className="text-white text-xs font-semibold">{rev.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-3">
                        <span>Slug: {rev.slug}</span>
                        <span>Saved: {new Date(rev.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={revertingRevId === rev.id}
                      onClick={() => handleRevert(rev.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors self-end sm:self-center shrink-0"
                    >
                      {revertingRevId === rev.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      Revert to this snapshot
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setRevisionsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

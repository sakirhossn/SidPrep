'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Quote,
  Minus,
  Link as LinkIcon,
  Unlink,
  Image as ImageIcon,
  Table as TableIcon,
  Undo,
  Redo,
  Smartphone,
  Monitor,
  Columns,
  Eye,
  Plus,
  Trash2,
  Upload,
  X,
  FileText,
} from 'lucide-react';

interface TiptapEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  viewMode?: 'editor' | 'preview' | 'split';
  onViewModeChange?: (mode: 'editor' | 'preview' | 'split') => void;
}

export function TiptapEditor({
  value,
  onChange,
  placeholder = 'Draft website page content here...',
  viewMode = 'split',
  onViewModeChange,
}: TiptapEditorProps) {
  const [internalViewMode, setInternalViewMode] = useState<'editor' | 'preview' | 'split'>(viewMode);
  const currentViewMode = onViewModeChange ? viewMode : internalViewMode;
  const setViewMode = (mode: 'editor' | 'preview' | 'split') => {
    if (onViewModeChange) onViewModeChange(mode);
    else setInternalViewMode(mode);
  };

  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');

  // Modal dialog states
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'text-primary underline hover:text-primary-600',
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'rounded-xl max-w-full my-3 shadow-md border border-slate-700',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse w-full my-4 border border-slate-700 rounded-lg overflow-hidden',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'w-full min-h-[300px] max-h-[500px] overflow-y-auto px-4 py-3 bg-slate-900 text-slate-100 text-xs font-sans leading-relaxed focus:outline-none rounded-b-xl',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
  });

  // Sync external value when editor isn't focused
  useEffect(() => {
    if (editor && value !== undefined && value !== editor.getHTML()) {
      if (!editor.isFocused) {
        editor.commands.setContent(value || '', { emitUpdate: false });
      }
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs bg-slate-900 rounded-xl border border-slate-800">
        Loading rich text editor...
      </div>
    );
  }

  // Formatting helpers
  const handleSetLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      let finalUrl = linkUrl.trim();
      if (!/^https?:\/\/|^\/|^mailto:/i.test(finalUrl)) {
        finalUrl = `https://${finalUrl}`;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
    }
    setLinkModalOpen(false);
    setLinkUrl('');
  };

  const handleInsertImage = () => {
    if (imageUrl.trim()) {
      editor
        .chain()
        .focus()
        .setImage({ src: imageUrl.trim(), alt: imageAlt.trim() || 'Website illustration' })
        .run();
    }
    setImageModalOpen(false);
    setImageUrl('');
    setImageAlt('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image file is too large (max 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editor
        .chain()
        .focus()
        .setImage({ src: base64, alt: imageAlt.trim() || file.name })
        .run();
      setImageModalOpen(false);
      setImageUrl('');
      setImageAlt('');
    };
    reader.readAsDataURL(file);
  };

  // Word & Character count
  const textContent = editor.getText();
  const wordCount = textContent.trim() ? textContent.trim().split(/\s+/).length : 0;
  const charCount = textContent.length;

  return (
    <div className="border border-slate-700/80 rounded-2xl overflow-hidden bg-slate-900 shadow-xl flex flex-col">
      {/* Top Header / Viewport Toolbar */}
      <div className="px-3.5 py-2.5 bg-slate-800/90 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
        {/* Editor vs Split vs Preview Mode Toggles */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              currentViewMode === 'editor'
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Editor Only
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              currentViewMode === 'split'
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            Split View
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              currentViewMode === 'preview'
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Full Preview
          </button>
        </div>

        {/* Viewport Size Switcher (Desktop vs Mobile Preview) */}
        {(currentViewMode === 'preview' || currentViewMode === 'split') && (
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setPreviewViewport('desktop')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewViewport === 'desktop'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Desktop Viewport Preview"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewViewport('mobile')}
              className={`p-1.5 rounded-lg text-xs font-semibold transition-all ${
                previewViewport === 'mobile'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mobile Device (375px) Preview"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Word and Character Count Stats */}
        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-3">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
        </div>
      </div>

      {/* Formatting Ribbon / Controls Toolbar (Shown in Editor & Split views) */}
      {currentViewMode !== 'preview' && (
        <div className="px-3 py-2 bg-slate-850/80 border-b border-slate-700 flex flex-wrap items-center gap-1 text-slate-300">
          {/* History */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300"
              title="Undo (Ctrl+Z)"
            >
              <Undo className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300"
              title="Redo (Ctrl+Y)"
            >
              <Redo className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Text Style: Bold, Italic, Underline, Strike, Code */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('bold') ? 'bg-primary text-white font-bold' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('italic') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('underline') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Underline (Ctrl+U)"
            >
              <UnderlineIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('strike') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('code') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Inline Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Headings */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                editor.isActive('heading', { level: 1 }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Heading 1"
            >
              H1
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                editor.isActive('heading', { level: 2 }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Heading 2"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                editor.isActive('heading', { level: 3 }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Heading 3"
            >
              H3
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setParagraph().run()}
              className={`px-2 py-1 rounded text-[11px] ${
                editor.isActive('paragraph') ? 'bg-slate-700 text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Paragraph"
            >
              P
            </button>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('bulletList') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Bullet List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('orderedList') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Numbered List"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive({ textAlign: 'left' }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Align Left"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive({ textAlign: 'center' }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Align Center"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive({ textAlign: 'right' }) ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Align Right"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quotes & Dividers */}
          <div className="flex items-center gap-0.5 border-r border-slate-700 pr-1.5 mr-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('blockquote') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Blockquote"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
              title="Horizontal Rule"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Media & Embeds: Link, Image, Table */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                const prevLink = editor.getAttributes('link').href || '';
                setLinkUrl(prevLink);
                setLinkModalOpen(true);
              }}
              className={`p-1.5 rounded transition-colors ${
                editor.isActive('link') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
              }`}
              title="Insert / Edit Link"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
            {editor.isActive('link') && (
              <button
                type="button"
                onClick={() => editor.chain().focus().unsetLink().run()}
                className="p-1.5 rounded hover:bg-red-500/20 text-red-400"
                title="Remove Link"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setImageModalOpen(true)}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-300"
              title="Insert Image with Alt Text"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>

            {/* Table Dropdown Menu */}
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setTableMenuOpen(!tableMenuOpen)}
                className={`p-1.5 rounded transition-colors ${
                  editor.isActive('table') ? 'bg-primary text-white' : 'hover:bg-slate-700 text-slate-300'
                }`}
                title="Table Operations"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              {tableMenuOpen && (
                <div className="absolute left-0 mt-1 z-30 w-44 rounded-xl bg-slate-800 border border-slate-700 shadow-2xl py-1 text-xs text-slate-200">
                  {!editor.isActive('table') ? (
                    <button
                      type="button"
                      onClick={() => {
                        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                        setTableMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3 text-emerald-400" /> Insert 3x3 Table
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addColumnBefore().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700"
                      >
                        + Col Before
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addColumnAfter().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700"
                      >
                        + Col After
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteColumn().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-amber-400"
                      >
                        - Delete Column
                      </button>
                      <div className="border-t border-slate-700 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addRowBefore().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700"
                      >
                        + Row Before
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().addRowAfter().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700"
                      >
                        + Row After
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteRow().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-amber-400"
                      >
                        - Delete Row
                      </button>
                      <div className="border-t border-slate-700 my-1" />
                      <button
                        type="button"
                        onClick={() => {
                          editor.chain().focus().deleteTable().run();
                          setTableMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-500/20 text-red-400 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" /> Delete Table
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace (Editor Area & Live Preview) */}
      <div className="flex-1 bg-slate-950 flex flex-col md:flex-row overflow-hidden min-h-[350px]">
        {/* Visual Editor Pane */}
        {currentViewMode !== 'preview' && (
          <div
            className={`flex-1 flex flex-col border-r border-slate-800 ${
              currentViewMode === 'split' ? 'md:w-1/2' : 'w-full'
            }`}
          >
            <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
          </div>
        )}

        {/* Live Preview Pane (Desktop or Mobile viewport) */}
        {currentViewMode !== 'editor' && (
          <div
            className={`flex-1 bg-slate-900/60 p-4 overflow-y-auto flex flex-col items-center justify-start ${
              currentViewMode === 'split' ? 'md:w-1/2' : 'w-full'
            }`}
          >
            <div className="w-full flex items-center justify-between mb-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                {previewViewport === 'desktop' ? (
                  <>
                    <Monitor className="w-3 h-3 text-primary" /> Desktop Preview
                  </>
                ) : (
                  <>
                    <Smartphone className="w-3 h-3 text-purple-400" /> Mobile (375px) Preview
                  </>
                )}
              </span>
              <span className="text-[10px] text-slate-500">Public Website View</span>
            </div>

            {/* Desktop Container vs Mobile Frame */}
            <div
              className={`transition-all bg-white text-slate-900 shadow-2xl overflow-y-auto p-6 sm:p-8 ${
                previewViewport === 'desktop'
                  ? 'w-full max-w-3xl rounded-xl min-h-[320px]'
                  : 'w-[375px] max-w-full rounded-[36px] border-[8px] border-slate-800 min-h-[480px] my-2'
              }`}
            >
              {previewViewport === 'mobile' && (
                <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto mb-4" />
              )}
              <div
                className="prose prose-slate max-w-none text-xs leading-relaxed space-y-4"
                dangerouslySetInnerHTML={{
                  __html: editor.getHTML() || '<p class="text-slate-400 italic">No content entered yet...</p>',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Link Insertion Modal */}
      {linkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-primary" />
                Insert / Edit Hyperlink
              </h4>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Destination URL</label>
              <input
                type="url"
                placeholder="https://example.com or /about"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Safe protocols: https, http, mailto, or local /paths. Unsafe protocols (e.g. javascript:) will be filtered.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetLink}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-600 text-white text-xs font-bold"
              >
                Apply Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Insertion Modal */}
      {imageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-heading font-bold text-sm text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                Insert Image into Content
              </h4>
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Image URL</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/... or /v1/cms/..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Alt Text (Mandatory for Screen Readers & SEO)
                </label>
                <input
                  type="text"
                  placeholder="Detailed description of the image..."
                  value={imageAlt}
                  onChange={(e) => setImageAlt(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Or upload from your computer:
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-dashed border-slate-700 text-slate-300 text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-primary" />
                  Choose Local Image File (Max 5MB)
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertImage}
                disabled={!imageUrl.trim()}
                className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-600 disabled:opacity-50 text-white text-xs font-bold"
              >
                Insert Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

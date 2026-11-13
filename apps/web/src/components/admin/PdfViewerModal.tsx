'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Printer,
  Search,
  RefreshCw,
  AlertCircle,
  FileText,
  Lock,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
} from 'lucide-react';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  resourceId: string;
  title: string;
  fileType: string;
  streamUrl: string;
  downloadAllowed: boolean;
  printAllowed?: boolean;
  isAdmin?: boolean;
  authToken?: string;
}

export function PdfViewerModal({
  isOpen,
  onClose,
  resourceId,
  title,
  fileType,
  streamUrl,
  downloadAllowed,
  printAllowed = false,
  isAdmin = false,
  authToken,
}: PdfViewerModalProps) {
  // Viewer State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiredAccess, setExpiredAccess] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [fitWidth, setFitWidth] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  // DOM Refs
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const canDownload = isAdmin || downloadAllowed;
  const canPrint = isAdmin || (downloadAllowed && printAllowed);

  // Load PDF.js and initialize document
  const loadPdf = useCallback(async () => {
    if (fileType.toUpperCase() !== 'PDF') {
      setError('UNSUPPORTED_FORMAT: In-browser interactive viewer only supports PDF documents.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setExpiredAccess(false);

    try {
      // Dynamic import of pdfjs-dist for client-side rendering
      const pdfjs = await import('pdfjs-dist');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      }

      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const loadingTask = pdfjs.getDocument({
        url: streamUrl,
        httpHeaders: headers,
        withCredentials: true,
      });

      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setCurrentPage(1);
      setLoading(false);
    } catch (err: any) {
      console.warn('[PdfViewer] PDF.js load error:', err);
      if (err?.status === 401 || err?.status === 403 || err?.message?.includes('expired') || err?.message?.includes('token')) {
        setExpiredAccess(true);
      } else if (err?.status === 404) {
        setError('DOCUMENT_NOT_FOUND: The requested document binary was not found in storage.');
      } else {
        setError(err.message || 'Failed to load PDF document.');
      }
      setLoading(false);
    }
  }, [fileType, streamUrl, authToken]);

  useEffect(() => {
    if (isOpen) {
      loadPdf();
    } else {
      setPdfDoc(null);
      setCurrentPage(1);
      setNumPages(0);
      setError(null);
    }
  }, [isOpen, loadPdf]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || currentPage < 1 || currentPage > numPages) return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        // Cancel previous ongoing render task if any
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        let computedScale = scale;
        if (fitWidth && modalContainerRef.current) {
          const containerWidth = modalContainerRef.current.clientWidth - (showThumbnails ? 260 : 64);
          const unscaledViewport = page.getViewport({ scale: 1 });
          computedScale = Math.max(0.6, containerWidth / unscaledViewport.width);
        }

        const viewport = page.getViewport({ scale: computedScale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.warn('[PdfViewer] Canvas render error:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale, fitWidth, numPages, showThumbnails]);

  // Text search implementation
  const handleSearch = async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      setSearchResults([]);
      setCurrentMatchIdx(-1);
      return;
    }

    setIsSearching(true);
    const results: { page: number; text: string }[] = [];
    const queryLower = searchQuery.toLowerCase().trim();

    try {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((i: any) => i.str).join(' ');

        if (pageText.toLowerCase().includes(queryLower)) {
          results.push({ page: p, text: pageText });
        }
      }

      setSearchResults(results);
      if (results.length > 0) {
        setCurrentMatchIdx(0);
        setCurrentPage(results[0].page);
      } else {
        setCurrentMatchIdx(-1);
      }
    } catch (err: any) {
      console.warn('[PdfViewer] Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % searchResults.length;
    setCurrentMatchIdx(nextIdx);
    setCurrentPage(searchResults[nextIdx].page);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIdx(prevIdx);
    setCurrentPage(searchResults[prevIdx].page);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!modalContainerRef.current) return;
    if (!fullscreen) {
      if (modalContainerRef.current.requestFullscreen) {
        modalContainerRef.current.requestFullscreen().catch(() => {});
      }
      setFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setFullscreen(false);
    }
  };

  // Print handler
  const handlePrint = () => {
    if (!canPrint) {
      alert('Printing is disabled by administrator security policy.');
      return;
    }
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div
        ref={modalContainerRef}
        className={`bg-slate-950 border border-slate-800 rounded-2xl w-full flex flex-col shadow-2xl overflow-hidden transition-all ${
          fullscreen ? 'fixed inset-0 rounded-none border-none' : 'max-w-6xl h-[92vh]'
        }`}
      >
        {/* Top Header & Toolbar */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Document Title & Thumbnail Sidebar Toggle */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowThumbnails(!showThumbnails)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 transition-colors"
              title={showThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}
            >
              {showThumbnails ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-primary" />
              )}
            </button>

            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="truncate">
              <h3 className="font-heading font-bold text-xs text-white truncate max-w-xs sm:max-w-md">
                {title}
              </h3>
              <div className="text-[10px] text-slate-400 flex items-center gap-2">
                <span>{fileType}</span>
                {isAdmin ? (
                  <span className="text-amber-400 font-bold">Admin Preview (Overrides Restrictions)</span>
                ) : (
                  <span>
                    {downloadAllowed ? 'Download Allowed' : 'Strict Preview-Only Mode'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center Navigation & Zoom Controls */}
          {numPages > 0 && (
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Page Nav */}
              <div className="flex items-center gap-1 bg-slate-800/90 px-2 py-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded text-slate-300 hover:text-white disabled:opacity-30"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <div className="text-[11px] font-mono text-slate-200 px-1">
                  Page{' '}
                  <input
                    type="number"
                    min={1}
                    max={numPages}
                    value={currentPage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= numPages) {
                        setCurrentPage(val);
                      }
                    }}
                    className="w-10 bg-slate-900 border border-slate-700 text-center rounded text-white text-[11px] outline-none"
                  />{' '}
                  of {numPages}
                </div>
                <button
                  type="button"
                  disabled={currentPage >= numPages}
                  onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
                  className="p-1 rounded text-slate-300 hover:text-white disabled:opacity-30"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="hidden sm:flex items-center gap-1 bg-slate-800/90 px-2 py-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setFitWidth(false);
                    setScale((s) => Math.max(0.5, s - 0.2));
                  }}
                  className="p-1 rounded text-slate-300 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-slate-300 px-1">
                  {fitWidth ? 'Fit' : `${Math.round(scale * 100)}%`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFitWidth(false);
                    setScale((s) => Math.min(2.5, s + 0.2));
                  }}
                  className="p-1 rounded text-slate-300 hover:text-white"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFitWidth(!fitWidth)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    fitWidth ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Fit to Width"
                >
                  Fit
                </button>
              </div>
            </div>
          )}

          {/* Right Action Icons: Search, Print, Download, Fullscreen, Close */}
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Search Input */}
            {numPages > 0 && (
              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Find text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="w-28 sm:w-36 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="absolute right-1 text-slate-400 hover:text-white p-1"
                  title="Search text"
                >
                  {isSearching ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                </button>
                {searchResults.length > 0 && (
                  <div className="ml-1 flex items-center gap-0.5 text-[10px] text-slate-400 font-mono">
                    <span>
                      {currentMatchIdx + 1}/{searchResults.length}
                    </span>
                    <button onClick={handlePrevMatch} className="p-0.5 hover:text-white">
                      ↑
                    </button>
                    <button onClick={handleNextMatch} className="p-0.5 hover:text-white">
                      ↓
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Print Button (Permission gated) */}
            {canPrint && (
              <button
                type="button"
                onClick={handlePrint}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Print Document"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Download Button (Permission gated) */}
            {canDownload ? (
              <a
                href={streamUrl}
                download={`${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`}
                className="p-1.5 rounded-lg bg-primary hover:bg-primary-600 text-white transition-colors"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span
                className="p-1.5 rounded-lg bg-slate-800 text-slate-500 cursor-not-allowed"
                title="Direct downloads disabled by administrative policy"
              >
                <Lock className="w-3.5 h-3.5" />
              </span>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
              title="Close Viewer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security & Screenshot Prevention Notice */}
        <div className="px-4 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate">
              <strong>Digital Document Protection Notice:</strong> Displaying PDF contents on client screens cannot guarantee prevention of copying or screenshots (e.g. system screen capture, external cameras, or printscreen tools). SidPrep enforces token expiration and role-based permissions at the API layer.
            </span>
          </div>
          <span className="font-mono text-slate-400 text-[9px] shrink-0">
            Byte-Range Streaming (HTTP 206)
          </span>
        </div>

        {/* Main Body: Thumbnails Sidebar + Canvas Viewport */}
        <div className="flex-1 flex overflow-hidden bg-slate-950 relative">
          {/* Thumbnails Sidebar */}
          {showThumbnails && numPages > 0 && (
            <div className="w-56 bg-slate-900 border-r border-slate-800 p-3 overflow-y-auto space-y-3 shrink-0">
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">
                Page Thumbnails ({numPages})
              </div>
              {Array.from({ length: numPages }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentPage(idx + 1)}
                  className={`w-full p-2 rounded-xl text-left border transition-all ${
                    currentPage === idx + 1
                      ? 'bg-primary/20 border-primary text-white shadow-md'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <div className="w-full h-24 bg-slate-950 rounded flex items-center justify-center border border-slate-800 mb-1.5 text-xs font-mono font-bold text-slate-400">
                    P. {idx + 1}
                  </div>
                  <span className="text-[11px] font-semibold">Page {idx + 1}</span>
                </button>
              ))}
            </div>
          )}

          {/* Central PDF Canvas Display */}
          <div className="flex-1 overflow-auto p-4 sm:p-6 flex flex-col items-center justify-start min-h-0">
            {/* Loading State */}
            {loading && (
              <div className="m-auto flex flex-col items-center gap-3 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span>Loading PDF document via progressive byte stream...</span>
              </div>
            )}

            {/* Expired Access State */}
            {expiredAccess && (
              <div className="m-auto max-w-md p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <h4 className="font-heading font-bold text-sm text-white">Document Access Token Expired</h4>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Your short-lived authorization token has expired. Please refresh the page or re-request an authorized viewing session.
                </p>
                <button
                  type="button"
                  onClick={loadPdf}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Refresh Viewing Session
                </button>
              </div>
            )}

            {/* General Failed State */}
            {error && !expiredAccess && (
              <div className="m-auto max-w-md p-6 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-center space-y-3">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <h4 className="font-heading font-bold text-sm text-white">Unable to Display Document</h4>
                <p className="text-xs text-red-200/80 leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={loadPdf}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition-colors"
                >
                  Retry Loading
                </button>
              </div>
            )}

            {/* Active Rendered PDF Canvas */}
            {!loading && !error && !expiredAccess && (
              <div className="bg-white rounded-xl shadow-2xl p-2 my-auto border border-slate-700 flex justify-center">
                <canvas ref={canvasRef} className="max-w-full rounded" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { HelpCircle, Plus, Upload, CheckCircle2, AlertCircle, FileText, Globe, Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function AdminQuestionsPage() {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE' | 'IMPORT'>('LIST');
  const [langTab, setLangTab] = useState<'en' | 'hi' | 'bn'>('en');

  // Question List State
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [questionText, setQuestionText] = useState('Which Article of the Constitution of India provides for the Right to Constitutional Remedies?');
  const [optA, setOptA] = useState('Article 21');
  const [optB, setOptB] = useState('Article 32');
  const [optC, setOptC] = useState('Article 44');
  const [optD, setOptD] = useState('Article 300A');
  const [correctOpt, setCorrectOpt] = useState('opt_b');
  const [explanation, setExplanation] = useState('Article 32 allows citizens to approach the Supreme Court directly for the enforcement of fundamental rights.');
  const [difficulty, setDifficulty] = useState('MEDIUM');
  const [pyqYear, setPyqYear] = useState('2024');
  const [pyqExam, setPyqExam] = useState('SSC CGL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [importJson, setImportJson] = useState('');
  const [stagingReport, setStagingReport] = useState<any | null>(null);

  const fetchQuestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/questions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      console.warn('Error fetching questions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          topicId: 'general_awareness',
          difficulty,
          pyqYear: pyqYear ? parseInt(pyqYear, 10) : undefined,
          pyqExam,
          correctOptionId: correctOpt,
          text: questionText,
          explanation,
          options: [
            { id: 'opt_a', text: optA },
            { id: 'opt_b', text: optB },
            { id: 'opt_c', text: optC },
            { id: 'opt_d', text: optD },
          ],
        }),
      });

      if (res.ok) {
        await fetchQuestions();
        setActiveTab('LIST');
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Failed to save question: ${errData?.error?.message || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkImportStaging = async () => {
    try {
      let items: any[] = [];
      try {
        items = JSON.parse(importJson);
        if (!Array.isArray(items)) items = [items];
      } catch {
        alert('Invalid JSON format. Please provide a JSON array of question objects.');
        return;
      }

      const token = sessionStorage.getItem('sidprep_admin_token') || localStorage.getItem('sidprep_admin_token');
      const res = await fetch(`${API_BASE}/v1/admin/questions/import-staging`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        const data = await res.json();
        setStagingReport(data.report || {
          totalParsed: items.length,
          validRows: items.length,
          failedRows: 0,
          errors: [],
          status: 'STAGED_FOR_EDITORIAL_REVIEW',
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Import validation failed: ${errData?.error?.message || 'Server error'}`);
      }
    } catch (err: any) {
      alert(`Network error during staging: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-white">
            Question Bank Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            MCQ items, multilingual translations (EN, HI, BN), LaTeX formulas & bulk staging
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('IMPORT')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
              activeTab === 'IMPORT'
                ? 'bg-primary text-white border-primary'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Upload className="w-3.5 h-3.5" /> Bulk Import
          </button>
          <button
            onClick={() => setActiveTab('CREATE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'CREATE'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-primary/20 text-primary hover:bg-primary/30'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Add Question
          </button>
          {activeTab !== 'LIST' && (
            <button
              onClick={() => setActiveTab('LIST')}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-400 hover:text-white"
            >
              View List
            </button>
          )}
        </div>
      </div>

      {activeTab === 'CREATE' && (
        <form onSubmit={handleCreateSubmit} className="p-7 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h3 className="font-heading font-bold text-sm text-white">Multilingual Item Authoring</h3>
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setLangTab('en')}
                className={`px-2.5 py-1 rounded text-xs font-bold ${langTab === 'en' ? 'bg-primary text-white' : 'text-slate-400'}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLangTab('hi')}
                className={`px-2.5 py-1 rounded text-xs font-bold ${langTab === 'hi' ? 'bg-primary text-white' : 'text-slate-400'}`}
              >
                Hindi
              </button>
              <button
                type="button"
                onClick={() => setLangTab('bn')}
                className={`px-2.5 py-1 rounded text-xs font-bold ${langTab === 'bn' ? 'bg-primary text-white' : 'text-slate-400'}`}
              >
                Bengali
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Question Text (Supports LaTeX: $...$)</label>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Option A</label>
              <input
                type="text"
                value={optA}
                onChange={(e) => setOptA(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Option B</label>
              <input
                type="text"
                value={optB}
                onChange={(e) => setOptB(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Option C</label>
              <input
                type="text"
                value={optC}
                onChange={(e) => setOptC(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Option D</label>
              <input
                type="text"
                value={optD}
                onChange={(e) => setOptD(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Correct Option</label>
              <select
                value={correctOpt}
                onChange={(e) => setCorrectOpt(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              >
                <option value="opt_a">Option A</option>
                <option value="opt_b">Option B (Correct)</option>
                <option value="opt_c">Option C</option>
                <option value="opt_d">Option D</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">PYQ Tag</label>
              <input
                type="text"
                value={`${pyqExam} ${pyqYear}`}
                onChange={(e) => setPyqExam(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">Detailed Solution & Explanation</label>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('LIST')}
              className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold shadow-md"
            >
              Save to Question Bank
            </button>
          </div>
        </form>
      )}

      {activeTab === 'IMPORT' && (
        <div className="p-7 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h3 className="font-heading font-bold text-sm text-white">Bulk Question Import with Staging</h3>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <strong>Mandatory Guardrail:</strong> Bulk imports are held in the staging queue with error reports. They are NEVER automatically published without explicit editorial signoff.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Paste CSV or JSON payload</label>
            <textarea
              rows={6}
              placeholder='[{"text": "Sample question", "correctOptionId": "opt_a", "options": [...]}]'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none"
            />
          </div>

          <button
            onClick={handleBulkImportStaging}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-600 text-white text-xs font-bold"
          >
            Run Import Staging Check
          </button>

          {stagingReport && (
            <div className="p-5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-3">
              <div className="font-heading font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Staging Validation Completed
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-slate-800 text-slate-300">
                  <div className="font-bold text-base text-white">{stagingReport.totalParsed}</div>
                  <div className="text-[10px]">Total Parsed</div>
                </div>
                <div className="p-2 rounded bg-slate-800 text-emerald-400">
                  <div className="font-bold text-base">{stagingReport.validRows}</div>
                  <div className="text-[10px]">Valid Rows</div>
                </div>
                <div className="p-2 rounded bg-slate-800 text-red-400">
                  <div className="font-bold text-base">{stagingReport.failedRows}</div>
                  <div className="text-[10px]">Failed Rows</div>
                </div>
              </div>
              {stagingReport.errors.length > 0 && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
                  {stagingReport.errors.map((err: string, idx: number) => (
                    <div key={idx}>{err}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'LIST' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs">Loading questions...</div>
          ) : questions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">No questions found in question bank.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3.5 px-5">ID</th>
                  <th className="py-3.5 px-5">Question Preview</th>
                  <th className="py-3.5 px-5">Difficulty</th>
                  <th className="py-3.5 px-5">PYQ Source</th>
                  <th className="py-3.5 px-5">Languages</th>
                  <th className="py-3.5 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {questions.map((q) => {
                  const correctOpt = q.options?.find((o: any) => o.id === q.correctOptionId);
                  const langs = q.translations ? Object.keys(q.translations).map((k: string) => k.toUpperCase()) : ['EN'];
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/30">
                      <td className="py-4 px-5 font-mono text-slate-400">{q.id}</td>
                      <td className="py-4 px-5 max-w-md">
                        <div className="font-semibold text-white truncate">
                          {q.text || (q.translations?.en?.text ?? 'Question')}
                        </div>
                        {correctOpt && (
                          <div className="text-[11px] text-slate-500">Correct: {correctOpt.text}</div>
                        )}
                      </td>
                      <td className="py-4 px-5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            q.difficulty === 'HARD'
                              ? 'bg-red-500/20 text-red-300'
                              : q.difficulty === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {q.difficulty || 'MEDIUM'}
                        </span>
                      </td>
                      <td className="py-4 px-5 font-mono text-[11px]">
                        {q.pyqExam ? `${q.pyqExam} ${q.pyqYear || ''}` : 'General'}
                      </td>
                      <td className="py-4 px-5">
                        {langs.map((l: string) => (
                          <span key={l} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 mr-1">
                            {l}
                          </span>
                        ))}
                      </td>
                      <td className="py-4 px-5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            q.status === 'PUBLISHED'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {q.status || 'DRAFT'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

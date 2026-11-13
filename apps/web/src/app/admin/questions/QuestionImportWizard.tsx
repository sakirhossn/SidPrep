'use client';

import { useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Copy,
  ArrowRight,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Layers,
  Sparkles,
  Info,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';

interface DetectedCategory {
  name: string;
  count: number;
  suggestedTopicId: string;
}

interface InspectionResult {
  format: 'CSV' | 'JSON';
  totalRows: number;
  acceptedCount: number;
  duplicateCount: number;
  reviewNeededCount: number;
  rejectedCount: number;
  examBasedCount: number;
  detectedCategories: DetectedCategory[];
  samplePreview: {
    rowIndex: number;
    externalSourceId?: string;
    questionText: string;
    category: string;
    difficulty: string;
    correctLetter: string;
    optionsCount: number;
    status: string;
    reason?: string;
  }[];
}

interface QuestionImportWizardProps {
  onImportComplete?: () => void;
}

export function QuestionImportWizard({ onImportComplete }: QuestionImportWizardProps) {
  // Wizard Steps: 1: UPLOAD, 2: DETECT, 3: MAP_FIELDS, 4: VALIDATE, 5: PREVIEW, 6: CONFIRM, 7: REPORT
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);

  // Input Mode: FILE or PASTE
  const [inputMode, setInputMode] = useState<'FILE' | 'PASTE'>('FILE');
  const [fileName, setFileName] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapping & Defaults Configuration
  const [defaultMarks, setDefaultMarks] = useState<number>(1.0);
  const [defaultNegativeMarks, setDefaultNegativeMarks] = useState<number>(0.25);
  const [examBasedMapping, setExamBasedMapping] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [updateExisting, setUpdateExisting] = useState<boolean>(false);

  // Results
  const [inspectionResult, setInspectionResult] = useState<InspectionResult | null>(null);
  const [finalReport, setFinalReport] = useState<any | null>(null);

  const getAdminToken = () => {
    if (typeof window === 'undefined') return '';
    return (
      sessionStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('sidprep_admin_token') ||
      localStorage.getItem('admin_token') ||
      ''
    );
  };

  // Step 1: File selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      // Auto-advance to Step 2
      setCurrentStep(2);
    };
    reader.onerror = () => {
      setError('Failed to read file from disk.');
    };
    reader.readAsText(file);
  };

  // Step 2 -> 3: Inspect content & pre-populate category mappings
  const handleInspect = async () => {
    if (!fileContent.trim()) {
      setError('Please provide file content or paste JSON before proceeding.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/questions/imports/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileContent,
          examBasedMapping,
          defaultMarks,
          defaultNegativeMarks,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Inspection failed.');
      }

      setInspectionResult(data);

      // Populate default category mappings
      const initialMap: Record<string, string> = {};
      if (Array.isArray(data.detectedCategories)) {
        for (const cat of data.detectedCategories) {
          initialMap[cat.name] = cat.suggestedTopicId;
        }
      }
      setCategoryMappings(initialMap);

      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3 -> 4: Re-inspect with user configured mappings
  const handleApplyMappingsAndValidate = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/questions/imports/inspect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileContent,
          examBasedMapping,
          defaultMarks,
          defaultNegativeMarks,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Validation failed.');

      setInspectionResult(data);
      setCurrentStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 6 -> 7: Commit import batch
  const handleCommitImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = getApiBaseUrl();
      const token = getAdminToken();
      const res = await fetch(`${base}/v1/admin/questions/imports/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileContent,
          filename: fileName || `questions_export_${Date.now()}.${inspectionResult?.format.toLowerCase()}`,
          format: inspectionResult?.format,
          examBasedMapping,
          defaultMarks,
          defaultNegativeMarks,
          categoryMappings,
          updateExisting,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to commit import batch.');

      setFinalReport(data);
      setCurrentStep(7);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const stepsList = [
    '1. Upload',
    '2. Detect',
    '3. Map Fields',
    '4. Validate',
    '5. Preview',
    '6. Confirm',
    '7. Report',
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-6">
      {/* Wizard Step Progress Bar */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="font-heading font-extrabold text-base">
              Question Import Wizard (CSV &amp; JSON)
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-400">
            Step {currentStep} of 7
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {stepsList.map((step, idx) => {
            const stepNum = idx + 1;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;

            return (
              <div
                key={step}
                className={`py-1.5 px-2 text-center rounded-lg text-[10px] font-bold truncate transition-all ${
                  isCurrent
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {step}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="underline text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* ================= STEP 1: UPLOAD ================= */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
            <button
              onClick={() => setInputMode('FILE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                inputMode === 'FILE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Upload CSV / JSON File
            </button>
            <button
              onClick={() => setInputMode('PASTE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                inputMode === 'PASTE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Paste JSON Content
            </button>
          </div>

          {inputMode === 'FILE' ? (
            <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-8 text-center transition-all bg-slate-950/40">
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="font-heading font-bold text-sm text-slate-200">
                Choose question export file (.csv or .json)
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Supports RFC-4180 CSV with embedded newlines &amp; UTF-8 BOM, as well as canonical question export JSON.
              </p>

              <label className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-all shadow-md">
                <span>Browse Local File</span>
                <input
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {fileName && (
                <div className="mt-3 font-mono text-xs text-emerald-400">
                  Selected: {fileName}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Paste Raw JSON Questions Array:
              </label>
              <textarea
                rows={10}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                placeholder='[ { "id": "...", "questionText": "...", "options": [...] } ]'
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (!fileContent.trim()) {
                    setError('Please paste valid JSON questions array.');
                    return;
                  }
                  setFileName('pasted_questions.json');
                  setCurrentStep(2);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
              >
                Proceed to Detection
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: DETECT FORMAT ================= */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">File Name:</span>
              <span className="font-mono text-xs text-indigo-300 font-bold">{fileName || 'export_file'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Content Size:</span>
              <span className="font-mono text-xs text-slate-200">{(fileContent.length / 1024).toFixed(1)} KB</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Detected Signature:</span>
              <span className="font-mono text-xs text-emerald-400 font-bold uppercase">
                {fileContent.trim().startsWith('[') || fileContent.trim().startsWith('{')
                  ? 'Canonical JSON Format'
                  : 'RFC-4180 CSV Format'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Click <strong>Inspect &amp; Analyze</strong> to parse all records, cross-check answer letters against options, extract categories, and check database deduplication keys.
          </p>

          <div className="flex justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <button
              type="button"
              onClick={handleInspect}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Inspect &amp; Analyze
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 3: MAP FIELDS & SETTINGS ================= */}
      {currentStep === 3 && inspectionResult && (
        <div className="space-y-5">
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>
              Parsed {inspectionResult.totalRows} records in {inspectionResult.format} format. Configure scoring defaults and taxonomy mappings below.
            </span>
          </div>

          {/* Scoring Defaults Card */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="font-heading font-bold text-xs uppercase text-slate-300">
              Scoring Defaults (Applied to CSV exports lacking marks)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Default Marks (+ve)
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={defaultMarks}
                  onChange={(e) => setDefaultMarks(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Default Negative Marks (-ve)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={defaultNegativeMarks}
                  onChange={(e) => setDefaultNegativeMarks(parseFloat(e.target.value) || 0.25)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Note: The source CSV lacks marks columns. These values will be explicitly flagged as import defaults.
            </p>
          </div>

          {/* Exam-Based Records Mapping Decision */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-xs uppercase text-slate-300">
                &apos;exam_based&apos; Difficulty Mapping Decision ({inspectionResult.examBasedCount} record{inspectionResult.examBasedCount === 1 ? '' : 's'})
              </h3>
              <span className="font-mono text-[10px] text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-500/10">
                Requires Explicit Decision
              </span>
            </div>
            <p className="text-xs text-slate-400">
              The source contains {inspectionResult.examBasedCount} questions marked as &apos;exam_based&apos;. Select the normalized target difficulty:
            </p>
            <select
              value={examBasedMapping}
              onChange={(e) => setExamBasedMapping(e.target.value as any)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              <option value="MEDIUM">MEDIUM — Standard Competitive Exam Benchmark (Recommended)</option>
              <option value="HARD">HARD — Advanced Stage/Tier-2 Benchmark</option>
              <option value="EASY">EASY — Fundamental / Prelims Screening</option>
            </select>
          </div>

          {/* Category to Taxonomy Mapping */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="font-heading font-bold text-xs uppercase text-slate-300">
              Category-to-Taxonomy Mapping ({inspectionResult.detectedCategories.length} distinct categories)
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-slate-800/40">
              {inspectionResult.detectedCategories.map((cat) => (
                <div key={cat.name} className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-slate-200 block truncate">{cat.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{cat.count} question{cat.count === 1 ? '' : 's'}</span>
                  </div>
                  <select
                    value={categoryMappings[cat.name] || cat.suggestedTopicId}
                    onChange={(e) =>
                      setCategoryMappings({ ...categoryMappings, [cat.name]: e.target.value })
                    }
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none sm:w-64"
                  >
                    <option value="topic_quantitative">Quantitative Aptitude</option>
                    <option value="topic_reasoning">Reasoning &amp; Mental Ability</option>
                    <option value="topic_english">English Language</option>
                    <option value="topic_general_awareness">General Awareness</option>
                    <option value="topic_general_science">General Science</option>
                    <option value="topic_history">History (Indian &amp; World)</option>
                    <option value="topic_wb_gk">West Bengal History &amp; GK</option>
                    <option value="topic_geography">Geography</option>
                    <option value="topic_polity">Indian Polity &amp; Constitution</option>
                    <option value="topic_nursing">Nursing &amp; Health Sciences</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Deduplication & Update Setting */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-xs text-slate-200 block">Update Existing Questions</span>
              <span className="text-[11px] text-slate-400">
                Default is false (duplicate IDs or content fingerprints will be skipped).
              </span>
            </div>
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-0"
            />
          </div>

          <div className="flex justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <button
              type="button"
              onClick={handleApplyMappingsAndValidate}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              Validate &amp; Inspect
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 4: VALIDATION SUMMARY ================= */}
      {currentStep === 4 && inspectionResult && (
        <div className="space-y-4">
          <h3 className="font-heading font-bold text-sm text-slate-200">
            Pre-Import Validation Telemetry
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Total Rows</span>
              <span className="font-heading font-extrabold text-xl text-white">{inspectionResult.totalRows}</span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-400 uppercase block font-semibold">Accepted (New)</span>
              <span className="font-heading font-extrabold text-xl text-emerald-300">{inspectionResult.acceptedCount}</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] text-amber-400 uppercase block font-semibold">Duplicates (Skip)</span>
              <span className="font-heading font-extrabold text-xl text-amber-300">{inspectionResult.duplicateCount}</span>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] text-rose-400 uppercase block font-semibold">Rejected / Errors</span>
              <span className="font-heading font-extrabold text-xl text-rose-300">{inspectionResult.rejectedCount}</span>
            </div>
          </div>

          {inspectionResult.reviewNeededCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {inspectionResult.reviewNeededCount} question(s) flagged for editorial review (e.g. answer text disagreement or difficulty mapping notes).
              </span>
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Mappings
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5"
            >
              View Sample Preview <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 5: SAMPLE PREVIEW ================= */}
      {currentStep === 5 && inspectionResult && (
        <div className="space-y-4">
          <h3 className="font-heading font-bold text-sm text-slate-200">
            Sample Preview (First 10 Parsed Questions)
          </h3>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Question Text</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Difficulty</th>
                  <th className="py-2.5 px-3">Correct</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {inspectionResult.samplePreview.map((item) => (
                  <tr key={item.rowIndex} className="hover:bg-slate-900/40">
                    <td className="py-2 px-3 font-mono text-slate-500">{item.rowIndex}</td>
                    <td className="py-2 px-3 max-w-xs truncate text-slate-200">{item.questionText}</td>
                    <td className="py-2 px-3 text-slate-400">{item.category}</td>
                    <td className="py-2 px-3 font-mono text-[10px]">{item.difficulty}</td>
                    <td className="py-2 px-3 font-bold text-emerald-400">({item.correctLetter})</td>
                    <td className="py-2 px-3">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          item.status === 'ACCEPTED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : item.status === 'DUPLICATE'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Validation
            </button>

            <button
              type="button"
              onClick={() => setCurrentStep(6)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5"
            >
              Proceed to Confirmation <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 6: CONFIRM ================= */}
      {currentStep === 6 && inspectionResult && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="font-heading font-extrabold text-base text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              Confirm Import Batch Execution
            </h3>

            <p className="text-xs text-slate-300">
              Ready to commit <strong>{inspectionResult.totalRows}</strong> records ({inspectionResult.acceptedCount} new accepted questions, {inspectionResult.duplicateCount} duplicates skipped).
            </p>

            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 space-y-1">
              <p className="font-bold">Editorial Integrity Invariant:</p>
              <p>
                All accepted questions will be persisted as <strong>DRAFT</strong> in PostgreSQL for rigorous academic review. No questions are automatically published without editorial approval.
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setCurrentStep(5)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Preview
            </button>

            <button
              type="button"
              onClick={handleCommitImport}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Commit Import Batch to Database
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 7: FINAL REPORT ================= */}
      {currentStep === 7 && finalReport && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
            <div className="flex items-center gap-2 font-heading font-extrabold text-base text-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Question Import Batch Successfully Committed
            </div>
            <p className="text-xs text-slate-300">
              Batch ID: <strong className="font-mono text-white">{finalReport.batchId}</strong>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase block font-semibold">Total Processed</span>
              <span className="font-heading font-extrabold text-xl text-white">{finalReport.totalRows}</span>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <span className="text-[10px] text-emerald-400 uppercase block font-semibold">Saved as DRAFT</span>
              <span className="font-heading font-extrabold text-xl text-emerald-300">{finalReport.acceptedCount}</span>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span className="text-[10px] text-amber-400 uppercase block font-semibold">Duplicates Skipped</span>
              <span className="font-heading font-extrabold text-xl text-amber-300">{finalReport.duplicateCount}</span>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <span className="text-[10px] text-rose-400 uppercase block font-semibold">Rejected / Errors</span>
              <span className="font-heading font-extrabold text-xl text-rose-300">{finalReport.rejectedCount}</span>
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                setCurrentStep(1);
                setInspectionResult(null);
                setFinalReport(null);
                setFileContent('');
                setFileName('');
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white"
            >
              Start New Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

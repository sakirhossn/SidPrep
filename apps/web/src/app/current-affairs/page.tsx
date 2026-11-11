'use client';

import { useState, useEffect, useTransition } from 'react';
import Link from 'next/link';
import {
  Newspaper,
  ExternalLink,
  Calendar,
  Tag,
  ShieldCheck,
  HelpCircle,
  CheckCircle2,
  XCircle,
  BookOpen,
  Award,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  Filter,
  Check,
  AlertCircle,
} from 'lucide-react';
import { PublicShell } from '@/components/public-shell';
import { apiFetch } from '@/lib/api-client';

interface PracticeMcq {
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation: string;
}

interface CurrentAffairsArticle {
  id: string;
  headline: string;
  title?: string;
  summary: string;
  originalSummary?: string;
  category: string;
  targetExams: string[];
  keyFacts: string[];
  staticGkBackground?: string;
  practiceMcqs?: PracticeMcq[];
  sourceName: string;
  sourceUrl: string;
  eventDate?: string;
  publishedAt?: string;
}

interface QuizQuestion {
  id: string;
  articleId: string;
  questionNumber: number;
  questionText: string;
  options: { id: string; text: string }[];
  headlineReference?: string;
  category?: string;
}

interface QuizSubmitResult {
  score: number;
  totalQuestions: number;
  percentage: number;
  passed: boolean;
  answersReview: {
    questionId: string;
    questionText: string;
    userOptionId: string | null;
    correctOptionId: string;
    isCorrect: boolean;
    explanation: string;
    keyFact?: string;
  }[];
}

const SEED_ARTICLES: CurrentAffairsArticle[] = [
  {
    id: 'ca_seed_1',
    headline: 'PM-Surya Ghar: Muft Bijli Yojana Crosses 1.5 Crore Consumer Registrations',
    summary:
      'The Ministry of New and Renewable Energy reported massive nationwide adoption of the rooftop solar program, providing up to 300 units of free electricity per month for residential households.',
    category: 'Government Schemes',
    targetExams: ['SSC', 'RRB', 'WBPSC', 'IBPS'],
    keyFacts: [
      'National Outlay: ₹75,021 crore sanctioned capital allocation.',
      'Direct central subsidy up to 60% of solar unit cost for installations up to 2kW.',
      'Implementation portal: National Net-Metering Integration Portal.',
      'Target: Powering 1 crore households with rooftop solar infrastructure.',
    ],
    staticGkBackground:
      'Ministry of New and Renewable Energy (MNRE); Headquarters: New Delhi. India targets 500 GW non-fossil fuel capacity by 2030 in line with COP26 Panchamrit commitments.',
    practiceMcqs: [
      {
        question:
          'Under the PM-Surya Ghar: Muft Bijli Yojana, what is the maximum monthly free electricity units provided to eligible households?',
        options: [
          { id: 'opt_a', text: '150 units' },
          { id: 'opt_b', text: '200 units' },
          { id: 'opt_c', text: '300 units' },
          { id: 'opt_d', text: '500 units' },
        ],
        correctOptionId: 'opt_c',
        explanation:
          'The scheme provides up to 300 units of free electricity per month to 1 crore households with a sanctioned outlay of ₹75,021 crore.',
      },
    ],
    sourceName: 'Press Information Bureau (PIB)',
    sourceUrl: 'https://pib.gov.in',
    eventDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'ca_seed_2',
    headline: 'Reserve Bank of India Monetary Policy Committee Retains Repo Rate at 6.50%',
    summary:
      'The Monetary Policy Committee (MPC) of the Reserve Bank of India kept the policy repo rate unchanged at 6.50% to anchor consumer price inflation towards the 4% statutory target.',
    category: 'Economy & Banking',
    targetExams: ['IBPS', 'SSC', 'RRB'],
    keyFacts: [
      'Policy Repo Rate held steady at 6.50%.',
      'Standing Deposit Facility (SDF) rate pegged at 6.25%.',
      'Marginal Standing Facility (MSF) rate at 6.75%.',
      'Formulated under Section 45ZB of the Reserve Bank of India Act, 1934.',
    ],
    staticGkBackground:
      'RBI was established on April 1, 1935, under the RBI Act 1934 following the Hilton Young Commission recommendations. Nationalized on January 1, 1949.',
    practiceMcqs: [
      {
        question:
          'The Monetary Policy Committee (MPC) of the RBI operates under which section of the Reserve Bank of India Act, 1934?',
        options: [
          { id: 'opt_a', text: 'Section 22' },
          { id: 'opt_b', text: 'Section 45ZB' },
          { id: 'opt_c', text: 'Section 35A' },
          { id: 'opt_d', text: 'Section 17' },
        ],
        correctOptionId: 'opt_b',
        explanation:
          'The 6-member Monetary Policy Committee is constituted by the Central Government under Section 45ZB of the RBI Act, 1934.',
      },
    ],
    sourceName: 'Reserve Bank of India Official Bulletin',
    sourceUrl: 'https://rbi.org.in',
    eventDate: new Date().toISOString().split('T')[0],
  },
  {
    id: 'ca_seed_3',
    headline: 'Eastern Railway Achieves 100% Electrification Across All Broad Gauge Routes',
    summary:
      'Indian Railways announced the complete electrification of all broad-gauge railway tracks across the Eastern Railway zone, supporting Mission 100% Net Zero Carbon Emission by 2030.',
    category: 'Science & Technology',
    targetExams: ['RRB', 'SSC', 'WBPSC'],
    keyFacts: [
      'Zones electrified: Eastern Railway encompassing Howrah, Sealdah, Asansol, and Malda divisions.',
      'Cuts estimated annual carbon dioxide emissions by over 2.4 lakh tonnes.',
      'Enables uninterrupted electric locomotive haulage for Freight and Vande Bharat expresses.',
    ],
    staticGkBackground:
      'Eastern Railway is headquartered at Fairlie Place, Kolkata. The first passenger train in Eastern India ran on August 15, 1854 between Howrah and Hooghly (37 km).',
    practiceMcqs: [
      {
        question: 'Where is the operational headquarters of the Eastern Railway zone located?',
        options: [
          { id: 'opt_a', text: 'Gorakhpur' },
          { id: 'opt_b', text: 'Hajipur' },
          { id: 'opt_c', text: 'Kolkata (Fairlie Place)' },
          { id: 'opt_d', text: 'Bhubaneswar' },
        ],
        correctOptionId: 'opt_c',
        explanation:
          'The Eastern Railway zone is headquartered in Kolkata, West Bengal at Fairlie Place.',
      },
    ],
    sourceName: 'Press Information Bureau (PIB Railways)',
    sourceUrl: 'https://pib.gov.in',
    eventDate: new Date().toISOString().split('T')[0],
  },
];

const EXAM_OPTIONS = ['ALL', 'SSC', 'RRB', 'WBPSC', 'IBPS'];
const CATEGORY_OPTIONS = [
  'All Categories',
  'Government Schemes',
  'Economy & Banking',
  'Science & Technology',
  'Defence Exercises',
  'Appointments',
  'Awards & Honours',
  'Sports Winners',
  'International Summits',
  'Reports & Indices',
  'Environment & Ecology',
  'State Affairs (WBPSC)',
];

export default function CurrentAffairsPublicPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'quiz' | 'monthly'>('daily');
  const [selectedExam, setSelectedExam] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Daily articles state
  const [articles, setArticles] = useState<CurrentAffairsArticle[]>(SEED_ARTICLES);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [expandedMcqs, setExpandedMcqs] = useState<Record<string, boolean>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [selectedOptionByArticle, setSelectedOptionByArticle] = useState<Record<string, string>>({});

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<QuizSubmitResult | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  // Monthly state
  const [monthlyDigest, setMonthlyDigest] = useState<Record<string, CurrentAffairsArticle[]>>({});
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Load Daily Articles
  useEffect(() => {
    if (activeTab === 'daily') {
      let isMounted = true;
      setLoadingArticles(true);

      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedExam !== 'ALL') params.append('exam', selectedExam);

      apiFetch<{ success: boolean; articles: CurrentAffairsArticle[] }>(
        `/v1/current-affairs/daily?${params.toString()}`
      )
        .then((res) => {
          if (isMounted) {
            if (res && res.articles && res.articles.length > 0) {
              setArticles(res.articles);
            } else {
              // Fallback to seed articles filtered by exam if empty
              const filteredSeed = SEED_ARTICLES.filter((a) =>
                selectedExam === 'ALL'
                  ? true
                  : a.targetExams.some((e) => e.toUpperCase().includes(selectedExam))
              );
              setArticles(filteredSeed.length > 0 ? filteredSeed : SEED_ARTICLES);
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            const filteredSeed = SEED_ARTICLES.filter((a) =>
              selectedExam === 'ALL'
                ? true
                : a.targetExams.some((e) => e.toUpperCase().includes(selectedExam))
            );
            setArticles(filteredSeed.length > 0 ? filteredSeed : SEED_ARTICLES);
          }
        })
        .finally(() => {
          if (isMounted) setLoadingArticles(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, selectedDate, selectedExam]);

  // Load Quiz Questions
  useEffect(() => {
    if (activeTab === 'quiz') {
      let isMounted = true;
      setLoadingQuiz(true);
      setQuizResult(null);
      setQuizAnswers({});

      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (selectedExam !== 'ALL') params.append('exam', selectedExam);

      apiFetch<{ success: boolean; questions: QuizQuestion[] }>(
        `/v1/current-affairs/daily-quiz?${params.toString()}`
      )
        .then((res) => {
          if (isMounted) {
            if (res && res.questions && res.questions.length > 0) {
              setQuizQuestions(res.questions);
            } else {
              // Generate from seed articles
              const seedQuestions: QuizQuestion[] = [];
              let qNum = 1;
              SEED_ARTICLES.forEach((art) => {
                if (art.practiceMcqs) {
                  art.practiceMcqs.forEach((mcq) => {
                    seedQuestions.push({
                      id: `q_${art.id}_${qNum}`,
                      articleId: art.id,
                      questionNumber: qNum,
                      questionText: mcq.question,
                      options: mcq.options,
                      headlineReference: art.headline,
                      category: art.category,
                    });
                    qNum++;
                  });
                }
              });
              setQuizQuestions(seedQuestions);
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            const seedQuestions: QuizQuestion[] = [];
            let qNum = 1;
            SEED_ARTICLES.forEach((art) => {
              if (art.practiceMcqs) {
                art.practiceMcqs.forEach((mcq) => {
                  seedQuestions.push({
                    id: `q_${art.id}_${qNum}`,
                    articleId: art.id,
                    questionNumber: qNum,
                    questionText: mcq.question,
                    options: mcq.options,
                    headlineReference: art.headline,
                    category: art.category,
                  });
                  qNum++;
                });
              }
            });
            setQuizQuestions(seedQuestions);
          }
        })
        .finally(() => {
          if (isMounted) setLoadingQuiz(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, selectedDate, selectedExam]);

  // Load Monthly Revision
  useEffect(() => {
    if (activeTab === 'monthly') {
      let isMounted = true;
      setLoadingMonthly(true);

      const [year, month] = selectedMonth.split('-');
      const params = new URLSearchParams();
      if (year) params.append('year', year);
      if (month) params.append('month', month);
      if (selectedExam !== 'ALL') params.append('exam', selectedExam);

      apiFetch<{ success: boolean; categorizedDigest: Record<string, CurrentAffairsArticle[]> }>(
        `/v1/current-affairs/monthly?${params.toString()}`
      )
        .then((res) => {
          if (isMounted) {
            if (res && res.categorizedDigest && Object.keys(res.categorizedDigest).length > 0) {
              setMonthlyDigest(res.categorizedDigest);
            } else {
              // Group seed articles
              const grouped: Record<string, CurrentAffairsArticle[]> = {};
              SEED_ARTICLES.forEach((art) => {
                if (!grouped[art.category]) grouped[art.category] = [];
                grouped[art.category].push(art);
              });
              setMonthlyDigest(grouped);
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            const grouped: Record<string, CurrentAffairsArticle[]> = {};
            SEED_ARTICLES.forEach((art) => {
              if (!grouped[art.category]) grouped[art.category] = [];
              grouped[art.category].push(art);
            });
            setMonthlyDigest(grouped);
          }
        })
        .finally(() => {
          if (isMounted) setLoadingMonthly(false);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [activeTab, selectedMonth, selectedExam]);

  // Quiz submission handler
  const handleQuizSubmit = async () => {
    setSubmittingQuiz(true);
    try {
      const res = await apiFetch<QuizSubmitResult>(
        '/v1/current-affairs/daily-quiz/submit',
        {
          method: 'POST',
          body: JSON.stringify({
            quizId: `quiz_${selectedDate}`,
            answers: quizAnswers,
          }),
        }
      );
      if (res && res.answersReview) {
        setQuizResult(res);
      } else {
        // Fallback local evaluation against seed
        evaluateQuizLocally();
      }
    } catch {
      evaluateQuizLocally();
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const evaluateQuizLocally = () => {
    let score = 0;
    const review: QuizSubmitResult['answersReview'] = [];

    quizQuestions.forEach((q) => {
      const selected = quizAnswers[q.id];
      const seedArt = SEED_ARTICLES.find((a) => a.id === q.articleId);
      const mcq = seedArt?.practiceMcqs?.[0];
      const correct = mcq?.correctOptionId || 'opt_a';
      const isCorrect = selected === correct;
      if (isCorrect) score++;

      review.push({
        questionId: q.id,
        questionText: q.questionText,
        userOptionId: selected || null,
        correctOptionId: correct,
        isCorrect,
        explanation: mcq?.explanation || 'Authoritative fact verified from official press release.',
        keyFact: seedArt?.keyFacts?.[0],
      });
    });

    const total = quizQuestions.length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    setQuizResult({
      score,
      totalQuestions: total,
      percentage,
      passed: percentage >= 50,
      answersReview: review,
    });
  };

  const filteredArticles = articles.filter((art) => {
    if (selectedCategory !== 'All Categories' && art.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <PublicShell>
      <div className="py-8 md:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Hero */}
        <div className="max-w-4xl mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold mb-4 border border-emerald-200">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>PIB, RBI, ISRO, Defence & Official Feeds • Verified Editorial Standards</span>
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-5xl text-slate-900 tracking-tight mb-4">
            Competitive Exam Current Affairs & Daily Quiz
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            Strictly tailored for <strong>SSC, RRB, WBPSC, and IBPS</strong> exams. No political controversies, clickbait, or gossip.
            Every item includes factual explanation, key pointers, static GK foundation, and a verified practice MCQ.
          </p>
        </div>

        {/* Global Controls & Exam Selector */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Target Exam Pills */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Target Exam
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXAM_OPTIONS.map((exam) => (
                  <button
                    key={exam}
                    onClick={() => setSelectedExam(exam)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedExam === exam
                        ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    {exam === 'ALL' ? 'All Exams' : exam}
                  </button>
                ))}
              </div>
            </div>

            {/* Date / Month Picker */}
            <div className="flex items-center gap-3">
              {activeTab === 'monthly' ? (
                <div>
                  <label htmlFor="month-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Select Month
                  </label>
                  <input
                    id="month-select"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="date-select" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                    Select Date
                  </label>
                  <input
                    id="date-select"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 mt-6 pt-2">
            <button
              onClick={() => setActiveTab('daily')}
              className={`pb-3 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'daily'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Newspaper className="w-4 h-4" />
              <span>Daily Current Affairs</span>
              <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-600 font-semibold">
                {filteredArticles.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('quiz')}
              className={`pb-3 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'quiz'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>Daily Practice Quiz</span>
              {quizQuestions.length > 0 && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-semibold">
                  {quizQuestions.length} Qs
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`pb-3 px-4 font-bold text-sm border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'monthly'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Monthly Revision Digest</span>
            </button>
          </div>
        </div>

        {/* TAB 1: DAILY CURRENT AFFAIRS */}
        {activeTab === 'daily' && (
          <div>
            {/* Category Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-6 text-xs font-semibold scrollbar-none">
              {CATEGORY_OPTIONS.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {loadingArticles ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Loading verified current affairs...</p>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="font-bold text-slate-800 text-base">No articles found for the selected date and filters</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  SidPrep strictly publishes editorial-verified, high-yield items. Try choosing an earlier date or &apos;All Exams&apos;.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredArticles.map((art) => {
                  const mcq = art.practiceMcqs?.[0];
                  const isMcqExpanded = !!expandedMcqs[art.id];
                  const isAnswerRevealed = !!revealedAnswers[art.id];
                  const selectedOpt = selectedOptionByArticle[art.id];

                  return (
                    <article
                      key={art.id}
                      className="p-6 sm:p-8 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all"
                    >
                      {/* Top Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-primary/10 text-primary">
                            {art.category}
                          </span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {art.eventDate || art.publishedAt || selectedDate}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {art.targetExams.map((ex) => (
                            <span
                              key={ex}
                              className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80"
                            >
                              {ex}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Headline */}
                      <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 mb-3">
                        {art.headline || art.title}
                      </h2>

                      {/* Explanation */}
                      <p className="text-sm text-slate-700 leading-relaxed mb-5 font-normal">
                        {art.summary || art.originalSummary}
                      </p>

                      {/* Key Facts Pointers (3-5 items) */}
                      {art.keyFacts && art.keyFacts.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 mb-4">
                          <span className="text-xs font-bold text-slate-900 block mb-2 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-primary" />
                            Key Exam Pointers (High Yield):
                          </span>
                          <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                            {art.keyFacts.map((fact, fIdx) => (
                              <li key={fIdx} className="leading-relaxed">
                                {fact}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Static GK Background */}
                      {art.staticGkBackground && (
                        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 mb-5">
                          <span className="text-xs font-bold text-amber-900 block mb-1 flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                            Related Static GK Background:
                          </span>
                          <p className="text-xs text-amber-950 leading-relaxed">
                            {art.staticGkBackground}
                          </p>
                        </div>
                      )}

                      {/* Practice MCQ Toggle */}
                      {mcq && (
                        <div className="mt-4 border border-indigo-100 bg-indigo-50/40 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMcqs((prev) => ({ ...prev, [art.id]: !prev[art.id] }))
                            }
                            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-indigo-50/80 transition-colors"
                          >
                            <span className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                              <HelpCircle className="w-4 h-4 text-indigo-600" />
                              Practice Exam Question for this topic
                            </span>
                            {isMcqExpanded ? (
                              <ChevronUp className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-indigo-600" />
                            )}
                          </button>

                          {isMcqExpanded && (
                            <div className="p-4 pt-2 border-t border-indigo-100 space-y-3">
                              <p className="text-xs font-semibold text-slate-900">{mcq.question}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {mcq.options.map((opt) => {
                                  const isSelected = selectedOpt === opt.id;
                                  const isCorrect = opt.id === mcq.correctOptionId;
                                  let optionStyle =
                                    'border-slate-200 bg-white text-slate-700 hover:border-slate-300';
                                  if (isAnswerRevealed) {
                                    if (isCorrect) {
                                      optionStyle = 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold';
                                    } else if (isSelected && !isCorrect) {
                                      optionStyle = 'border-rose-400 bg-rose-50 text-rose-800';
                                    }
                                  } else if (isSelected) {
                                    optionStyle = 'border-indigo-600 bg-indigo-50 text-indigo-950 font-medium';
                                  }

                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedOptionByArticle((prev) => ({
                                          ...prev,
                                          [art.id]: opt.id,
                                        }));
                                      }}
                                      className={`p-2.5 rounded-lg border text-xs text-left transition-all flex items-center justify-between ${optionStyle}`}
                                    >
                                      <span>{opt.text}</span>
                                      {isAnswerRevealed && isCorrect && (
                                        <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              <div className="flex items-center justify-between pt-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRevealedAnswers((prev) => ({
                                      ...prev,
                                      [art.id]: !prev[art.id],
                                    }))
                                  }
                                  className="text-xs font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {isAnswerRevealed ? 'Hide Explanation' : 'Check Answer & Explanation'}
                                </button>
                              </div>

                              {isAnswerRevealed && (
                                <div className="p-3 bg-white rounded-lg border border-indigo-100 text-xs space-y-1">
                                  <div className="font-bold text-emerald-700">
                                    Correct Option:{' '}
                                    {mcq.options.find((o) => o.id === mcq.correctOptionId)?.text}
                                  </div>
                                  <p className="text-slate-600">{mcq.explanation}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Source & External Link Footer */}
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-4 mt-4 border-t border-slate-100">
                        <span className="flex items-center gap-1">
                          Source: <strong className="text-slate-700">{art.sourceName}</strong>
                        </span>
                        {art.sourceUrl && (
                          <a
                            href={art.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            Official Press Release <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DAILY QUIZ */}
        {activeTab === 'quiz' && (
          <div className="max-w-3xl mx-auto">
            {loadingQuiz ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Loading daily quiz...</p>
              </div>
            ) : quizQuestions.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="font-bold text-slate-800 text-base">No quiz questions generated for this date</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Questions are generated only from verified editorial current affairs articles.
                </p>
              </div>
            ) : quizResult ? (
              /* Quiz Results Card */
              <div className="space-y-6">
                <div className="p-6 sm:p-8 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 text-emerald-600">
                    <Award className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">
                    Quiz Performance Review
                  </h2>
                  <p className="text-xs text-slate-500 mb-6">
                    {selectedExam === 'ALL' ? 'General' : selectedExam} Current Affairs Challenge • {selectedDate}
                  </p>

                  <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6 text-center">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-2xl font-bold text-slate-900">{quizResult.score}</div>
                      <div className="text-[11px] font-semibold text-slate-500">Correct Answers</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className="text-2xl font-bold text-slate-900">{quizResult.totalQuestions}</div>
                      <div className="text-[11px] font-semibold text-slate-500">Total Questions</div>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <div className={`text-2xl font-bold ${quizResult.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {quizResult.percentage}%
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">Accuracy</div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setQuizResult(null);
                      setQuizAnswers({});
                    }}
                    className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-all shadow-sm"
                  >
                    Retake Quiz
                  </button>
                </div>

                {/* Question-by-question review */}
                <div className="space-y-4">
                  <h3 className="font-heading font-bold text-lg text-slate-900">
                    Detailed Explanations & Review
                  </h3>
                  {quizResult.answersReview.map((rev, idx) => (
                    <div
                      key={rev.questionId}
                      className="p-5 bg-white rounded-xl border border-slate-200 space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          Q{idx + 1}. {rev.questionText}
                        </span>
                        {rev.isCorrect ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Correct
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                            <XCircle className="w-3.5 h-3.5" /> Incorrect
                          </span>
                        )}
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 space-y-1">
                        <div className="text-slate-700">
                          <strong>Explanation:</strong> {rev.explanation}
                        </div>
                        {rev.keyFact && (
                          <div className="text-slate-600">
                            <strong>Key Point:</strong> {rev.keyFact}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Active Quiz Runner */
              <div className="space-y-6">
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                  <span>
                    Answer all {quizQuestions.length} questions derived from today&apos;s verified news items.
                  </span>
                  <span className="font-bold">
                    Target: {selectedExam === 'ALL' ? 'All Exams' : selectedExam}
                  </span>
                </div>

                {quizQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-6 bg-white rounded-2xl border border-slate-200/90 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">
                        Question {idx + 1} of {quizQuestions.length}
                      </span>
                      {q.category && (
                        <span className="text-[11px] font-semibold text-slate-400">
                          {q.category}
                        </span>
                      )}
                    </div>

                    <h3 className="font-heading font-bold text-base text-slate-900">
                      {q.questionText}
                    </h3>

                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const isSelected = quizAnswers[q.id] === opt.id;
                        return (
                          <label
                            key={opt.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                              isSelected
                                ? 'border-primary bg-primary/5 text-primary font-semibold'
                                : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              checked={isSelected}
                              onChange={() =>
                                setQuizAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                              }
                              className="text-primary focus:ring-primary h-4 w-4"
                            />
                            <span>{opt.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="text-center pt-2">
                  <button
                    onClick={handleQuizSubmit}
                    disabled={submittingQuiz || Object.keys(quizAnswers).length === 0}
                    className="px-8 py-3 bg-primary text-white rounded-xl text-sm font-bold shadow-md hover:bg-primary/95 disabled:opacity-50 transition-all inline-flex items-center gap-2"
                  >
                    {submittingQuiz ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Grading Submission...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Submit & Review Daily Quiz ({Object.keys(quizAnswers).length}/{quizQuestions.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: MONTHLY REVISION */}
        {activeTab === 'monthly' && (
          <div>
            <div className="mb-6 p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
              <span>
                Monthly revision digest categorized for rapid pre-exam review.
              </span>
              <span className="font-bold">Month: {selectedMonth}</span>
            </div>

            {loadingMonthly ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <RefreshCw className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Compiling monthly revision digest...</p>
              </div>
            ) : Object.keys(monthlyDigest).length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h3 className="font-bold text-slate-800 text-base">No monthly records found for {selectedMonth}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Try choosing a different month or target exam.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {Object.entries(monthlyDigest).map(([cat, catArticles]) => (
                  <div key={cat} className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary" />
                      <h3 className="font-heading font-bold text-lg text-slate-900">
                        {cat}
                      </h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {catArticles.length} items
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {catArticles.map((art) => (
                        <div
                          key={art.id}
                          className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3"
                        >
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span>{art.eventDate || selectedMonth}</span>
                            <div className="flex gap-1">
                              {art.targetExams.map((e) => (
                                <span key={e} className="font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {e}
                                </span>
                              ))}
                            </div>
                          </div>

                          <h4 className="font-heading font-bold text-sm text-slate-900 leading-snug">
                            {art.headline || art.title}
                          </h4>

                          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                            {art.summary || art.originalSummary}
                          </p>

                          {art.keyFacts && art.keyFacts.length > 0 && (
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-100 text-[11px] text-slate-700">
                              <span className="font-bold block mb-1">Key Pointer:</span>
                              <p>{art.keyFacts[0]}</p>
                            </div>
                          )}

                          {art.staticGkBackground && (
                            <div className="text-[11px] text-amber-900 bg-amber-50/60 p-2 rounded border border-amber-200/50">
                              <span className="font-bold">Static GK:</span> {art.staticGkBackground}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PublicShell>
  );
}

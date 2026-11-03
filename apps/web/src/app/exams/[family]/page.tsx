import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, ExternalLink, Calendar, Clock, Layers, ArrowLeft, BookOpen } from 'lucide-react';
import { PublicShell } from '@/components/public-shell';

interface ExamData {
  familyCode: string;
  name: string;
  authority: string;
  description: string;
  officialPortal: string;
  verifiedDate: string;
  stages: {
    name: string;
    stageNumber: number;
    duration: string;
    totalMarks: number;
    negativeMarking: string;
    sectionLock: boolean;
  }[];
  syllabus: {
    subject: string;
    weight: string;
    topics: string[];
  }[];
}

const EXAM_PROFILES: Record<string, ExamData> = {
  ssc: {
    familyCode: 'SSC',
    name: 'Staff Selection Commission (SSC CGL & CHSL)',
    authority: 'Staff Selection Commission, Government of India',
    description: 'National recruitment test for Group B and Group C officers in central ministries and departments.',
    officialPortal: 'https://ssc.gov.in',
    verifiedDate: '2026-09-15',
    stages: [
      {
        name: 'Tier-I Computer Based Examination',
        stageNumber: 1,
        duration: '60 minutes (80m for scribe eligible)',
        totalMarks: 200,
        negativeMarking: '0.50 marks per wrong answer',
        sectionLock: false,
      },
      {
        name: 'Tier-II Paper-I (Session I & II)',
        stageNumber: 2,
        duration: '2 hours 15 minutes',
        totalMarks: 390,
        negativeMarking: '1.00 mark per wrong answer',
        sectionLock: true,
      },
    ],
    syllabus: [
      {
        subject: 'General Intelligence and Reasoning',
        weight: '25% (50 marks)',
        topics: ['Analogies & Similarities', 'Venn Diagrams', 'Blood Relations', 'Syllogisms', 'Coding-Decoding', 'Non-verbal series'],
      },
      {
        subject: 'General Awareness',
        weight: '25% (50 marks)',
        topics: ['Indian Polity & Constitution', 'Ancient, Medieval & Modern History', 'Indian Economy', 'General Science', 'Daily Current Affairs'],
      },
      {
        subject: 'Quantitative Aptitude',
        weight: '25% (50 marks)',
        topics: ['Number Systems', 'Percentages & Ratio', 'Time & Work', 'Algebra & Linear Equations', 'Geometry & Trigonometry'],
      },
      {
        subject: 'English Comprehension',
        weight: '25% (50 marks)',
        topics: ['Spotting the Error', 'Fill in the Blanks', 'Synonyms & Antonyms', 'Idioms & Phrases', 'Reading Comprehension'],
      },
    ],
  },
  rrb: {
    familyCode: 'RRB',
    name: 'Railway Recruitment Boards (RRB NTPC & Group D)',
    authority: 'Ministry of Railways, Government of India',
    description: 'Central recruitment for Non-Technical Popular Categories (Station Master, Goods Train Manager, Junior Accounts Assistant).',
    officialPortal: 'https://indianrailways.gov.in',
    verifiedDate: '2026-08-20',
    stages: [
      {
        name: 'CBT-1 (1st Stage Screening)',
        stageNumber: 1,
        duration: '90 minutes (120m for PwBD)',
        totalMarks: 100,
        negativeMarking: '1/3rd (0.33) marks deducted per incorrect answer',
        sectionLock: false,
      },
      {
        name: 'CBT-2 (2nd Stage Merit Exam)',
        stageNumber: 2,
        duration: '90 minutes',
        totalMarks: 120,
        negativeMarking: '1/3rd (0.33) marks deducted per incorrect answer',
        sectionLock: false,
      },
    ],
    syllabus: [
      {
        subject: 'General Awareness & Science',
        weight: '40% (40 marks)',
        topics: ['Current Events of National & International Importance', 'Games & Sports', 'Art & Culture of India', 'General Science up to Class 10'],
      },
      {
        subject: 'Mathematics',
        weight: '30% (30 marks)',
        topics: ['Decimals & Fractions', 'LCM & HCF', 'Ratio & Proportions', 'Simple & Compound Interest', 'Mensuration & Elementary Statistics'],
      },
      {
        subject: 'General Intelligence and Reasoning',
        weight: '30% (30 marks)',
        topics: ['Analogies & Coding', 'Mathematical Operations', 'Relationships & Jumbling', 'Data Interpretation & Sufficiency'],
      },
    ],
  },
  wbpsc: {
    familyCode: 'WBPSC',
    name: 'West Bengal Public Service Commission (Clerkship & Misc)',
    authority: 'Public Service Commission, West Bengal',
    description: 'State government clerical cadre recruitment across directorates, regional offices, and state secretariat.',
    officialPortal: 'https://psc.wb.gov.in',
    verifiedDate: '2026-07-10',
    stages: [
      {
        name: 'Part-I Objective Multiple Choice',
        stageNumber: 1,
        duration: '1 hour 30 minutes',
        totalMarks: 100,
        negativeMarking: '0.25 marks deducted per wrong answer',
        sectionLock: false,
      },
      {
        name: 'Part-II Conventional Written (Descriptive)',
        stageNumber: 2,
        duration: '1 hour',
        totalMarks: 100,
        negativeMarking: 'N/A (Descriptive Evaluation)',
        sectionLock: true,
      },
    ],
    syllabus: [
      {
        subject: 'General Studies (with West Bengal Focus)',
        weight: '40% (40 marks)',
        topics: ['Indian History with special reference to Bengal', 'Geography of West Bengal', 'Indian Economy & Five Year Plans', 'Current Affairs'],
      },
      {
        subject: 'Arithmetic',
        weight: '30% (30 marks)',
        topics: ['Divisibility & Fractions', 'HCF & LCM', 'Partnership', 'Average, Ratio & Proportion', 'Time & Distance'],
      },
      {
        subject: 'English',
        weight: '30% (30 marks)',
        topics: ['Fundamentals of English Grammar', 'Vocabulary & Correct Usage', 'Sentence Structure', 'Synonyms & Antonyms'],
      },
    ],
  },
  ibps: {
    familyCode: 'IBPS',
    name: 'Institute of Banking Personnel Selection (CRP PO & Clerk)',
    authority: 'Institute of Banking Personnel Selection',
    description: 'Common recruitment process for Probationary Officers and Clerks across 11 participating public sector banks.',
    officialPortal: 'https://ibps.in',
    verifiedDate: '2026-08-01',
    stages: [
      {
        name: 'Preliminary Examination (Sectional Timed)',
        stageNumber: 1,
        duration: '60 minutes (Strict 20-minute sectional lock)',
        totalMarks: 100,
        negativeMarking: '0.25 marks deducted per wrong answer',
        sectionLock: true,
      },
      {
        name: 'Main Examination & Descriptive Test',
        stageNumber: 2,
        duration: '3 hours 30 minutes',
        totalMarks: 225,
        negativeMarking: '0.25 marks deducted per wrong answer',
        sectionLock: true,
      },
    ],
    syllabus: [
      {
        subject: 'Quantitative Aptitude',
        weight: '35% (35 questions)',
        topics: ['Data Interpretation (Tables, Bar, Radar, Caselets)', 'Quadratic Equations', 'Number Series', 'Arithmetic Word Problems'],
      },
      {
        subject: 'Reasoning Ability',
        weight: '35% (35 questions)',
        topics: ['Floor, Circular & Linear Puzzles', 'Syllogism (Only A Few)', 'Inequalities', 'Blood Relations & Direction Sense'],
      },
      {
        subject: 'English Language',
        weight: '30% (30 questions)',
        topics: ['Reading Comprehension', 'Cloze Test', 'Error Detection', 'Para Jumbles & Sentence Connectors'],
      },
    ],
  },
};

export function generateStaticParams() {
  return [
    { family: 'ssc' },
    { family: 'rrb' },
    { family: 'wbpsc' },
    { family: 'ibps' },
  ];
}

export default function ExamFamilyPage({ params }: { params: { family: string } }) {
  const code = params.family.toLowerCase();
  const data = EXAM_PROFILES[code];

  if (!data) {
    notFound();
  }

  return (
    <PublicShell>
      <div className="py-12 md:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Back button */}
      <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary mb-8">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to All Exams
      </Link>

      {/* Header */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-heading font-black text-3xl text-primary">{data.familyCode}</span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-accent-teal border border-emerald-200">
              Admin-Verified Scheme
            </span>
          </div>
          <a
            href={data.officialPortal}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-primary px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            Official Portal <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
        <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 mb-2">{data.name}</h1>
        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed mb-6">{data.description}</p>
        <div className="flex flex-wrap gap-4 text-xs text-slate-500 border-t border-slate-100 pt-4">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-primary" /> Last Pattern Verification: <strong>{data.verifiedDate}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-primary" /> Exam Authority: <strong>{data.authority}</strong>
          </span>
        </div>
      </div>

      {/* 2-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Stages */}
        <div className="space-y-6">
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Official Examination Stages
          </h2>
          {data.stages.map((stage) => (
            <div key={stage.stageNumber} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="font-heading font-bold text-base text-slate-900">{stage.name}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                  {stage.totalMarks} Marks
                </span>
              </div>
              <ul className="space-y-2 text-xs text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-teal" />
                  <strong>Duration:</strong> {stage.duration}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-teal" />
                  <strong>Negative Marking:</strong> {stage.negativeMarking}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-teal" />
                  <strong>Section Lock:</strong> {stage.sectionLock ? 'Strict sectional timer enforced' : 'Free section navigation'}
                </li>
              </ul>
            </div>
          ))}
        </div>

        {/* Syllabus Weightages */}
        <div className="space-y-6">
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Syllabus Topic Weightages
          </h2>
          {data.syllabus.map((syl, sIdx) => (
            <div key={sIdx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="font-heading font-bold text-sm text-slate-900">{syl.subject}</span>
                <span className="text-xs font-bold text-slate-500">{syl.weight}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {syl.topics.map((t, tIdx) => (
                  <span key={tIdx} className="text-[11px] px-2.5 py-1 rounded-md bg-canvas text-slate-700 border border-slate-200/80">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </PublicShell>
  );
}

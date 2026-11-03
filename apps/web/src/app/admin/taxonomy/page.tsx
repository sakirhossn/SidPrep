'use client';

import { useState } from 'react';
import { FolderTree, ChevronRight, Layers, Plus, BookOpen } from 'lucide-react';

export default function AdminTaxonomyPage() {
  const [taxonomy] = useState([
    {
      subject: 'Quantitative Aptitude',
      topics: [
        { name: 'Arithmetic', subtopics: ['Number System', 'Percentages', 'Profit & Loss', 'Ratio & Proportion', 'Time & Work'] },
        { name: 'Advanced Mathematics', subtopics: ['Algebraic Identities', 'Trigonometric Ratios', 'Geometry & Circles', 'Coordinate Geometry'] },
        { name: 'Data Interpretation', subtopics: ['Tabular Charts', 'Bar Graphs', 'Pie Charts', 'Radar Graphs'] },
      ],
    },
    {
      subject: 'General Intelligence and Reasoning',
      topics: [
        { name: 'Verbal Reasoning', subtopics: ['Analogies', 'Syllogism (Only A Few)', 'Blood Relations', 'Coding-Decoding', 'Inequalities'] },
        { name: 'Analytical & Puzzles', subtopics: ['Floor Puzzles', 'Linear Arrangement', 'Circular Seating', 'Direction Sense'] },
      ],
    },
    {
      subject: 'General Awareness',
      topics: [
        { name: 'Indian Polity & Constitution', subtopics: ['Fundamental Rights (Art 12-35)', 'Directive Principles', 'President & Governor', 'Constitutional Bodies'] },
        { name: 'Indian Economy & Banking', subtopics: ['RBI Monetary Policy', 'Fiscal Budget', 'Inflation Indices (CPI/WPI)', 'Government Welfare Schemes'] },
        { name: 'General Science', subtopics: ['Newtonian Physics', 'Periodic Table & Acids/Bases', 'Human Physiology & Nutrition'] },
      ],
    },
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-white">
          Shared Curriculum Taxonomy
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Subject &gt; Topic &gt; Subtopic structure mapped across all exams
        </p>
      </div>

      <div className="space-y-6">
        {taxonomy.map((subj, idx) => (
          <div key={idx} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm">
            <h2 className="font-heading font-bold text-base text-white mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              {subj.subject}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subj.topics.map((top, tIdx) => (
                <div key={tIdx} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                  <span className="font-heading font-bold text-xs text-slate-200 block mb-2">
                    {top.name}
                  </span>
                  <div className="space-y-1">
                    {top.subtopics.map((sub, sIdx) => (
                      <div key={sIdx} className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        <span>{sub}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

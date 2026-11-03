import Link from 'next/link';
import { BookOpen, Newspaper, FileText, Smartphone, Shield, ArrowRight } from 'lucide-react';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-heading font-extrabold text-xl shadow-sm">
            S
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-extrabold text-xl text-slate-900 tracking-tight leading-none">
              SidPrep<span className="text-primary font-bold text-sm ml-1 px-1.5 py-0.5 bg-primary/10 rounded">2.0</span>
            </span>
            <span className="text-[10px] text-slate-500 font-medium tracking-wide">SSC • RRB • WBPSC • IBPS</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <Link href="/features" className="hover:text-primary transition-colors">
            Features
          </Link>
          <div className="relative group py-2">
            <span className="cursor-pointer hover:text-primary transition-colors flex items-center gap-1">
              Exams
            </span>
            <div className="absolute top-full -left-4 hidden group-hover:block w-52 bg-white rounded-xl shadow-xl border border-slate-100 p-2 z-50">
              <Link href="/exams/ssc" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                SSC (CGL, CHSL, MTS)
              </Link>
              <Link href="/exams/rrb" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                RRB (NTPC, Group D)
              </Link>
              <Link href="/exams/wbpsc" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                WBPSC (Clerkship, Misc)
              </Link>
              <Link href="/exams/ibps" className="block px-3 py-2 text-xs font-semibold rounded-lg hover:bg-slate-50 hover:text-primary">
                IBPS (PO, Clerk, RRB)
              </Link>
            </div>
          </div>
          <Link href="/current-affairs" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-primary" />
            Current Affairs
          </Link>
          <Link href="/resources" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-primary" />
            Notes & PDFs
          </Link>
          <Link href="/app" className="hover:text-primary transition-colors flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-primary" />
            Mobile App
          </Link>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin/login"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-primary px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            Admin Console
          </Link>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 text-xs font-bold text-white bg-primary hover:bg-primary-600 px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all"
          >
            Get Student App
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

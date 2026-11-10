import { PublicHeader } from './public-header';
import { PublicFooter } from './public-footer';

/**
 * Public shell wrapper with accessibility skip link (F32)
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* WCAG Skip-to-Content anchor */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

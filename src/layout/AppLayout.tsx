import { useState, useEffect } from 'react';
import TopBar from './TopBar';
import Sidebar from './SideBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keyboard shortcut: Ctrl + M
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50">

      {/* TOP BAR */}
      <TopBar onMenuClick={() => setSidebarOpen(true)} />

      {/* BODY */}
      <div className="flex-1 relative overflow-hidden">

        {/* SIDEBAR */}
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* MAIN CONTENT */}
        <main className="h-full overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

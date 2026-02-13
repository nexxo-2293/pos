import {
  LayoutGrid,
  ClipboardList,
  Activity,
  BarChart3,
  CalendarCheck,
  Cpu,
  LogOut,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Sidebar({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  function go(path: string) {
    navigate(path);
    onClose();
  }

  function logout() {
    if (confirm('Confirm logout?')) {
      localStorage.removeItem('pos_user');
      navigate('/login');
    }
  }

  return (
    <>
      {/* BACKDROP */}
      {open && (
        <div
          onClick={onClose}
          className="absolute inset-0 bg-black/40 z-20"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`absolute left-0 top-0 h-full w-72 bg-slate-900 text-white z-30
        transform transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* HEADER */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <span className="font-bold tracking-wide">Synrova POS</span>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NAVIGATION */}
        <nav className="p-4 space-y-1 text-sm">

          <SidebarItem
            icon={<LayoutGrid />}
            label="Dashboard"
            onClick={() => go('/dashboard')}
          />

          <SidebarItem
            icon={<ClipboardList />}
            label="Orders"
            onClick={() => go('/orders')}
          />

          <SidebarItem
            icon={<Activity />}
            label="Live View"
            onClick={() => go('/live')}
          />

          <SidebarItem
            icon={<BarChart3 />}
            label="Reports"
            onClick={() => go('/reports/sales')}
          />

          <SidebarItem
            icon={<CalendarCheck />}
            label="Day End"
            onClick={() => go('/day-end')}
          />

          <SidebarItem
            icon={<Cpu />}
            label="System"
            onClick={() => go('/system/sync')}
          />

        </nav>

        {/* FOOTER */}
        <div className="absolute bottom-0 w-full p-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="flex items-center gap-2 text-red-400 hover:text-red-300"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

function SidebarItem({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg
      hover:bg-slate-800 transition"
    >
      <span className="w-5 h-5">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

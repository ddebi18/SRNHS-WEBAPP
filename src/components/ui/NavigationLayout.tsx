import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  DoorOpen,
  ClipboardList,
  Users,
  UserCheck,
  BookOpen,
  MessageSquare,
  Camera,
  LogOut,
  Menu,
  X,
  Zap,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { SITE_CONFIG } from '@/config/siteConfig';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { RecognitionSimulatorWidget } from '@/features/attendance/components/RecognitionSimulatorWidget';
import { cn } from '@/lib/utils';

export const NavigationLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const isAdmin = role === 'admin';

  const allNavItems = [
    { label: 'Overview',               path: '/',                  icon: LayoutDashboard, allowed: ['admin', 'teacher'] },
    { label: 'Live Gate Log',           path: '/gate-log',          icon: DoorOpen,        allowed: ['admin'] },
    { label: 'Classroom Attendance',    path: '/classroom',         icon: ClipboardList,   allowed: ['admin', 'teacher'] },
    { label: 'Face Registration',      path: '/face-registration', icon: Camera,          allowed: ['admin', 'teacher'] },
    { label: 'Students & Guardians',    path: '/students',          icon: Users,           allowed: ['admin', 'teacher'] },
    { label: 'Faculty & Schedules',     path: '/faculty',           icon: UserCheck,       allowed: ['admin', 'teacher'] },
    { label: 'Academics Master',        path: '/academics',         icon: BookOpen,        allowed: ['admin'] },
    { label: 'SMS Audit Log',           path: '/sms-log',           icon: MessageSquare,   allowed: ['admin'] },
  ];

  const allowedNavItems = allNavItems.filter(item => item.allowed.includes(role || 'teacher'));

  // Mobile Bottom Bar items (top 4 most critical tabs)
  const mobileBottomTabs = [
    { label: 'Overview',   path: '/',          icon: LayoutDashboard },
    ...(isAdmin ? [{ label: 'Gate Log', path: '/gate-log', icon: DoorOpen }] : []),
    { label: 'Classroom',  path: '/classroom', icon: ClipboardList },
    { label: 'Students',   path: '/students',  icon: Users },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="w-64 h-full flex flex-col transition-colors duration-300" style={{background: 'linear-gradient(165deg, #1B4332 0%, #2D6A4F 55%, #347A5A 85%, #40916C 100%)'}}>
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 shadow-sm border border-white/30">
            <span className="text-white font-black text-sm">SR</span>
          </div>
          <div>
            <div className="font-black text-base text-white tracking-tight">SRNHS</div>
            <div className="text-[10px] text-white/70 font-medium">Attendance System</div>
          </div>
        </div>
        <button
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-xl text-white/60 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/50 px-3 mb-2">Main Navigation</div>
        {allowedNavItems.map(item => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-3.5 py-3 rounded-2xl text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-white/25 border border-white/40 text-white font-bold shadow-md backdrop-blur-sm'
                    : 'text-white/80 hover:bg-white/15 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-white' : '')} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight className={cn('w-3.5 h-3.5 opacity-50', isActive ? 'text-white opacity-100' : '')} />
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom: User Profile + Sign Out */}
      <div className="p-4 border-t border-white/10 space-y-3" style={{background: 'rgba(0,0,0,0.25)'}}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white/20 flex items-center justify-center text-white font-black text-xs shrink-0 shadow-inner">
            {user?.full_name?.slice(0, 2).toUpperCase() || 'ST'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">{user?.full_name || 'Staff Member'}</div>
            <div className="text-[10px] text-white/60 capitalize truncate">{user?.role || 'Staff'} • {user?.department || 'Faculty'}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream dark:bg-[#0F1714] flex transition-colors duration-200">
      {/* Desktop Permanent Sidebar */}
      <div className="hidden lg:flex shrink-0">
        <SidebarContent />
      </div>

      {/* Mobile Drawer Overlay & Sheet */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed left-0 top-0 h-full z-50 lg:hidden max-w-[85vw] shadow-2xl"
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main App Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top App Bar Header */}
        <header className="sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-3
          bg-cream/85 dark:bg-[#0F1714]/85 backdrop-blur-md border-b border-black/5 dark:border-slate-800 transition-colors duration-200">
          
          {/* Mobile Header Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sidebar flex items-center justify-center text-white font-black text-xs shadow-sm">
                SR
              </div>
              <div>
                <span className="font-black text-sm text-slate-900 dark:text-slate-100 tracking-tight">SRNHS</span>
                <span className="hidden sm:inline-block text-[10px] text-slate-500 dark:text-slate-400 font-semibold ml-2">Attendance Dashboard</span>
              </div>
            </div>
            <div className="hidden lg:block text-xs font-semibold text-slate-500 dark:text-slate-400">
              {SITE_CONFIG.department}
            </div>
          </div>

          {/* Top Actions: Theme Switcher & Simulation */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl
                bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700
                text-slate-700 dark:text-slate-200 shadow-card-sm
                hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all text-xs font-bold"
            >
              {theme === 'dark'
                ? <><Sun className="w-3.5 h-3.5 text-amber-400" /> <span className="hidden sm:inline">Light</span></>
                : <><Moon className="w-3.5 h-3.5 text-slate-600" /> <span className="hidden sm:inline">Dark</span></>
              }
            </button>

            {/* Test Scan Simulator */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSimulatorOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-sidebar text-white text-xs font-bold shadow-card-sm hover:opacity-90 transition-opacity"
            >
              <Zap className="w-3.5 h-3.5 fill-white text-white" />
              <span className="hidden sm:inline">Simulate Scan</span>
            </motion.button>
          </div>
        </header>

        {/* Scrollable Page Content (Bottom padded for mobile bottom bar) */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation Bar (Screens < lg) ─────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800 px-3 py-2 flex items-center justify-around shadow-2xl transition-colors">
        {mobileBottomTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              end={tab.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all duration-150 min-w-[56px]',
                  isActive
                    ? 'text-slate-950 dark:text-white font-black'
                    : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-slate-200'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      'p-1.5 rounded-xl transition-all',
                      isActive ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950 shadow-sm' : ''
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight font-bold">{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}

        {/* More / Menu Tab */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-2xl text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-slate-200 min-w-[56px]"
        >
          <div className="p-1 rounded-xl">
            <Menu className="w-4 h-4" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">More</span>
        </button>
      </nav>

      {/* Recognition Simulator Modal */}
      <RecognitionSimulatorWidget isOpen={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
};

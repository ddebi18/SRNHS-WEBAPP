import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { SITE_CONFIG } from '@/config/siteConfig';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { RecognitionSimulatorWidget } from '@/features/attendance/components/RecognitionSimulatorWidget';
import { cn } from '@/lib/utils';

/* ── Page title mapping ──────────────────────────────────────── */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard Overview',
  '/gate-log': 'Live Gate Log',
  '/classroom': 'Classroom Attendance',
  '/face-registration': 'Face Registration',
  '/students': 'Students & Guardians',
  '/faculty': 'Faculty & Schedules',
  '/academics': 'Academics Master',
  '/sms-log': 'SMS Audit Log',
};

export const NavigationLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const isAdmin = role === 'admin';

  const currentPageTitle = PAGE_TITLES[location.pathname] || 'Dashboard';

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
    const priorRole = role;
    await logout();
    navigate(priorRole === 'admin' ? '/admin/login' : priorRole === 'student' ? '/student/login' : '/teacher/login', { replace: true });
  };

  const SidebarContent = () => (
    <div className="w-64 h-full flex flex-col bg-[#006937]">
      {/* ── School Identity Header ──────────────────── */}
      <div className="px-4 py-5 border-b border-white/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={SITE_CONFIG.sealPath}
              alt="SRNHS Seal"
              className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-gold/40 bg-white"
            />
            <div>
              <div className="font-bold text-sm text-white tracking-tight leading-tight">
                {SITE_CONFIG.schoolAcronym}
              </div>
              <div className="text-[10px] text-white/60 leading-tight mt-0.5">
                Attendance Portal
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Nav Items ───────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest px-3 mb-3">
          Menu
        </div>
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
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors relative',
                  isActive
                    ? 'bg-white/15 text-white font-semibold shadow-sm'
                    : 'text-white/75 hover:bg-white/8 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gold" />
                  )}
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── School Quick Info ───────────────────────── */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-start gap-2 text-white/50">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="text-[10px] leading-relaxed">
            Brgy. San Roque, Antipolo City
          </span>
        </div>
      </div>

      {/* ── User Section at bottom ──────────────────── */}
      <div className="p-3 border-t border-white/10 bg-black/15">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs shrink-0 border border-white/25">
              {user?.full_name?.[0] || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate">{user?.full_name || 'User'}</div>
              <div className="text-[10px] text-white/55 capitalize">{role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-page dark:bg-[#0D1F17] flex transition-colors duration-150">
      {/* Desktop Permanent Sidebar */}
      <div className="hidden shrink-0 md:flex">
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
              className="fixed inset-0 bg-black/50 z-50 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden max-w-[85vw] shadow-xl"
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main App Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* ── Top Header Bar ─────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white dark:bg-[#132B20] border-b border-slate-200 dark:border-green-900/50 transition-colors">
          {/* Thin institutional strip — DepEd branding */}
          <div className="bg-[#006937] px-4 sm:px-6 py-1.5 flex items-center justify-between text-white">
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-medium tracking-wide">
              <span className="opacity-80">Republic of the Philippines</span>
              <span className="opacity-40">•</span>
              <span className="opacity-80">Department of Education</span>
              <span className="hidden sm:inline opacity-40">•</span>
              <span className="hidden sm:inline opacity-80">Region IV-A CALABARZON</span>
            </div>
            <div className="text-[10px] opacity-60 hidden sm:block">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>

          {/* Main header row */}
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            {/* Left: menu + breadcrumb */}
            <div className="flex items-center gap-3">
              {
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  title="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              }

              {/* Mobile brand */}
              <div className="flex items-center gap-2 md:hidden">
                <img
                  src={SITE_CONFIG.sealPath}
                  alt="SRNHS"
                  className="w-7 h-7 rounded-full object-cover border border-slate-200"
                />
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight">
                  {SITE_CONFIG.schoolAcronym}
                </span>
              </div>

              {/* Desktop breadcrumb */}
              <div className="hidden items-center gap-1.5 text-sm md:flex">
                <span className="text-slate-400 dark:text-slate-500">{SITE_CONFIG.schoolAcronym}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                <span className="font-semibold text-slate-800 dark:text-slate-100">{currentPageTitle}</span>
              </div>
            </div>

            {/* Right: Theme + Simulate */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                  text-slate-700 dark:text-slate-200 shadow-xs
                  hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
              >
                {theme === 'dark'
                  ? <><Sun className="w-3.5 h-3.5 text-amber-400" /> <span className="hidden sm:inline">Light</span></>
                  : <><Moon className="w-3.5 h-3.5 text-slate-500" /> <span className="hidden sm:inline">Dark</span></>
                }
              </button>

              {/* Test Scan Simulator */}
              <button
                onClick={() => setSimulatorOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-medium shadow-sm hover:bg-primary-light transition-colors"
              >
                <Zap className="w-3.5 h-3.5 fill-white text-white" />
                <span className="hidden sm:inline">Simulate Scan</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Scrollable Page Content ─────────────────── */}
        <main className={cn(
          "flex-1 overflow-y-auto flex flex-col",
          "pb-24 md:pb-0"
        )}>
          <div className="flex-1 p-4 sm:p-6 md:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Institutional Footer ───────────────────── */}
          <footer className="bg-[#004D29] text-white mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Col 1: School Identity */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={SITE_CONFIG.sealPath}
                      alt="SRNHS Seal"
                      className="w-12 h-12 rounded-full object-cover border-2 border-gold/30 bg-white"
                    />
                    <div>
                      <div className="font-heading font-bold text-sm">{SITE_CONFIG.schoolName}</div>
                      <div className="text-[11px] text-white/60 mt-0.5">Est. {SITE_CONFIG.established}</div>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/50">
                    {SITE_CONFIG.address}
                  </p>
                </div>

                {/* Col 2: Quick Links */}
                <div>
                  <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">Quick Links</div>
                  <div className="space-y-1.5">
                    {['Dashboard Overview', 'Classroom Attendance', 'Student Records', 'Faculty Management'].map(link => (
                      <div key={link} className="text-xs text-white/60 hover:text-white transition-colors cursor-pointer">
                        {link}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Col 3: DepEd & Core Values */}
                <div>
                  <div className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-3">DepEd Core Values</div>
                  <div className="space-y-1.5">
                    {SITE_CONFIG.coreValues.map(cv => (
                      <div key={cv.filipino} className="text-xs text-white/60">
                        <span className="font-medium text-white/80">{cv.filipino}</span>
                        <span className="text-white/40 ml-1.5">— {cv.english}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-[10px] text-white/30">
                    {SITE_CONFIG.division}
                  </div>
                </div>
              </div>

              {/* Bottom bar */}
              <div className="mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="text-[10px] text-white/30">
                  © {new Date().getFullYear()} {SITE_CONFIG.schoolName}. All rights reserved.
                </div>
                <div className="text-[10px] text-white/30">
                  {SITE_CONFIG.systemTitle}
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] flex items-center justify-around shadow-lg transition-colors">
          {mobileBottomTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center min-h-11 py-1 px-2 rounded-lg transition-colors min-w-[56px] touch-manipulation',
                    isActive
                      ? 'text-primary dark:text-emerald-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 font-normal hover:text-slate-800 dark:hover:text-slate-200'
                  )
                }
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span className="text-[11px] tracking-tight">{tab.label}</span>
              </NavLink>
            );
          })}

          {/* More / Menu Tab */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center min-h-11 py-1 px-2 rounded-lg text-slate-500 dark:text-slate-400 font-normal hover:text-slate-800 dark:hover:text-slate-200 min-w-[56px] touch-manipulation"
          >
            <Menu className="w-4 h-4 mb-0.5" />
            <span className="text-[11px] tracking-tight">More</span>
          </button>
        </nav>

      {/* Recognition Simulator Modal */}
      <RecognitionSimulatorWidget isOpen={simulatorOpen} onClose={() => setSimulatorOpen(false)} />
    </div>
  );
};

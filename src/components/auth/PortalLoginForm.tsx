import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, LoginPortal } from '@/context/AuthContext';
import { SITE_CONFIG } from '@/config/siteConfig';
import { checkLoginRateLimit, recordFailedLoginAttempt, resetLoginRateLimit, sanitizeInput } from '@/lib/validation';
import { LogIn, Lock, Mail, ShieldAlert, Eye, EyeOff, Clock } from 'lucide-react';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import { CampusDoodle } from '@/components/motion/CampusDoodle';
import { fadeUp, staggerContainer } from '@/components/motion/PageFade';

interface PortalLoginFormProps {
  portal: LoginPortal;
  portalTitle: string;
  portalSubtitle: string;
  identifierLabel: string;
  identifierPlaceholder: string;
  switchUrl: string;
  switchLabel: string;
  defaultRedirect: string;
}

export const PortalLoginForm: React.FC<PortalLoginFormProps> = ({
  portal,
  portalTitle,
  portalSubtitle,
  identifierLabel,
  identifierPlaceholder,
  switchUrl,
  switchLabel,
  defaultRedirect,
}) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  // Check rate limit on mount and run cooldown timer
  useEffect(() => {
    const { isLocked, remainingSeconds } = checkLoginRateLimit();
    if (isLocked) {
      setLockoutRemaining(remainingSeconds);
    }
  }, []);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Rate limiting check
    const { isLocked, remainingSeconds } = checkLoginRateLimit();
    if (isLocked) {
      setLockoutRemaining(remainingSeconds);
      setErrorMessage(`Too many failed attempts. Login locked for ${remainingSeconds} seconds.`);
      return;
    }

    const cleanId = sanitizeInput(identifier, 120);
    const cleanPassword = password.trim();

    if (!cleanId) {
      setErrorMessage(`Please enter your ${identifierLabel.toLowerCase()}.`);
      return;
    }

    setLoading(true);
    const result = await login(cleanId, cleanPassword, portal);

    if (result.success) {
      resetLoginRateLimit();
      navigate(defaultRedirect, { replace: true });
    } else {
      const rateLimitStatus = recordFailedLoginAttempt();
      if (rateLimitStatus.isLocked) {
        setLockoutRemaining(rateLimitStatus.remainingSeconds);
        setErrorMessage(`Too many failed attempts. Login locked for ${rateLimitStatus.remainingSeconds} seconds.`);
      } else {
        setErrorMessage(result.error || 'Invalid credentials. Please verify and try again.');
      }
      setLoading(false);
    }
  };

  const isFormDisabled = loading || lockoutRemaining > 0;

  return (
    <motion.div
      className="min-h-screen flex flex-col transition-colors"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── DepEd Institutional Strip ───────────────────────── */}
      <div className="bg-[#006937] px-4 sm:px-6 py-2 flex items-center justify-between text-white">
        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-medium tracking-wide">
          <span className="opacity-80">Republic of the Philippines</span>
          <span className="opacity-40">•</span>
          <span className="opacity-80">Department of Education</span>
          <span className="hidden sm:inline opacity-40">•</span>
          <span className="hidden sm:inline opacity-80">{SITE_CONFIG.region}</span>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#F5F6F8] dark:bg-[#0F1714] p-4 sm:p-6 paper-grain">
        <motion.div
          className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-5 gap-0 md:gap-0 items-stretch shadow-xl shadow-emerald-950/10 rounded-xl overflow-hidden"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >

          {/* ── Left Panel — School Identity ────────────────── */}
          <motion.div
            variants={fadeUp}
            className="md:col-span-2 bg-[#006937] rounded-t-xl md:rounded-none p-6 sm:p-8 flex flex-col justify-between text-white relative overflow-hidden"
          >
            <div className="absolute inset-0 opacity-40 pointer-events-none">
              <CampusDoodle className="absolute -right-6 bottom-2 w-56 h-44 hidden md:block" />
            </div>
            <div className="space-y-5 relative z-10">
              <div className="flex flex-col items-center md:items-start gap-4">
                <motion.img
                  src={SITE_CONFIG.sealPath}
                  alt="SRNHS Seal"
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-3 border-gold/40 bg-white shadow-md"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="text-center md:text-left">
                  <h1 className="font-heading font-bold text-lg sm:text-xl leading-tight">
                    {SITE_CONFIG.schoolName}
                  </h1>
                  <p className="text-[11px] text-white/60 mt-1.5 leading-relaxed">
                    {SITE_CONFIG.address}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-3">
                <LordIcon src={LORD_ICONS.book} size={42} trigger="loop" colors="primary:#ffffff,secondary:#d4a373" />
                <div>
                  <div className="text-[10px] font-semibold text-white/50 uppercase tracking-widest mb-1">Campus portal</div>
                  <div className="text-xs font-medium text-white/90 leading-relaxed">
                    {SITE_CONFIG.systemTitle}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 relative z-10 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {SITE_CONFIG.coreValues.map(cv => (
                  <span
                    key={cv.filipino}
                    className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/70 font-medium"
                  >
                    {cv.filipino}
                  </span>
                ))}
              </div>
              <LordIcon src={LORD_ICONS.graduate} size={52} trigger="loop" colors="primary:#ffffff,secondary:#f6e27a" className="hidden sm:inline-flex" />
            </div>
          </motion.div>

          {/* ── Right Panel — Login Form ────────────────────── */}
          <motion.div
            variants={fadeUp}
            className="md:col-span-3 bg-white dark:bg-slate-900 rounded-b-xl md:rounded-none border border-slate-200 dark:border-slate-800 border-t-0 md:border-t md:border-l-0 p-6 sm:p-8 flex flex-col justify-center"
          >
            {/* Portal Badge */}
            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary-50 dark:bg-green-950/60 border border-primary-100 dark:border-green-800 text-xs font-medium text-primary dark:text-green-300 mb-3">
                {portal === 'admin' ? (
                  <>
                    <LordIcon src={LORD_ICONS.shield} size={22} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
                    <span>Administrator Access</span>
                  </>
                ) : portal === 'student' ? (
                  <>
                    <LordIcon src={LORD_ICONS.student} size={22} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
                    <span>Student Access</span>
                  </>
                ) : (
                  <>
                    <LordIcon src={LORD_ICONS.school} size={22} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
                    <span>Faculty Access</span>
                  </>
                )}
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                {portalTitle}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {portalSubtitle}
              </p>
            </div>

            {/* Rate limit lockout warning or error */}
            {lockoutRemaining > 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-medium mb-4">
                <Clock className="w-4 h-4 shrink-0 animate-spin" />
                <span>Login locked due to repeated attempts. Cooldown: {lockoutRemaining}s</span>
              </div>
            ) : errorMessage ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium mb-4">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {identifierLabel}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    disabled={isFormDisabled}
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-sm rounded-lg
                      bg-slate-50 dark:bg-slate-800
                      border border-slate-200 dark:border-slate-700
                      text-slate-900 dark:text-slate-100
                      placeholder:text-slate-400 dark:placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary dark:focus:border-emerald-500 transition-all disabled:opacity-50"
                    placeholder={identifierPlaceholder}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isFormDisabled}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-sm rounded-lg
                      bg-slate-50 dark:bg-slate-800
                      border border-slate-200 dark:border-slate-700
                      text-slate-900 dark:text-slate-100
                      placeholder:text-slate-400 dark:placeholder:text-slate-500
                      focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary dark:focus:border-emerald-500 transition-all disabled:opacity-50"
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isFormDisabled}
                className="w-full py-2.5 px-4 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-sm font-semibold
                  flex items-center justify-center gap-2 shadow-sm mt-2
                  disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loading ? 'Signing in…' : lockoutRemaining > 0 ? `Locked (${lockoutRemaining}s)` : 'Sign in'}
              </button>
            </form>

            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-2">
              <Link
                to={switchUrl}
                className="text-xs font-medium text-primary dark:text-emerald-400 hover:underline block"
              >
                {switchLabel}
              </Link>
              {portal !== 'student' && (
                <Link
                  to="/student/login"
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-emerald-400 hover:underline block"
                >
                  Are you a student? Go to Student Sign-In
                </Link>
              )}
              {portal === 'student' && (
                <Link
                  to="/admin/login"
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-emerald-400 hover:underline block"
                >
                  Administrator? Go to Admin Sign-In
                </Link>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* ── Bottom Bar ─────────────────────────────────────── */}
      <div className="bg-[#004D29] px-4 sm:px-6 py-3 text-center">
        <p className="text-[10px] text-white/40">
          © {new Date().getFullYear()} {SITE_CONFIG.schoolName} • {SITE_CONFIG.division}
        </p>
      </div>
    </motion.div>
  );
};

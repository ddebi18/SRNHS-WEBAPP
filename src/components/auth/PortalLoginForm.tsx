import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, LoginPortal } from '@/context/AuthContext';
import { SITE_CONFIG } from '@/config/siteConfig';
import { checkLoginRateLimit, recordFailedLoginAttempt, resetLoginRateLimit, sanitizeInput } from '@/lib/validation';
import { LogIn, Camera, Lock, Mail, ShieldAlert, Eye, EyeOff, Clock, ArrowRight, ShieldCheck, School, Target, Scan, MessageSquare, ShieldCheck as ShieldPrivacy } from 'lucide-react';

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
    // Role is NEVER sent from the client form; portal scope is validated server/record-side
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
    <div className="min-h-screen bg-cream dark:bg-[#0F1714] flex items-center justify-center p-6 transition-colors">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">

        {/* Left Column — School Branding & Identity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sidebar flex items-center justify-center shadow-card-sm border border-emerald-900/30">
              <span className="text-white font-black text-lg">SR</span>
            </div>
            <div>
              <div className="font-black text-xl text-slate-900 dark:text-slate-100 tracking-tight">SRNHS</div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Attendance Monitoring Portal</div>
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-3">
              {portal === 'admin' ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Administrative Security Boundary</span>
                </>
              ) : (
                <>
                  <School className="w-3.5 h-3.5" />
                  <span>Faculty & Classroom Scope</span>
                </>
              )}
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 leading-tight">
              {portalTitle}
            </h1>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-3 max-w-sm">
              {SITE_CONFIG.schoolName} — Secure facial recognition attendance and records management system for DepEd personnel.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { icon: <Target className="w-3 h-3" />, label: 'Real-time Turnstile Scans' },
              { icon: <Scan className="w-3 h-3" />, label: '128D Face Biometrics' },
              { icon: <MessageSquare className="w-3 h-3" />, label: 'Automated Parent SMS' },
              { icon: <ShieldPrivacy className="w-3 h-3" />, label: 'R.A. 10173 Compliant' },
            ].map(f => (
              <span key={f.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-card-sm">
                {f.icon}{f.label}
              </span>
            ))}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm">
            <Camera className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
              Camera capture and neural face-matching run on dedicated edge turnstile nodes. This dashboard securely stores attendance logs and dispatches guardian alerts.
            </p>
          </div>
        </motion.div>

        {/* Right Column — Professional Authentication Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card p-8 space-y-6 transition-colors"
        >
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">{portalTitle}</h2>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
              {portalSubtitle}
            </p>
          </div>

          {/* Rate limit lockout warning or error */}
          {lockoutRemaining > 0 ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold">
              <Clock className="w-4 h-4 shrink-0 animate-spin" />
              <span>Login locked due to repeated attempts. Cooldown: {lockoutRemaining}s</span>
            </div>
          ) : errorMessage ? (
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                {identifierLabel}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  required
                  disabled={isFormDisabled}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-sm rounded-2xl font-medium
                    bg-slate-50 dark:bg-slate-800/80
                    border border-slate-200 dark:border-slate-700
                    text-slate-900 dark:text-slate-100
                    placeholder:text-slate-400 dark:placeholder:text-slate-500
                    focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 transition-all disabled:opacity-50"
                  placeholder={identifierPlaceholder}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isFormDisabled}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 text-sm rounded-2xl font-medium
                    bg-slate-50 dark:bg-slate-800/80
                    border border-slate-200 dark:border-slate-700
                    text-slate-900 dark:text-slate-100
                    placeholder:text-slate-400 dark:placeholder:text-slate-500
                    focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 transition-all disabled:opacity-50"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              type="submit"
              disabled={isFormDisabled}
              whileHover={{ scale: isFormDisabled ? 1 : 1.02 }}
              whileTap={{ scale: isFormDisabled ? 1 : 0.98 }}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#1B4332] via-[#2D6A4F] to-[#D4A373] text-white text-sm font-black
                flex items-center justify-center gap-2 shadow-card mt-2
                hover:brightness-105 disabled:opacity-50 transition-all"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Verifying Credentials…' : lockoutRemaining > 0 ? `Locked (${lockoutRemaining}s)` : 'Authenticate Session'}
            </motion.button>
          </form>

          {/* Switch Portal Link (Requirement 2) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 text-center">
            <Link
              to={switchUrl}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
            >
              <span>{switchLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

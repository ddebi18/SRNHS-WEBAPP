import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getSafeErrorMessage, checkLoginRateLimit, recordFailedLoginAttempt, resetLoginRateLimit } from '@/lib/validation';
import { Lock, Mail, Users, AlertCircle, Eye, EyeOff } from 'lucide-react';

export const GuardianLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Client-side rate-limit verification
    const { isLocked, remainingSeconds } = checkLoginRateLimit();
    if (isLocked) {
      setErrorMsg(`Too many failed attempts. Login locked for ${remainingSeconds} seconds.`);
      return;
    }

    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Please enter your guardian email and password.');
      return;
    }

    try {
      const result = await login(identifier.trim(), password.trim(), 'guardian');
      if (result.success) {
        resetLoginRateLimit();
        navigate('/guardian', { replace: true });
      } else {
        recordFailedLoginAttempt();
        setErrorMsg(result.error || 'Invalid login credentials. Please verify and try again.');
      }
    } catch (err: unknown) {
      recordFailedLoginAttempt();
      setErrorMsg(getSafeErrorMessage(err));
    }
  };

  const inputClasses =
    'w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 ' +
    'focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Brand Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-900/30">
              <Users className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-xl font-black text-white text-center tracking-tight mb-1">
            Parent &amp; Guardian Portal
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            San Rafael National High School — Attendance &amp; Academic Progress
          </p>

          {errorMsg && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form id="guardian-login-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Guardian Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="guardian-email-input"
                  type="email"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="parent.guardian@example.com"
                  autoComplete="username"
                  required
                  className={inputClasses}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="guardian-password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-11 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              id="guardian-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white shadow-lg shadow-teal-900/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'Signing In…' : 'Sign In to Portal'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/10 text-center space-y-2">
            <p className="text-[11px] text-slate-400">
              Need access or haven't received your invitation link?
            </p>
            <p className="text-[11px] text-slate-300 font-medium">
              Please contact your student's section adviser or the school registrar.
            </p>
            <div className="pt-2">
              <a
                href="/teacher/login"
                className="text-xs text-teal-400 hover:text-teal-300 font-semibold transition-colors"
              >
                Faculty / Teacher Login →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

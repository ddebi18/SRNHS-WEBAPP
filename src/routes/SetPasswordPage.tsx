import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { AlertCircle, CheckCircle, Lock, Eye, EyeOff } from 'lucide-react';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  })
  .refine(d => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

type FormData = z.infer<typeof schema>;

export const SetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [expired, setExpired] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Detect expired/error OTP links from the URL hash
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');

    if (errorCode === 'otp_expired' || errorCode || errorDescription) {
      setExpired(true);
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }: FormData) => {
    if (!supabase) {
      setServerError('Authentication service is unavailable.');
      return;
    }

    setServerError(null);

    const { error } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    setSuccess(true);
    // Redirect to teacher dashboard after a brief pause
    setTimeout(() => navigate('/classroom', { replace: true }), 1800);
  };

  const inputCls =
    'w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 ' +
    'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Logo / Brand */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <Lock className="w-7 h-7 text-white" />
            </div>
          </div>

          <h1 className="text-xl font-black text-white text-center tracking-tight mb-1">
            Set Your Password
          </h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            SRNHS Attendance &amp; Monitoring System
          </p>

          {expired ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-300">Link Expired</p>
                  <p className="text-xs text-amber-400/80 mt-1">
                    This invite link has expired. Ask your school administrator to resend your invite.
                  </p>
                </div>
              </div>
              <a
                href="/teacher/login"
                className="block text-center text-xs text-slate-400 hover:text-white transition-colors"
              >
                ← Return to Teacher Login
              </a>
            </div>
          ) : success ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">Password Set!</p>
                  <p className="text-xs text-emerald-400/80 mt-1">
                    Your account is ready. Redirecting to your dashboard…
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form id="set-password-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {serverError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {serverError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <input
                    {...register('password')}
                    id="set-password-input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-[11px] text-rose-400">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Confirm Password
                </label>
                <input
                  {...register('confirm')}
                  id="set-password-confirm"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  className={inputCls}
                />
                {errors.confirm && (
                  <p className="mt-1 text-[11px] text-rose-400">{errors.confirm.message}</p>
                )}
              </div>

              <button
                id="set-password-submit"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-900/30 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Setting Password…' : 'Set Password & Continue'}
              </button>

              <p className="text-center text-[11px] text-slate-500">
                Having trouble?{' '}
                <a href="/teacher/login" className="text-slate-400 hover:text-white transition-colors">
                  Contact your administrator
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

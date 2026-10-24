import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  validateClassQrToken,
  recordStudentQrCheckIn,
} from '@/features/attendance/api/classQrApi';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import { isValidLRN } from '@/lib/validation';
import { SITE_CONFIG } from '@/config/siteConfig';

export const StudentScanPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';

  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [lrn, setLrn] = useState('');
  const [verifier, setVerifier] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{ valid: boolean; reason?: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    studentName?: string;
    status?: string;
    message?: string;
  } | null>(null);

  // Validate token on mount if provided in query string
  useEffect(() => {
    if (tokenParam) {
      setTokenInput(tokenParam);
      validateClassQrToken(tokenParam).then(res => {
        setSessionInfo(res);
      });
    }
  }, [tokenParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || !lrn.trim() || !verifier.trim()) return;

    if (!isValidLRN(lrn)) {
      setResult({
        success: false,
        message: 'Learner Reference Number (LRN) must be exactly 12 digits.',
      });
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const res = await recordStudentQrCheckIn({
        token: tokenInput.trim(),
        lrn: lrn.trim(),
        birthdateOrLastName: verifier.trim(),
      });
      setResult(res);
    } catch (err: any) {
      setResult({
        success: false,
        message: err.message || 'An unexpected error occurred during attendance check-in.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        {/* Header Branding */}
        <div className="bg-[#006937] p-6 text-white text-center relative">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-3">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-lg font-bold">Classroom QR Attendance</h1>
          <p className="text-xs text-emerald-100 mt-1">{SITE_CONFIG.schoolName}</p>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {result ? (
            <div className="text-center space-y-4 py-4">
              <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${
                  result.success
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                }`}
              >
                {result.success ? (
                  <CheckCircle2 className="w-10 h-10" />
                ) : (
                  <AlertCircle className="w-10 h-10" />
                )}
              </div>

              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {result.success ? 'Attendance Recorded!' : 'Check-In Failed'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {result.message}
                </p>
                {result.studentName && (
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mt-2">
                    {result.studentName}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setLrn('');
                    setVerifier('');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                >
                  Scan Another / Retry
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {sessionInfo && !sessionInfo.valid && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <span>{sessionInfo.reason}</span>
                </div>
              )}

              {/* Token Input if not in URL */}
              {!tokenParam && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Class QR Token
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter QR token"
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              )}

              {/* LRN Input */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  12-Digit Learner Reference Number (LRN)
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  placeholder="e.g. 109823456701"
                  value={lrn}
                  onChange={e => setLrn(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono tracking-wider"
                />
              </div>

              {/* Verifier: Last Name or Birth Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Verification (Last Name or Birth Date YYYY-MM-DD)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dela Cruz or 2008-05-15"
                  value={verifier}
                  onChange={e => setVerifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Must match the student records registered in the system.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || (sessionInfo !== null && !sessionInfo.valid)}
                className="w-full mt-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Checking In...</span>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Confirm Classroom Attendance</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[10px] text-slate-400">
            Secure DepEd Attendance Verification • Republic Act 10173 Protected
          </p>
        </div>
      </div>
    </div>
  );
};

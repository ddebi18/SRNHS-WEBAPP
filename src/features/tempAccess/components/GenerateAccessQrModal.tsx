import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '@/components/ui/Modal';
import {
  AccessGrantPurpose,
  StudentAccessGrant,
  StudentAccessGrantClaim,
} from '../types';
import {
  createSharedSession,
  revokeSession,
  subscribeToSessionClaims,
  subscribeToGrantStatus,
} from '../api';
import {
  QrCode,
  Camera,
  UserCheck,
  Clock,
  Copy,
  Check,
  Printer,
  AlertCircle,
  Sparkles,
  Shield,
  RefreshCw,
  Users,
  Ban,
} from 'lucide-react';

interface GenerateAccessQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GenerateAccessQrModal: React.FC<GenerateAccessQrModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [label, setLabel] = useState('Student Registration Session');
  const [purpose, setPurpose] = useState<AccessGrantPurpose>('both');
  const [expiryPreset, setExpiryPreset] = useState<'60' | '240' | '1440' | 'custom'>('240');
  const [customMinutes, setCustomMinutes] = useState<number>(120);
  const [maxUsesInput, setMaxUsesInput] = useState<string>('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<StudentAccessGrant | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [recentClaims, setRecentClaims] = useState<StudentAccessGrantClaim[]>([]);

  const printRef = useRef<HTMLDivElement>(null);

  // Reset state on modal close
  useEffect(() => {
    if (!isOpen) {
      setLabel('Student Registration Session');
      setPurpose('both');
      setExpiryPreset('240');
      setMaxUsesInput('');
      setActiveSession(null);
      setError(null);
      setRecentClaims([]);
    }
  }, [isOpen]);

  // Realtime claims and status listener
  useEffect(() => {
    if (!activeSession) return;

    const unsubClaims = subscribeToSessionClaims(activeSession.id, (newClaim) => {
      setRecentClaims((prev) => [newClaim, ...prev.slice(0, 9)]);
      setActiveSession((curr) => curr ? { ...curr, use_count: curr.use_count + 1 } : null);
    });

    const unsubStatus = subscribeToGrantStatus(activeSession.id, (newStatus) => {
      setActiveSession((curr) => curr ? { ...curr, status: newStatus, is_active: newStatus === 'pending' } : null);
    });

    return () => {
      unsubClaims();
      unsubStatus();
    };
  }, [activeSession?.id]);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGenerating(true);
    setError(null);

    const ttl = expiryPreset === 'custom' ? Number(customMinutes) || 60 : Number(expiryPreset);
    const maxUses = maxUsesInput.trim() ? parseInt(maxUsesInput.trim(), 10) : null;

    try {
      const session = await createSharedSession({
        label,
        purpose,
        ttlMinutes: ttl,
        maxUses: maxUses && maxUses > 0 ? maxUses : null,
      });
      setActiveSession(session);
      setRecentClaims([]);
    } catch (err: any) {
      setError(err.message || 'Failed to create registration session.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeSession) return;
    setRevoking(true);
    try {
      await revokeSession(activeSession.id);
      setActiveSession((prev) => (prev ? { ...prev, is_active: false, status: 'revoked' } : null));
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session.');
    } finally {
      setRevoking(false);
    }
  };

  const sessionUrl = activeSession
    ? `${window.location.origin}/temp-access/${activeSession.token}`
    : '';

  const handleCopyLink = () => {
    if (!sessionUrl) return;
    navigator.clipboard.writeText(sessionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Shared Registration Session QR"
      subtitle="Generate a reusable QR code for on-site student facial enrollment and contact verification."
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!activeSession ? (
          /* Step 1: Session Configuration Form */
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Session Event Name / Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Grade 7 On-Site Enrollment Day"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                required
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                A descriptive title displayed to students when they scan the QR code.
              </p>
            </div>

            {/* Purpose Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Registration Scope
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPurpose('both')}
                  className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    purpose === 'both'
                      ? 'border-primary bg-primary-50/70 dark:bg-primary-950/40 ring-1 ring-primary'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Full Setup</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    3-angle face enrollment + parent contact details
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPurpose('face_registration')}
                  className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    purpose === 'face_registration'
                      ? 'border-primary bg-primary-50/70 dark:bg-primary-950/40 ring-1 ring-primary'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Camera className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Face Only</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Biometric facial capture for gate turnstiles
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPurpose('guardian_update')}
                  className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${
                    purpose === 'guardian_update'
                      ? 'border-primary bg-primary-50/70 dark:bg-primary-950/40 ring-1 ring-primary'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Guardian Only</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Update guardian names & emergency SMS numbers
                  </span>
                </button>
              </div>
            </div>

            {/* Expiration Preset */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Session Expiration Window
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: '60', label: '1 Hour' },
                  { id: '240', label: '4 Hours (Recommended)' },
                  { id: '1440', label: '1 Day (24h)' },
                  { id: 'custom', label: 'Custom' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setExpiryPreset(item.id as any)}
                    className={`px-3 py-2 text-xs font-medium rounded-lg border text-center transition-all ${
                      expiryPreset === item.id
                        ? 'border-primary bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {expiryPreset === 'custom' && (
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={10080}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(5, parseInt(e.target.value, 10) || 5))}
                    className="w-28 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-xs text-slate-500">minutes (5 mins up to 7 days)</span>
                </div>
              )}
            </div>

            {/* Optional Max Uses */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Student Cap / Max Registrations (Optional)
              </label>
              <input
                type="number"
                min={1}
                value={maxUsesInput}
                onChange={(e) => setMaxUsesInput(e.target.value)}
                placeholder="Leave blank for unlimited during the session window"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Limits how many students can successfully complete claims using this session QR code.
              </p>
            </div>

            {/* Submit */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generating}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary-light text-white flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating Session...
                  </>
                ) : (
                  <>
                    <QrCode className="w-4 h-4" />
                    Generate Session QR
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Active Session Display with Live QR Code */
          <div className="space-y-6">
            <div
              ref={printRef}
              className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 shadow-sm flex flex-col items-center text-center space-y-4"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    activeSession.is_active && activeSession.status === 'pending'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activeSession.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  {activeSession.is_active ? 'Live Session Active' : 'Session Revoked'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeSession.purpose === 'both'
                    ? 'Face + Guardian'
                    : activeSession.purpose === 'face_registration'
                    ? 'Face Only'
                    : 'Guardian Only'}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {activeSession.label || 'Student Registration Session'}
              </h3>

              {/* QR Code Container */}
              <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-200 inline-block">
                <QRCodeSVG
                  value={sessionUrl}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
                Students scan this QR code with their mobile device camera. They will be prompted to enter their 12-digit LRN and verify their identity.
              </p>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 gap-3 w-full max-w-sm pt-2">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                    <Users className="w-3 h-3 text-primary" /> Registrations
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeSession.use_count}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      / {activeSession.max_uses ? activeSession.max_uses : 'Unlimited'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left">
                  <div className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" /> Expires
                  </div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {new Date(activeSession.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>

            {/* Direct URL sharing bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={sessionUrl}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 select-all outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Link'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>

            {/* Live Claims Activity Feed */}
            {recentClaims.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" /> Recent Verified Claims ({recentClaims.length})
                </h4>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {recentClaims.map((claim) => (
                    <div
                      key={claim.id}
                      className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-slate-800 dark:text-slate-200">LRN: {claim.lrn}</span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(claim.claimed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revoke and Reset Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={!activeSession.is_active || revoking}
                onClick={handleRevoke}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                {revoking ? 'Revoking...' : 'Revoke Session'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSession(null)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors"
                >
                  Create Another Session
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary-light transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

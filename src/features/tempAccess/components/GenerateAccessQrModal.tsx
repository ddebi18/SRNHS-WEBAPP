import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import {
  AccessGrantPurpose,
  AccessGrantStatus,
  StudentAccessGrant,
  StudentSummary,
} from '../types';
import {
  lookupStudentByLrn,
  createAccessGrant,
  subscribeToGrantStatus,
} from '../api';
import {
  QrCode,
  Search,
  Camera,
  UserCheck,
  Clock,
  Copy,
  Check,
  Printer,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Shield,
  RefreshCw,
} from 'lucide-react';

interface GenerateAccessQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLrn?: string;
}

export const GenerateAccessQrModal: React.FC<GenerateAccessQrModalProps> = ({
  isOpen,
  onClose,
  initialLrn = '',
}) => {
  const [lrnInput, setLrnInput] = useState(initialLrn);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [matchedStudent, setMatchedStudent] = useState<StudentSummary | null>(null);

  const [purpose, setPurpose] = useState<AccessGrantPurpose>('both');
  const [ttlMinutes, setTtlMinutes] = useState<number>(60); // 1 hour default

  const [generating, setGenerating] = useState(false);
  const [activeGrant, setActiveGrant] = useState<StudentAccessGrant | null>(null);
  const [copied, setCopied] = useState(false);
  const [liveStatus, setLiveStatus] = useState<AccessGrantStatus>('pending');

  const printRef = useRef<HTMLDivElement>(null);

  // Auto-search if initialLrn provided
  useEffect(() => {
    if (initialLrn && initialLrn.length === 12) {
      setLrnInput(initialLrn);
      handleLookup(initialLrn);
    }
  }, [initialLrn, isOpen]);

  // Reset state on modal close
  useEffect(() => {
    if (!isOpen) {
      setLrnInput('');
      setMatchedStudent(null);
      setActiveGrant(null);
      setLookupError(null);
      setLiveStatus('pending');
    }
  }, [isOpen]);

  // Subscribe to realtime status changes for active grant
  useEffect(() => {
    if (!activeGrant) return;
    setLiveStatus(activeGrant.status);

    const unsubscribe = subscribeToGrantStatus(activeGrant.id, (newStatus) => {
      setLiveStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, [activeGrant]);

  const handleLookup = async (lrnToSearch: string) => {
    const clean = lrnToSearch.trim();
    if (!clean) return;

    if (!/^\d{12}$/.test(clean)) {
      setLookupError('LRN must be exactly 12 numeric digits.');
      setMatchedStudent(null);
      return;
    }

    setLookupLoading(true);
    setLookupError(null);

    try {
      const student = await lookupStudentByLrn(clean);
      if (!student) {
        setLookupError(`No enrolled student found with LRN ${clean}.`);
        setMatchedStudent(null);
      } else {
        setMatchedStudent(student);
        setLookupError(null);
      }
    } catch (err: any) {
      setLookupError(err.message || 'Error looking up student.');
      setMatchedStudent(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!matchedStudent) return;
    setGenerating(true);
    try {
      const grant = await createAccessGrant({
        lrn: matchedStudent.lrn,
        purpose,
        ttlMinutes,
      });
      setActiveGrant(grant);
      setLiveStatus('pending');
    } catch (err: any) {
      setLookupError(err.message || 'Failed to generate access grant.');
    } finally {
      setGenerating(false);
    }
  };

  const accessUrl = activeGrant
    ? `${window.location.origin}/temp-access/${activeGrant.token}`
    : '';

  const handleCopyLink = () => {
    if (!accessUrl) return;
    navigator.clipboard.writeText(accessUrl);
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
      title="Generate Temporary Access QR"
      subtitle="Single-use, scoped biometric enrollment & guardian update portal"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {!activeGrant ? (
          <>
            {/* Step 1: LRN Lookup Form */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Look up Student by Learner Reference Number (LRN)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="Enter 12-digit LRN (e.g. 109823456789)"
                    value={lrnInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setLrnInput(val);
                      if (val.length === 12) {
                        handleLookup(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookup(lrnInput);
                      }
                    }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono text-sm tracking-wide"
                  />
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                </div>
                <button
                  type="button"
                  disabled={lrnInput.length !== 12 || lookupLoading}
                  onClick={() => handleLookup(lrnInput)}
                  className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 font-medium text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {lookupLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    'Verify LRN'
                  )}
                </button>
              </div>

              {lookupError && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}
            </div>

            {/* Step 2: Confirmation & Student Profile Preview */}
            {matchedStudent && (
              <Card className="p-4 border-primary-200 dark:border-primary-900/50 bg-primary-50/40 dark:bg-primary-950/20">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 shrink-0 border-2 border-white dark:border-neutral-800 shadow-sm">
                    {matchedStudent.photo_url ? (
                      <img
                        src={matchedStudent.photo_url}
                        alt={matchedStudent.first_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-neutral-500 dark:text-neutral-400">
                        {matchedStudent.first_name.charAt(0)}
                        {matchedStudent.last_name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {matchedStudent.first_name} {matchedStudent.last_name}
                      </h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                        LRN Verified
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                      LRN: <span className="font-mono font-semibold">{matchedStudent.lrn}</span> •{' '}
                      Grade {matchedStudent.grade_level} ({matchedStudent.section_name})
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Step 3: Grant Purpose & Expiry Options */}
            {matchedStudent && (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                    Scope & Allowed Purpose
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setPurpose('both')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        purpose === 'both'
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 ring-2 ring-primary-500/20'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Sparkles className="w-4 h-4 text-primary-500" />
                        <span>Both Tasks</span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Biometric face scan + guardian details update
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPurpose('face_registration')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        purpose === 'face_registration'
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 ring-2 ring-primary-500/20'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Camera className="w-4 h-4 text-primary-500" />
                        <span>Face Only</span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Capture face embedding and photo only
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPurpose('guardian_update')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        purpose === 'guardian_update'
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 ring-2 ring-primary-500/20'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <UserCheck className="w-4 h-4 text-primary-500" />
                        <span>Guardian Only</span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                        Update emergency parent contact and SMS
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                    <div>
                      <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                        Access Expiration (TTL)
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        Token automatically invalidates once used or expired
                      </p>
                    </div>
                  </div>
                  <select
                    value={ttlMinutes}
                    onChange={(e) => setTtlMinutes(Number(e.target.value))}
                    className="px-2.5 py-1.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium focus:ring-1 focus:ring-primary-500"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={60}>1 Hour (Standard)</option>
                    <option value={120}>2 Hours</option>
                  </select>
                </div>

                {/* Generate Button */}
                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={generating}
                    onClick={handleGenerate}
                    className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center gap-2"
                  >
                    {generating ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        Generate Single-Use QR
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Active QR Code Display & Realtime Tracker */
          <div className="space-y-6">
            <div
              ref={printRef}
              className="p-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl flex flex-col items-center text-center shadow-sm"
            >
              {/* Security Header */}
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold tracking-wide uppercase text-neutral-600 dark:text-neutral-400">
                  San Roque National High School • Student Self-Service
                </span>
              </div>

              {/* Student Identification */}
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {activeGrant.student?.first_name} {activeGrant.student?.last_name}
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                LRN: <span className="font-mono font-medium">{activeGrant.lrn}</span> • Scope:{' '}
                <span className="font-semibold capitalize">{activeGrant.purpose.replace('_', ' ')}</span>
              </p>

              {/* QR Code */}
              <div className="my-5 p-4 bg-white rounded-xl border border-neutral-200 shadow-inner">
                <QRCodeSVG
                  value={accessUrl}
                  size={210}
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: '/srnhs-seal.jpg',
                    x: undefined,
                    y: undefined,
                    height: 38,
                    width: 38,
                    excavate: true,
                  }}
                />
              </div>

              <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  Valid for {ttlMinutes} min • Single-use access credential
                </span>
              </div>

              {/* Live Realtime Status Pill */}
              <div className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveStatus === 'completed'
                      ? 'bg-emerald-500 animate-none'
                      : 'bg-amber-500 animate-ping'
                  }`}
                />
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 capitalize">
                  {liveStatus === 'pending'
                    ? 'Waiting for student scan / submission…'
                    : liveStatus === 'completed'
                    ? 'Registration Completed & Invalidation Finalized'
                    : `Status: ${liveStatus}`}
                </span>
              </div>
            </div>

            {/* Quick Link & Action Buttons */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={accessUrl}
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-2 text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveGrant(null);
                    setMatchedStudent(null);
                    setLrnInput('');
                  }}
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3 rotate-180" />
                  Generate another QR
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg transition-colors"
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

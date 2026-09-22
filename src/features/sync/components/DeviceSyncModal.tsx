import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Copy, Check, X, Download, Upload, ShieldCheck } from 'lucide-react';
import { generateSyncUrl, exportSyncPayload, importSyncPayload } from '../syncService';
import { getStoredStudents, getStoredSections } from '@/features/faceRegistration/api';

interface DeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({ isOpen, onClose }) => {
  const [syncUrl, setSyncUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const students = getStoredStudents();
  const sections = getStoredSections();

  useEffect(() => {
    if (isOpen) {
      setSyncUrl(generateSyncUrl());
      setImportNotice(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(syncUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback prompt if clipboard API is restricted
      window.prompt('Copy this sync link to open on your phone:', syncUrl);
    }
  };

  const handleDownloadBackup = () => {
    const payload = exportSyncPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `srnhs-attendance-sync-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      const res = importSyncPayload(text);
      if (res.success) {
        setImportNotice(`Successfully imported ${res.studentCount} student(s) and ${res.sectionCount} section(s).`);
      } else {
        setImportNotice(`Import failed: ${res.error || 'Invalid file format'}`);
      }
    };
    reader.readAsText(file);
  };

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(syncUrl)}`;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5 sm:p-6 my-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                Sync to Mobile Phone
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Transfer your enrolled students, sections, and biometric templates across devices.
              </p>
            </div>
          </div>

          {/* Summary badge */}
          <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 mb-4 font-mono">
            <span>Enrolled Students: <strong>{students.length}</strong></span>
            <span>Sections: <strong>{sections.length}</strong></span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" /> Biometrics Ready
            </span>
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/70 dark:border-slate-800 text-center mb-4">
            <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
              <img
                src={qrImageUrl}
                alt="Scan to sync with phone"
                className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                loading="eager"
              />
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium mt-3 max-w-xs leading-relaxed">
              Open your <strong>phone camera</strong> or QR scanner and point it at this code. The student and section records will immediately sync!
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5">
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Sync Link Copied to Clipboard!' : 'Copy Direct Phone Sync Link'}</span>
            </button>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleDownloadBackup}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
                title="Download JSON file backup"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export File</span>
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Import File</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {importNotice && (
            <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300 text-center">
              {importNotice}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

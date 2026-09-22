import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { EventType } from '@/types/domain.types';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { getStoredStudents, getStoredSections, isValidUUID, generateUUID } from '@/features/faceRegistration/api';
import { Student as FRStudent, Section as FRSection } from '@/features/faceRegistration/types';
import { QrCode, UserCheck } from 'lucide-react';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [students, setStudents] = useState<FRStudent[]>([]);
  const [sections, setSections] = useState<FRSection[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [lrn, setLrn] = useState('');
  const [sectionName, setSectionName] = useState('Grade 10 – Sampaguita');
  const [eventType, setEventType] = useState<EventType>('entry');
  const [roomName, setRoomName] = useState('Main Gate Turnstile 01');
  const [error, setError] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'roster' | 'manual' | 'qr_rfid'>('roster');
  const [scannedCode, setScannedCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      const studentList = getStoredStudents();
      const secList = getStoredSections();
      setStudents(studentList);
      setSections(secList);
      if (studentList.length > 0 && !selectedStudentId) {
        const first = studentList[0]!;
        setSelectedStudentId(first.id);
        setStudentName(first.name);
        setLrn(first.studentNumber);
        setSectionName(first.sectionName || 'Grade 10 – Sampaguita');
      }
    }
  }, [isOpen]);

  const handleStudentSelect = (id: string) => {
    setSelectedStudentId(id);
    const found = students.find(s => s.id === id);
    if (found) {
      setStudentName(found.name);
      setLrn(found.studentNumber);
      setSectionName(found.sectionName || 'Grade 10 – Sampaguita');
    }
  };

  const handleQrScan = (code: string) => {
    setScannedCode(code);
    const clean = code.trim();
    // Match by LRN or ID
    const found = students.find(s => s.studentNumber === clean || s.id === clean || s.name.toLowerCase() === clean.toLowerCase());
    if (found) {
      setSelectedStudentId(found.id);
      setStudentName(found.name);
      setLrn(found.studentNumber);
      setSectionName(found.sectionName || 'Grade 10 – Sampaguita');
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanLrn = lrn.trim();
    const cleanName = studentName.trim();

    if (!cleanName) {
      setError('Student full name is required.');
      return;
    }

    if (!/^\d{12}$/.test(cleanLrn)) {
      setError('Student LRN must be exactly 12 numeric digits.');
      return;
    }

    // Use matched student's ID or generate a valid UUID
    const matched = students.find(s => s.studentNumber === cleanLrn || s.id === selectedStudentId);
    const finalStudentId = (matched && isValidUUID(matched.id))
      ? matched.id
      : (isValidUUID(selectedStudentId) ? selectedStudentId : generateUUID());

    await supabaseRecognitionAdapter.logManualEvent({
      student_id: finalStudentId,
      student_name: cleanName,
      student_lrn: cleanLrn,
      student_photo: matched?.registeredPhotos?.front || matched?.photoUrl,
      section_name: sectionName,
      event_type: eventType,
      room_name: roomName,
    });

    onSuccess();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Gate Attendance & Card Scan"
      subtitle="Log entry/exit via Student Roster, QR/RFID Card Scan, or Manual Override"
    >
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            type="button"
            onClick={() => setEntryMode('roster')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              entryMode === 'roster'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Enrolled Roster
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('qr_rfid')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              entryMode === 'qr_rfid'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            QR / RFID Scan
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('manual')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              entryMode === 'manual'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Manual Form
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {entryMode === 'qr_rfid' && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Scan Student ID Badge or Tap RFID Card
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={scannedCode}
                  onChange={e => handleQrScan(e.target.value)}
                  placeholder="Paste or scan QR / 12-digit LRN..."
                  className="flex-1 px-3 py-2 text-xs md:text-sm font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Plug in any USB barcode/RFID scanner or type the student's 12-digit LRN.
              </p>
            </div>
          )}

          {entryMode === 'roster' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Select Enrolled Student
              </label>
              <select
                value={selectedStudentId}
                onChange={e => handleStudentSelect(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} — LRN: {s.studentNumber} ({s.sectionName || 'Section'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Student Full Name
            </label>
            <input
              type="text"
              required
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              placeholder="e.g. Maria Clara De Los Santos"
              className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                LRN (12 Digits)
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={lrn}
                onChange={e => setLrn(e.target.value)}
                placeholder="109823456799"
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Section
              </label>
              <select
                value={sectionName}
                onChange={e => setSectionName(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {sections.length > 0 ? (
                  sections.map(sec => (
                    <option key={sec.id} value={sec.name}>{sec.name}</option>
                  ))
                ) : (
                  <>
                    <option value="Grade 10 – Sampaguita">Grade 10 – Sampaguita</option>
                    <option value="Grade 11 – STEM A">Grade 11 – STEM A</option>
                    <option value="Grade 12 – ABM A">Grade 12 – ABM A</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Event Action
              </label>
              <select
                value={eventType}
                onChange={e => setEventType(e.target.value as EventType)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="entry">Campus Gate Entry (Time-In)</option>
                <option value="exit">Campus Gate Exit (Time-Out)</option>
                <option value="classroom_checkin">Classroom Check-in</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Location / Gate
              </label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 shadow-sm"
            >
              Log Gate Scan
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

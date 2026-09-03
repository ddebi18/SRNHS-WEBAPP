import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { EventType } from '@/types/domain.types';
import { mockRecognitionAdapter } from '../services/MockRecognitionAdapter';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [studentName, setStudentName] = useState('');
  const [lrn, setLrn] = useState('');
  const [sectionName, setSectionName] = useState('Grade 10 – Sampaguita');
  const [eventType, setEventType] = useState<EventType>('entry');
  const [roomName, setRoomName] = useState('Main Gate Turnstile 01');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanLrn = lrn.trim();
    const cleanName = studentName.trim();

    if (!/^\d{12}$/.test(cleanLrn)) {
      setError('Student LRN must be exactly 12 numeric digits.');
      return;
    }

    if (!cleanName) {
      setError('Student full name is required.');
      return;
    }

    await mockRecognitionAdapter.logManualEvent({
      student_id: `std-man-${Date.now()}`,
      student_name: cleanName,
      student_lrn: cleanLrn,
      section_name: sectionName,
      event_type: eventType,
      room_name: roomName,
    });

    setStudentName('');
    setLrn('');
    onSuccess();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Attendance / Gate Entry Override"
      subtitle="Log an explicit manual entry when a student's facial scan is missed or unavailable"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
            {error}
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
              <option value="Grade 10 – Sampaguita">Grade 10 – Sampaguita</option>
              <option value="Grade 11 – STEM A">Grade 11 – STEM A</option>
              <option value="Grade 12 – ABM A">Grade 12 – ABM A</option>
              <option value="Grade 7 – Gumamela">Grade 7 – Gumamela</option>
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
              <option value="entry">Campus Gate Entry</option>
              <option value="exit">Campus Gate Exit</option>
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
            Log Manual Entry
          </button>
        </div>
      </form>
    </Modal>
  );
};

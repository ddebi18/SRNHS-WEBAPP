import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  CheckCircle2,
  Camera,
  AlertCircle,
  ShieldCheck,
  BookOpen,
  UserPlus,
} from 'lucide-react';
import { Student, Section, FaceRegistrationStatus } from '../types';
import { fetchSections, fetchSectionRoster, addNewStudent } from '../api';
import { StudentRosterRow } from './StudentRosterRow';
import { FaceCaptureModal } from './FaceCaptureModal';
import { ViewRegisteredFaceModal } from './ViewRegisteredFaceModal';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

export const SectionRosterEnrollment: React.FC<{ initialSectionId?: string }> = ({
  initialSectionId = 'sec-101',
}) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(initialSectionId);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FaceRegistrationStatus | 'all'>('all');
  
  // Modal State
  const [selectedStudentForCapture, setSelectedStudentForCapture] = useState<Student | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudentForViewing, setSelectedStudentForViewing] = useState<Student | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Enroll New Student Modal State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [enrollLrn, setEnrollLrn] = useState('');
  const [enrollFirstName, setEnrollFirstName] = useState('');
  const [enrollLastName, setEnrollLastName] = useState('');
  const [enrollGuardianName, setEnrollGuardianName] = useState('');
  const [enrollGuardianPhone, setEnrollGuardianPhone] = useState('');
  const [enrollSectionId, setEnrollSectionId] = useState(selectedSectionId);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);

  // Load sections on mount
  useEffect(() => {
    fetchSections().then(data => {
      setSections(data);
      if (data.length > 0 && !selectedSectionId) {
        setSelectedSectionId(data[0]!.id);
      }
    });
  }, []);

  // Fetch roster whenever selected section changes
  useEffect(() => {
    if (!selectedSectionId) return;
    setLoading(true);
    fetchSectionRoster(selectedSectionId).then(data => {
      setStudents(data);
      setLoading(false);
    });
  }, [selectedSectionId]);

  const reloadRoster = () => {
    if (!selectedSectionId) return;
    fetchSectionRoster(selectedSectionId).then(setStudents);
  };

  const handleOpenCaptureModal = (student: Student) => {
    setSelectedStudentForCapture(student);
    setIsModalOpen(true);
  };

  const handleOpenViewModal = (student: Student) => {
    setSelectedStudentForViewing(student);
    setIsViewModalOpen(true);
  };

  const handleRegistrationSuccess = (studentId: string) => {
    const s = students.find(item => item.id === studentId);
    const name = s ? s.name : 'Student';
    setToastMessage(`Biometric face registration for ${name} was verified and saved.`);
    setTimeout(() => setToastMessage(null), 4500);
    reloadRoster();
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);

    const cleanLrn = enrollLrn.trim();
    const cleanFirst = enrollFirstName.trim();
    const cleanLast = enrollLastName.trim();

    if (!/^\d{12}$/.test(cleanLrn)) {
      setEnrollError('Learner Reference Number (LRN) must be exactly 12 numeric digits.');
      return;
    }

    if (!cleanFirst || !cleanLast) {
      setEnrollError('First name and last name are required.');
      return;
    }

    let cleanPhone = '+639170000000';
    if (enrollGuardianPhone.trim()) {
      const rawPhone = enrollGuardianPhone.trim().replace(/[\s-]/g, '');
      if (!/^(\+639\d{9}|09\d{9}|9\d{9})$/.test(rawPhone)) {
        setEnrollError('Guardian phone must be a valid Philippine mobile number (e.g. +639171234567 or 09171234567).');
        return;
      }
      cleanPhone = rawPhone.startsWith('09') ? `+63${rawPhone.slice(1)}` : rawPhone.startsWith('9') ? `+63${rawPhone}` : rawPhone;
    }

    setIsSubmittingEnroll(true);
    try {
      const targetSec = sections.find(s => s.id === enrollSectionId) || sections.find(s => s.id === selectedSectionId) || sections[0]!;
      const newStudent = await addNewStudent({
        name: `${cleanFirst} ${cleanLast}`,
        studentNumber: cleanLrn,
        sectionId: targetSec.id,
        sectionName: targetSec.name,
        guardianName: enrollGuardianName.trim() || 'Parent / Guardian',
        guardianPhone: cleanPhone,
      });

      if (selectedSectionId !== targetSec.id) {
        setSelectedSectionId(targetSec.id);
      } else {
        reloadRoster();
      }

      fetchSections().then(setSections);

      setToastMessage(`${newStudent.name} enrolled in ${targetSec.name}. You can now register their face.`);
      setTimeout(() => setToastMessage(null), 5000);

      setEnrollLrn('');
      setEnrollFirstName('');
      setEnrollLastName('');
      setEnrollGuardianName('');
      setEnrollGuardianPhone('');
      setIsEnrollModalOpen(false);
    } catch (err: any) {
      setEnrollError(err?.message || 'Failed to enroll student.');
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  // Filtered Students
  const filteredStudents = students.filter(s => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.studentNumber.includes(searchQuery);
    const matchesStatus = statusFilter === 'all' || s.faceRegistrationStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const totalCount = students.length;
  const registeredCount = students.filter(s => s.faceRegistrationStatus === 'registered').length;
  const needsReviewCount = students.filter(s => s.faceRegistrationStatus === 'needs_review').length;
  const unregisteredCount = students.filter(s => s.faceRegistrationStatus === 'unregistered').length;
  const completionRate = totalCount > 0 ? Math.round((registeredCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-[#1B4332] text-white shadow-2xl border border-[#2D6A4F] flex items-center gap-3 text-xs font-bold"
          >
            <div className="w-7 h-7 rounded-xl bg-[#2D6A4F] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            </div>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#1B4332] text-white text-[11px] font-black uppercase tracking-wider">
              Teacher Assisted Enrollment
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Biometric Edge Turnstile System
            </span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Section Face Registration
          </h1>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            Enroll students' facial recognition embeddings using your device camera while student is physically present.
          </p>
        </div>

        {/* Section Selector Dropdown & Enroll Student Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
            <select
              value={selectedSectionId}
              onChange={e => setSelectedSectionId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              {sections.map(sec => (
                <option key={sec.id} value={sec.id} className="dark:bg-slate-900">
                  {sec.name} ({sec.gradeLevel})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setEnrollSectionId(selectedSectionId);
              setEnrollError(null);
              setIsEnrollModalOpen(true);
            }}
            className="px-4 py-3 rounded-2xl bg-[#1B4332] hover:bg-[#2D6A4F] text-white text-xs font-bold flex items-center gap-2 shadow-card-sm transition-all"
          >
            <UserPlus className="w-4 h-4 text-emerald-300" />
            <span>Enroll Student</span>
          </button>
        </div>
      </div>

      {/* Roster Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#D4A373] to-[#C68B59] text-amber-950 border border-[#ba8b5b] shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-950/70 mb-1">Roster Registered</div>
            <div className="text-3xl font-black text-amber-950">{registeredCount} / {totalCount}</div>
            <div className="text-xs font-medium text-amber-900 mt-1">{completionRate}% section enrolled</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-950/20 flex items-center justify-center text-amber-950 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#E6CCB2] to-[#D4A373] text-amber-950 border border-[#d1b397] shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-950/70 mb-1">Pending Enrollment</div>
            <div className="text-3xl font-black text-amber-950">{unregisteredCount}</div>
            <div className="text-xs font-medium text-amber-900 mt-1">Awaiting webcam scan</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-950/20 flex items-center justify-center text-amber-950 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#DDA15E] to-[#C68B59] text-amber-950 border border-[#c28846] shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-950/70 mb-1">Needs Review</div>
            <div className="text-3xl font-black text-amber-950">{needsReviewCount}</div>
            <div className="text-xs font-medium text-amber-900 mt-1">Quality flag review</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-950/20 flex items-center justify-center text-amber-950 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-3xl p-5 bg-gradient-to-br from-[#C68B59] to-[#836452] text-amber-50 border border-[#806143] shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-amber-100/80 mb-1">Guardian Consent</div>
            <div className="text-3xl font-black text-white">100%</div>
            <div className="text-xs font-medium text-amber-100 mt-1">Archived on file</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search student name or LRN..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2D6A4F]"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Roster' },
            { id: 'unregistered', label: 'Not Registered' },
            { id: 'registered', label: 'Registered' },
            { id: 'needs_review', label: 'Needs Review' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap',
                statusFilter === tab.id
                  ? 'bg-[#1B4332] text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student Roster List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-xs font-bold text-slate-500">
            Loading section roster records...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-2">
            <Users className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">No students match search or filter</div>
            <p className="text-xs text-slate-500">Try clearing your search query or switching section scope.</p>
          </div>
        ) : (
          filteredStudents.map(student => (
            <StudentRosterRow
              key={student.id}
              student={student}
              onOpenCapture={handleOpenCaptureModal}
              onViewFace={handleOpenViewModal}
            />
          ))
        )}
      </div>

      {/* Face Capture Dialog Modal */}
      <FaceCaptureModal
        student={selectedStudentForCapture}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleRegistrationSuccess}
      />

      {/* View Registered Face Photos Modal */}
      <ViewRegisteredFaceModal
        student={selectedStudentForViewing}
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        onReRegister={student => {
          setIsViewModalOpen(false);
          handleOpenCaptureModal(student);
        }}
      />

      {/* Enroll New Student Modal */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Enroll New Student to Section"
        subtitle="Add student to roster for biometric facial registration"
      >
        <form onSubmit={handleEnrollStudent} className="space-y-4">
          {enrollError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {enrollError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              LRN (Learner Reference Number - 12 Digits)
            </label>
            <input
              required
              maxLength={12}
              type="text"
              value={enrollLrn}
              onChange={e => setEnrollLrn(e.target.value)}
              placeholder="e.g. 109823456799"
              className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
              <input
                required
                type="text"
                value={enrollFirstName}
                onChange={e => setEnrollFirstName(e.target.value)}
                placeholder="First Name"
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
              <input
                required
                type="text"
                value={enrollLastName}
                onChange={e => setEnrollLastName(e.target.value)}
                placeholder="Last Name"
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Target Section</label>
            <select
              value={enrollSectionId}
              onChange={e => setEnrollSectionId(e.target.value)}
              className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
            >
              {sections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name} ({sec.gradeLevel})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Primary Guardian Contact</h5>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Guardian Full Name"
                value={enrollGuardianName}
                onChange={e => setEnrollGuardianName(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                placeholder="+639171234567"
                value={enrollGuardianPhone}
                onChange={e => setEnrollGuardianPhone(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsEnrollModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEnroll}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-[#1B4332] hover:bg-[#2D6A4F] text-white transition-colors"
            >
              {isSubmittingEnroll ? 'Enrolling…' : 'Enroll Student'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

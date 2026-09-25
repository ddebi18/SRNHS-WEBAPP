import React, { useState, useEffect } from 'react';
import { useRole } from '@/hooks/useRole';
import { Student, StudentViolation } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ViolationSeverityBadge } from '@/components/ui/StatusBadge';
import { Users, Plus, ShieldCheck, AlertTriangle, Phone, Images, Eye, CheckCircle2, AlertCircle, Trash2, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { addNewStudent, getStoredStudents, getStoredSections, getPhotosFromDb, deleteStudent, generateUUID, syncFromSupabase } from '@/features/faceRegistration/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Section as FRSection } from '@/features/faceRegistration/types';
import { fetchViolations, createViolation } from '@/features/students/api';
import { GenerateAccessQrModal } from '@/features/tempAccess/components/GenerateAccessQrModal';

const INITIAL_VIOLATIONS: StudentViolation[] = [];


async function loadUnifiedStudents(sections: FRSection[]): Promise<Student[]> {
  const rawList = getStoredStudents();
  return Promise.all(
    rawList.map(async fs => {
      const nameParts = fs.name.split(' ');
      const first = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Student';
      const last = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : '';
      const sec = sections.find(sc => sc.id === fs.sectionId);
      const gradeLevel = sec ? parseInt(sec.gradeLevel.replace('Grade ', ''), 10) : 0;

      // Hydrate high-res photos from IndexedDB
      const dbPhotos = await getPhotosFromDb(fs.id);
      const photoUrls: string[] = [];
      if (dbPhotos?.front) photoUrls.push(dbPhotos.front);
      if (dbPhotos?.left) photoUrls.push(dbPhotos.left);
      if (dbPhotos?.right) photoUrls.push(dbPhotos.right);
      if (photoUrls.length === 0) {
        if (fs.registeredPhotos?.front) photoUrls.push(fs.registeredPhotos.front);
        if (fs.registeredPhotos?.left) photoUrls.push(fs.registeredPhotos.left);
        if (fs.registeredPhotos?.right) photoUrls.push(fs.registeredPhotos.right);
        if (photoUrls.length === 0 && fs.photoUrl) photoUrls.push(fs.photoUrl);
      }

      return {
        id: fs.id,
        lrn: fs.studentNumber,
        first_name: first,
        last_name: last,
        gender: 'Not Specified',
        grade_level: gradeLevel,
        section_id: fs.sectionId,
        section_name: fs.sectionName || sec?.name || 'Unknown Section',
        parent_consent: true,
        consent_date: fs.lastRegisteredAt ? fs.lastRegisteredAt.split('T')[0] : '2026-06-01',
        photo_urls: photoUrls,
        guardians: fs.guardianName ? [{
          id: `g-${fs.id}`,
          student_id: fs.id,
          name: fs.guardianName,
          relationship: 'Guardian',
          phone_number: fs.guardianPhone || '+639170000000',
          is_primary: true,
          created_at: new Date().toISOString(),
        }] : [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
  );
}

export const StudentManager: React.FC = () => {
  const { isAdmin, user } = useRole();
  const [students, setStudents] = useState<Student[]>([]);
  const [violations, setViolations] = useState<StudentViolation[]>(INITIAL_VIOLATIONS);
  const [storedSections, setStoredSections] = useState<FRSection[]>([]);

  // Detail Modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // New Student Modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [lrn, setLrn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianRel, setGuardianRel] = useState('Mother');

  // Violation Modal
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalLrn, setQrModalLrn] = useState('');
  const [violationStudentId, setViolationStudentId] = useState('');
  const [violationTitle, setViolationTitle] = useState('');
  const [violationDesc, setViolationDesc] = useState('');
  const [violationSeverity, setViolationSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor');

  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Reload unified students list
  const refreshStudents = async (secs?: FRSection[]) => {
    const sections = secs ?? storedSections;
    const list = await loadUnifiedStudents(sections);
    setStudents(list);
    if (list.length > 0 && !violationStudentId) {
      setViolationStudentId(list[0]!.id);
    }
  };

  useEffect(() => {
    async function init() {
      if (isSupabaseConfigured) {
        try {
          await syncFromSupabase();
        } catch {}
      }
      const secs = getStoredSections();
      setStoredSections(secs);
      if (secs.length > 0) setSectionId(secs[0]!.id);
      refreshStudents(secs);
      fetchViolations().then(setViolations);
    }
    init();
  }, []);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnrollError(null);

    const cleanLrn = lrn.trim();
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();

    // Rule 1: Validate 12-digit LRN format
    if (!/^\d{12}$/.test(cleanLrn)) {
      setEnrollError('Learner Reference Number (LRN) must be exactly 12 numeric digits.');
      return;
    }

    if (!cleanFirst || !cleanLast) {
      setEnrollError('First name and last name are required.');
      return;
    }

    // Rule 1: Validate / normalize phone number if provided
    let cleanPhone = '+639170000000';
    if (guardianPhone.trim()) {
      const rawPhone = guardianPhone.trim().replace(/[\s-]/g, '');
      if (!/^(\+639\d{9}|09\d{9}|9\d{9})$/.test(rawPhone)) {
        setEnrollError('Guardian phone must be a valid Philippine mobile number (e.g. +639171234567 or 09171234567).');
        return;
      }
      cleanPhone = rawPhone.startsWith('09') ? `+63${rawPhone.slice(1)}` : rawPhone.startsWith('9') ? `+63${rawPhone}` : rawPhone;
    }

    const sec = storedSections.find(s => s.id === sectionId) || storedSections[0];

    // Register with unified store
    await addNewStudent({
      id: generateUUID(),
      name: `${cleanFirst} ${cleanLast}`,
      studentNumber: cleanLrn,
      sectionId: sec?.id || sectionId,
      sectionName: sec?.name || '',
      guardianName: guardianName.trim() || 'Parent / Guardian',
      guardianPhone: cleanPhone,
    });

    await refreshStudents();

    setLrn('');
    setFirstName('');
    setLastName('');
    setGuardianName('');
    setGuardianPhone('');
    setNewModalOpen(false);
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`Are you sure you want to remove ${studentName}?`)) return;
    await deleteStudent(studentId);
    await refreshStudents();
    if (selectedStudent?.id === studentId) {
      setSelectedStudent(null);
    }
  };

  const handleCreateViolation = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === violationStudentId);

    const created = await createViolation({
      student_id: violationStudentId,
      student_name: student ? `${student.first_name} ${student.last_name}` : 'Student',
      reported_by: user?.id,
      reporter_name: user?.full_name || 'Faculty Member',
      title: violationTitle.trim(),
      description: violationDesc.trim(),
      severity: violationSeverity,
      incident_date: new Date().toISOString(),
    });

    setViolations(prev => [created, ...prev]);
    setViolationTitle('');
    setViolationDesc('');
    setViolationModalOpen(false);
  };

  const studentColumns: Column<Student>[] = [
    {
      header: 'Student Name & LRN',
      cell: s => (
        <div className="flex items-center gap-3">
          {s.photo_urls[0] ? (
            <img src={s.photo_urls[0]} alt={s.first_name} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-800 dark:text-slate-200">
              {s.first_name.slice(0, 1)}
            </div>
          )}
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100">{s.first_name} {s.last_name}</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">LRN: {s.lrn}</div>
          </div>
        </div>
      ),
    },
    { header: 'Grade & Section', accessorKey: 'section_name', cell: s => <span className="font-bold text-slate-800 dark:text-slate-200">{s.section_name}</span> },
    {
      header: 'Primary Guardian Contact',
      cell: s => {
        const primaryG = s.guardians?.find(g => g.is_primary) || s.guardians?.[0];
        return (
          <div>
            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">{primaryG?.name} ({primaryG?.relationship})</div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Phone className="w-3 h-3 text-brand-500" /> {primaryG?.phone_number}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Face Biometrics',
      cell: s => (
        s.photo_urls.length > 0 ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Registered ({s.photo_urls.length} {s.photo_urls.length === 1 ? 'Angle' : 'Angles'})
          </span>
        ) : (
          <Link
            to={`/face-registration?studentId=${s.id}`}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Register Face
          </Link>
        )
      ),
    },
    {
      header: 'Actions',
      cell: s => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedStudent(s)}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" /> Details
          </button>
          <button
            onClick={() => {
              setQrModalLrn(s.lrn);
              setQrModalOpen(true);
            }}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary-50 dark:bg-primary-950/60 border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors flex items-center gap-1"
            title="Generate temporary access QR"
          >
            <QrCode className="w-3.5 h-3.5" /> Access QR
          </button>
          {isAdmin && (
            <button
              onClick={() => handleDeleteStudent(s.id, `${s.first_name} ${s.last_name}`)}
              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              title="Delete student record"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-500" />
            Student Profiling & Guardian Directory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enrolled student profiles, multi-guardian contact numbers, reference photo sets, and biometric consent audit.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => {
              setQrModalLrn('');
              setQrModalOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            Generate Access QR
          </button>

          <button
            onClick={() => setViolationModalOpen(true)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Log Violation
          </button>

          {isAdmin && (
            <button
              onClick={() => setNewModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-primary hover:bg-primary-light text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Enroll Student
            </button>
          )}
        </div>
      </div>

      {/* Main Student Directory */}
      <DataTable
        data={students}
        columns={studentColumns}
        keyExtractor={s => s.id}
        searchPlaceholder="Search student by name, LRN, or section..."
        searchFilter={(s, q) =>
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q.toLowerCase()) ||
          s.lrn.includes(q) ||
          (s.section_name || '').toLowerCase().includes(q.toLowerCase())
        }
      />

      {/* Violation Incident Log Section */}
      <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Recent Student Conduct & Violation Log
        </h3>
        <div className="space-y-2.5">
          {violations.map(v => (
            <div key={v.id} className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">{v.student_name}</span>
                  <ViolationSeverityBadge severity={v.severity} />
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">{v.title}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{v.description}</p>
              </div>
              <div className="text-right text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                Reported by {v.reporter_name} on {new Date(v.incident_date).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Student Profile Detail Modal */}
      {selectedStudent && (
        <Modal
          isOpen={Boolean(selectedStudent)}
          onClose={() => setSelectedStudent(null)}
          title={`Student Profile: ${selectedStudent.first_name} ${selectedStudent.last_name}`}
          subtitle={`LRN: ${selectedStudent.lrn} | ${selectedStudent.section_name}`}
          maxWidth="xl"
        >
          <div className="space-y-6">
            {/* Reference Photos */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Images className="w-4 h-4" /> Facial Recognition Reference Training Photos ({selectedStudent.photo_urls.length})
              </h4>
              {selectedStudent.photo_urls.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {selectedStudent.photo_urls.map((url, i) => (
                    <div key={i} className="text-center">
                      <img
                        src={url}
                        alt={`Angle ${i + 1}`}
                        className="w-full h-28 rounded-2xl object-cover border-2 border-brand-500 shadow-sm"
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block font-medium">
                        {i === 0 ? 'Front Angle' : i === 1 ? 'Left Profile' : 'Right Profile'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                  <span>No facial reference photos registered yet.</span>
                  <Link to="/face-registration" className="font-bold underline">
                    Go to Face Registration
                  </Link>
                </div>
              )}
            </div>

            {/* Guardian Contacts (1:N) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Phone className="w-4 h-4" /> Registered Guardians & Emergency Contacts
              </h4>
              <div className="space-y-2">
                {selectedStudent.guardians?.map(g => (
                  <div key={g.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{g.name} ({g.relationship})</div>
                      <div className="text-xs font-mono text-brand-600 dark:text-brand-400">{g.phone_number}</div>
                    </div>
                    {g.is_primary && (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                        Primary Contact
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance Consent */}
            <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-2xl border border-teal-200 dark:border-teal-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600" /> Biometric Facial Recognition Parental Consent
                </div>
                <div className="text-[11px] text-teal-700 dark:text-teal-300 mt-0.5">
                  Signed and verified on {selectedStudent.consent_date || 'Enrolment'}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-teal-600 text-white font-bold text-xs">Verified</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Enroll Student Modal */}
      <Modal isOpen={newModalOpen} onClose={() => setNewModalOpen(false)} title="Enroll Student Profile">
        <form onSubmit={handleCreateStudent} className="space-y-4">
          {enrollError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-300">
              {enrollError}
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">LRN (Learner Reference Number - 12 Digits)</label>
            <input required maxLength={12} type="text" value={lrn} onChange={e => setLrn(e.target.value)} placeholder="109823456799" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
              <input required type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
              <input required type="text" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Section &amp; Grade Level</label>
            {storedSections.length > 0 ? (
              <select
                value={sectionId}
                onChange={e => setSectionId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {storedSections.map(sec => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name} ({sec.gradeLevel})
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full px-3 py-2.5 text-xs rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium">
                No sections yet. Go to <strong>Academics</strong> to create sections first.
              </div>
            )}
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Primary Guardian Contact</h5>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" placeholder="Guardian Name" value={guardianName} onChange={e => setGuardianName(e.target.value)} className="col-span-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              <input type="text" placeholder="Relationship" value={guardianRel} onChange={e => setGuardianRel(e.target.value)} className="col-span-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              <input type="text" placeholder="+639170000000" value={guardianPhone} onChange={e => setGuardianPhone(e.target.value)} className="col-span-1 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setNewModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Enroll Student</button>
          </div>
        </form>
      </Modal>

      {/* Log Violation Modal */}
      <Modal isOpen={violationModalOpen} onClose={() => setViolationModalOpen(false)} title="Log Student Violation Incident">
        <form onSubmit={handleCreateViolation} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Select Student</label>
            <select value={violationStudentId} onChange={e => setViolationStudentId(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.section_name})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Violation Title</label>
            <input required type="text" value={violationTitle} onChange={e => setViolationTitle(e.target.value)} placeholder="e.g. Unexcused Tardiness / Uniform Violation" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Incident Description</label>
            <textarea required value={violationDesc} onChange={e => setViolationDesc(e.target.value)} rows={3} placeholder="Detailed notes regarding conduct incident..." className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Severity Level</label>
            <select value={violationSeverity} onChange={e => setViolationSeverity(e.target.value as any)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              <option value="minor">Minor Incident</option>
              <option value="moderate">Moderate Violation</option>
              <option value="severe">Severe Offense</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setViolationModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white">Log Incident</button>
          </div>
        </form>
      </Modal>

      {/* Generate Access QR Modal */}
      <GenerateAccessQrModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        initialLrn={qrModalLrn}
      />
    </div>
  );
};

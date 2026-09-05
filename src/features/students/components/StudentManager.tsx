import React, { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { Student, StudentViolation } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ConsentBadge, ViolationSeverityBadge } from '@/components/ui/StatusBadge';
import { Users, Plus, ShieldCheck, AlertTriangle, Phone, Image as ImageIcon, Eye } from 'lucide-react';

const INITIAL_STUDENTS: Student[] = [
  {
    id: 'std-101',
    lrn: '109823456701',
    first_name: 'Juan Carlos',
    last_name: 'Garcia',
    gender: 'Male',
    grade_level: 10,
    section_id: 'sec-101',
    section_name: 'Grade 10 – Sampaguita',
    parent_consent: true,
    consent_date: '2026-06-01',
    photo_urls: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=300&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    ],
    guardians: [
      { id: 'g-1', student_id: 'std-101', name: 'Mrs. Elena Garcia', relationship: 'Mother', phone_number: '+639171234567', is_primary: true, created_at: '' },
      { id: 'g-2', student_id: 'std-101', name: 'Mr. Carlos Garcia', relationship: 'Father', phone_number: '+639179998877', is_primary: false, created_at: '' },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'std-102',
    lrn: '109823456702',
    first_name: 'Sophia Nicole',
    last_name: 'Reyes',
    gender: 'Female',
    grade_level: 10,
    section_id: 'sec-101',
    section_name: 'Grade 10 – Sampaguita',
    parent_consent: true,
    consent_date: '2026-06-05',
    photo_urls: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300&auto=format&fit=crop&q=80'],
    guardians: [
      { id: 'g-3', student_id: 'std-102', name: 'Mrs. Beatriz Reyes', relationship: 'Mother', phone_number: '+639189876543', is_primary: true, created_at: '' },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'std-103',
    lrn: '109823456703',
    first_name: 'Angelo Gabriel',
    last_name: 'Mendoza',
    gender: 'Male',
    grade_level: 11,
    section_id: 'sec-102',
    section_name: 'Grade 11 – STEM A',
    parent_consent: true,
    consent_date: '2026-06-10',
    photo_urls: ['https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'],
    guardians: [
      { id: 'g-4', student_id: 'std-103', name: 'Mr. Gabriel Mendoza', relationship: 'Father', phone_number: '+639194443322', is_primary: true, created_at: '' },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_VIOLATIONS: StudentViolation[] = [
  {
    id: 'v-001',
    student_id: 'std-101',
    student_name: 'Juan Carlos Garcia',
    reported_by: 'usr-teacher-101',
    reporter_name: 'Mr. Juan Dela Cruz',
    title: 'Improper Uniform Conduct',
    description: 'Student entered campus without prescribing school ID and uniform pin.',
    severity: 'minor',
    incident_date: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: new Date().toISOString(),
  },
];

export const StudentManager: React.FC = () => {
  const { isAdmin, user } = useRole();
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [violations, setViolations] = useState<StudentViolation[]>(INITIAL_VIOLATIONS);

  // Detail Modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // New Student Modal
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [lrn, setLrn] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender] = useState('Male');
  const [gradeLevel, setGradeLevel] = useState(10);
  const [sectionName, setSectionName] = useState('Grade 10 – Sampaguita');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianRel, setGuardianRel] = useState('Mother');

  // Violation Modal
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [violationStudentId, setViolationStudentId] = useState('std-101');
  const [violationTitle, setViolationTitle] = useState('');
  const [violationDesc, setViolationDesc] = useState('');
  const [violationSeverity, setViolationSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor');

  const [enrollError, setEnrollError] = useState<string | null>(null);

  const handleCreateStudent = (e: React.FormEvent) => {
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

    const newStd: Student = {
      id: `std-${Date.now()}`,
      lrn: cleanLrn,
      first_name: cleanFirst,
      last_name: cleanLast,
      gender,
      grade_level: Number(gradeLevel),
      section_id: `sec-${Date.now()}`,
      section_name: sectionName,
      parent_consent: true,
      consent_date: new Date().toISOString().split('T')[0],
      photo_urls: ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'],
      guardians: [
        {
          id: `g-${Date.now()}`,
          student_id: `std-${Date.now()}`,
          name: guardianName.trim() || 'Parent / Guardian',
          relationship: guardianRel,
          phone_number: cleanPhone,
          is_primary: true,
          created_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setStudents(prev => [...prev, newStd]);
    setLrn('');
    setFirstName('');
    setLastName('');
    setGuardianName('');
    setGuardianPhone('');
    setNewModalOpen(false);
  };

  const handleCreateViolation = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === violationStudentId);

    const newV: StudentViolation = {
      id: `v-${Date.now()}`,
      student_id: violationStudentId,
      student_name: student ? `${student.first_name} ${student.last_name}` : 'Student',
      reported_by: user?.id || 'usr-staff',
      reporter_name: user?.full_name || 'Faculty Member',
      title: violationTitle.trim(),
      description: violationDesc.trim(),
      severity: violationSeverity,
      incident_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    setViolations(prev => [newV, ...prev]);
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
      header: 'Biometric Consent',
      cell: s => <ConsentBadge consent={s.parent_consent} date={s.consent_date} />,
    },
    {
      header: 'Actions',
      cell: s => (
        <button
          onClick={() => setSelectedStudent(s)}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" /> Profile Details
        </button>
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

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setViolationModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Log Violation Incident
          </button>

          {isAdmin && (
            <button
              onClick={() => setNewModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-800 flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Enroll New Student
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
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Recent Student Conduct & Violation Log
        </h3>
        <div className="space-y-3">
          {violations.map(v => (
            <div key={v.id} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{v.student_name}</span>
                  <ViolationSeverityBadge severity={v.severity} />
                </div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">{v.title}</div>
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
                <ImageIcon className="w-4 h-4" /> Facial Recognition Reference Training Photos
              </h4>
              <div className="flex gap-3">
                {selectedStudent.photo_urls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Reference ${i + 1}`}
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-brand-500 shadow-sm"
                  />
                ))}
              </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Grade Level</label>
              <select value={gradeLevel} onChange={e => setGradeLevel(Number(e.target.value))} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                <option value={10}>Grade 10</option>
                <option value={11}>Grade 11</option>
                <option value={12}>Grade 12</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Section</label>
              <input required type="text" value={sectionName} onChange={e => setSectionName(e.target.value)} className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
            </div>
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
    </div>
  );
};

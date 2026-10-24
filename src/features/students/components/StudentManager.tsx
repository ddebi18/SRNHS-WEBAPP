import React, { useState, useEffect } from 'react';
import { useRole } from '@/hooks/useRole';
import { Student, StudentViolation, Section as DomainSection } from '@/types/domain.types';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { ViolationSeverityBadge } from '@/components/ui/StatusBadge';
import { Users, Plus, ShieldCheck, AlertTriangle, Phone, Images, Eye, CheckCircle2, AlertCircle, Trash2, QrCode, Upload, GraduationCap, MapPin, Heart, Send, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getStoredStudents, getStoredSections, getPhotosFromDb, deleteStudent, syncFromSupabase } from '@/features/faceRegistration/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Section as FRSection } from '@/features/faceRegistration/types';
import { fetchViolations, createViolation, manageGuardianInvite } from '@/features/students/api';
import { GenerateAccessQrModal } from '@/features/tempAccess/components/GenerateAccessQrModal';
import { isProfileComplete, hasMinimumGuardians } from '@/lib/validation';
import { StudentProfileModal } from './StudentProfileModal';
import { BulkStudentUploadModal } from './BulkStudentUploadModal';
import { LevelingManagerModal } from './LevelingManagerModal';
import { cn } from '@/lib/utils';

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
        consent_date: fs.lastRegisteredAt ? fs.lastRegisteredAt.split('T')[0] : undefined,
        photo_urls: photoUrls,
        guardians: fs.guardianName ? [{
          id: `g-${fs.id}`,
          student_id: fs.id,
          name: fs.guardianName,
          relationship: 'Guardian',
          phone_number: fs.guardianPhone || '',
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
  const [inviteProcessingId, setInviteProcessingId] = useState<string | null>(null);
  const [guardianInviteMsg, setGuardianInviteMsg] = useState<{ id: string; text: string; isError?: boolean } | null>(null);

  // Modals
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [levelingModalOpen, setLevelingModalOpen] = useState(false);

  // Violation Modal
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [violationStudentId, setViolationStudentId] = useState('');
  const [violationTitle, setViolationTitle] = useState('');
  const [violationDesc, setViolationDesc] = useState('');
  const [violationSeverity, setViolationSeverity] = useState<'minor' | 'moderate' | 'severe'>('minor');

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
      refreshStudents(secs);
      fetchViolations().then(setViolations);
    }
    init();
  }, []);

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
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {s.first_name} {s.middle_name ? `${s.middle_name[0]}. ` : ''}{s.last_name} {s.suffix || ''}
              </span>
              {!isProfileComplete(s) && (
                <span
                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                  title="Missing required profile fields (DepEd standard)"
                >
                  Incomplete Profile
                </span>
              )}
              {!hasMinimumGuardians(s.guardians) && (
                <span
                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                  title="Every student requires at least two registered guardians"
                >
                  Incomplete Guardians (&lt; 2)
                </span>
              )}
            </div>
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
        if (!primaryG) {
          return (
            <span className="text-[11px] italic text-slate-400 dark:text-slate-500">
              No guardian on file
            </span>
          );
        }
        return (
          <div>
            <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">
              {primaryG.name}{primaryG.relationship ? ` (${primaryG.relationship})` : ''}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Phone className="w-3 h-3 text-brand-500" />
              {primaryG.phone_number || <span className="italic text-slate-400">No number on file</span>}
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

  const domainSections: DomainSection[] = storedSections.map(fr => ({
    id: fr.id,
    name: fr.name,
    grade_level: parseInt(fr.gradeLevel.replace('Grade ', ''), 10) || 10,
    adviser_id: fr.teacherId || null,
    adviser_name: fr.teacherName !== 'Unassigned' ? fr.teacherName : undefined,
    created_at: new Date().toISOString(),
  }));

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
            onClick={() => setQrModalOpen(true)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            Registration Session QR
          </button>

          <button
            onClick={() => setViolationModalOpen(true)}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 flex items-center gap-1.5 transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Log Violation
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setLevelingModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-brand-500" />
                Leveling / Transfer
              </button>

              <button
                onClick={() => setBulkModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Bulk Upload
              </button>

              <button
                onClick={() => setNewModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-primary hover:bg-primary-light text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Enroll Student
              </button>
            </>
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
          {violations.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
              No disciplinary records logged.
            </p>
          ) : (
            violations.map(v => (
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
            ))
          )}
        </div>
      </div>

      {/* Student Profile Detail Modal */}
      {selectedStudent && (
        <Modal
          isOpen={Boolean(selectedStudent)}
          onClose={() => setSelectedStudent(null)}
          title={`Student Profile: ${selectedStudent.first_name} ${selectedStudent.last_name}`}
          subtitle={`LRN: ${selectedStudent.lrn} | ${selectedStudent.section_name}`}
          maxWidth="2xl"
        >
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* Identity & Demographics */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-500" />
                1. Identity &amp; Demographic Information
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Full Name</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {selectedStudent.first_name} {selectedStudent.middle_name || ''} {selectedStudent.last_name} {selectedStudent.suffix || ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Sex</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedStudent.sex || selectedStudent.gender || 'Not Specified'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Birth Date</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedStudent.birthdate || 'Not Recorded'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">LRN</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {selectedStudent.lrn}
                  </span>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-500" />
                2. Residential Address
              </h4>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                {[
                  selectedStudent.house_street,
                  selectedStudent.barangay,
                  selectedStudent.city_municipality,
                  selectedStudent.province,
                  selectedStudent.zip_code,
                ]
                  .filter(Boolean)
                  .join(', ') || 'No residential address on record'}
              </p>
            </div>

            {/* Socioeconomic / Personal Info */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-500" />
                3. Personal &amp; Special Categories
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Religion</span>
                  <span className="font-semibold">{selectedStudent.religion || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Mother Tongue</span>
                  <span className="font-semibold">{selectedStudent.mother_tongue || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">PWD Status</span>
                  <span className="font-semibold">{selectedStudent.is_pwd ? 'Yes (PWD)' : 'No'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">4Ps Beneficiary</span>
                  <span className="font-semibold">{selectedStudent.is_4ps ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>

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
                  <Link to={`/face-registration?studentId=${selectedStudent.id}`} className="font-bold underline">
                    Go to Face Registration
                  </Link>
                </div>
              )}
            </div>

            {/* Guardian Contacts (1:N) & Portal Invite Flow */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Phone className="w-4 h-4" /> Registered Guardians &amp; Portal Accounts ({selectedStudent.guardians?.length || 0})
                </h4>
                {(!selectedStudent.guardians || selectedStudent.guardians.length < 2) && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                    Needs {2 - (selectedStudent.guardians?.length || 0)} More Guardian(s)
                  </span>
                )}
              </div>

              <div className="space-y-2.5">
                {selectedStudent.guardians?.map(g => {
                  const gStatus = (g as any).activated_at ? 'active' : (g as any).invited_at ? 'invited' : 'not_invited';
                  const isProcessing = inviteProcessingId === g.id;
                  const feedback = guardianInviteMsg?.id === g.id ? guardianInviteMsg : null;

                  return (
                    <div key={g.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {(g as any).name || (g as any).full_name} ({g.relationship})
                            </span>
                            {g.is_primary && (
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                                Primary Contact
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-brand-600 dark:text-brand-400 mt-0.5">
                            {(g as any).phone_number || (g as any).mobile_number || 'No phone'}
                            {(g as any).email && <span className="text-slate-400 font-sans ml-2">({(g as any).email})</span>}
                          </div>
                        </div>

                        {/* Invite Status & Actions */}
                        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              gStatus === 'active' && 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300',
                              gStatus === 'invited' && 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300',
                              gStatus === 'not_invited' && 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            )}
                          >
                            {gStatus === 'active' ? 'Portal Active' : gStatus === 'invited' ? 'Invited' : 'Not Invited'}
                          </span>

                          {gStatus === 'not_invited' && (
                            <button
                              disabled={isProcessing}
                              onClick={async () => {
                                setInviteProcessingId(g.id);
                                setGuardianInviteMsg(null);
                                const res = await manageGuardianInvite({
                                  action: 'invite',
                                  guardian_id: g.id,
                                  student_id: selectedStudent.id,
                                  full_name: (g as any).name || (g as any).full_name,
                                  email: (g as any).email,
                                  mobile_number: (g as any).phone_number || (g as any).mobile_number,
                                });
                                setInviteProcessingId(null);
                                setGuardianInviteMsg({ id: g.id, text: res.message || res.error || '', isError: !res.success });
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              {isProcessing ? 'Inviting...' : 'Invite to Portal'}
                            </button>
                          )}

                          {gStatus === 'invited' && (
                            <>
                              <button
                                disabled={isProcessing}
                                onClick={async () => {
                                  setInviteProcessingId(g.id);
                                  setGuardianInviteMsg(null);
                                  const res = await manageGuardianInvite({
                                    action: 'resend',
                                    guardian_id: g.id,
                                    student_id: selectedStudent.id,
                                    full_name: (g as any).name || (g as any).full_name,
                                    email: (g as any).email,
                                    mobile_number: (g as any).phone_number || (g as any).mobile_number,
                                  });
                                  setInviteProcessingId(null);
                                  setGuardianInviteMsg({ id: g.id, text: res.message || res.error || '', isError: !res.success });
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                                title="Resend invitation link"
                              >
                                <RefreshCw className="w-3 h-3" /> Resend
                              </button>
                              <button
                                disabled={isProcessing}
                                onClick={async () => {
                                  setInviteProcessingId(g.id);
                                  setGuardianInviteMsg(null);
                                  const res = await manageGuardianInvite({
                                    action: 'revoke',
                                    guardian_id: g.id,
                                    student_id: selectedStudent.id,
                                  });
                                  setInviteProcessingId(null);
                                  setGuardianInviteMsg({ id: g.id, text: res.message || res.error || '', isError: !res.success });
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                Revoke
                              </button>
                            </>
                          )}

                          {gStatus === 'active' && (
                            <button
                              disabled={isProcessing}
                              onClick={async () => {
                                setInviteProcessingId(g.id);
                                setGuardianInviteMsg(null);
                                const res = await manageGuardianInvite({
                                  action: 'revoke',
                                  guardian_id: g.id,
                                  student_id: selectedStudent.id,
                                });
                                setInviteProcessingId(null);
                                setGuardianInviteMsg({ id: g.id, text: res.message || res.error || '', isError: !res.success });
                              }}
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-300 transition-colors disabled:opacity-50 cursor-pointer"
                              title="Revoke portal access"
                            >
                              Revoke Access
                            </button>
                          )}
                        </div>
                      </div>

                      {feedback && (
                        <p
                          className={cn(
                            'text-[11px] font-medium pt-1',
                            feedback.isError ? 'text-rose-500' : 'text-emerald-500'
                          )}
                        >
                          {feedback.text}
                        </p>
                      )}
                    </div>
                  );
                })}
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

      {/* Complete Student Profile Registration Modal */}
      <StudentProfileModal
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        sections={domainSections}
        onSuccess={() => refreshStudents()}
      />

      {/* Bulk Upload Modal */}
      <BulkStudentUploadModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        sections={domainSections}
        onSuccess={() => refreshStudents()}
      />

      {/* Leveling Manager Modal */}
      <LevelingManagerModal
        isOpen={levelingModalOpen}
        onClose={() => setLevelingModalOpen(false)}
        students={students}
        onSuccess={() => refreshStudents()}
      />

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
      />
    </div>
  );
};

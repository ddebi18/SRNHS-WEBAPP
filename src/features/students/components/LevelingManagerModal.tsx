import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Student, Section, SchoolYear, EnrollmentStatus } from '@/types/domain.types';
import { fetchSchoolYears, fetchSections, fetchSectionSubjects } from '@/features/academics/api';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { getStoredStudents, saveStoredStudents } from '@/features/faceRegistration/api';
import {
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LevelingManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onSuccess: () => void;
}

type LevelingMode = 'promotion' | 'transfer';

interface StudentLevelingRow {
  student: Student;
  selected: boolean;
  outcome: EnrollmentStatus;
  targetSectionId: string;
}

export const LevelingManagerModal: React.FC<LevelingManagerModalProps> = ({
  isOpen,
  onClose,
  students,
  onSuccess,
}) => {
  const { user } = useRole();
  const [mode, setMode] = useState<LevelingMode>('promotion');
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionSubjectsMap, setSectionSubjectsMap] = useState<Map<string, number>>(new Map());

  // Promotion Controls
  const [sourceGrade, setSourceGrade] = useState<number>(10);
  const [sourceSectionId, setSourceSectionId] = useState<string>('all');
  const [targetSchoolYearId, setTargetSchoolYearId] = useState<string>('');
  const [batchTargetSectionId, setBatchTargetSectionId] = useState<string>('');

  // Transfer Controls
  const [transferGrade, setTransferGrade] = useState<number>(10);
  const [transferTargetSectionId, setTransferTargetSectionId] = useState<string>('');

  // Row state
  const [rows, setRows] = useState<StudentLevelingRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSchoolYears().then(years => {
      setSchoolYears(years);
      if (years.length > 0) setTargetSchoolYearId(years[0]!.id);
    });
    fetchSections().then(async secs => {
      setSections(secs);
      // Cache subject counts per section
      const countMap = new Map<string, number>();
      for (const s of secs) {
        try {
          const subs = await fetchSectionSubjects(s.id);
          countMap.set(s.id, subs.length);
        } catch {
          countMap.set(s.id, 1);
        }
      }
      setSectionSubjectsMap(countMap);
    });
  }, []);

  // Filter students based on active mode
  const eligibleStudents = useMemo(() => {
    if (mode === 'promotion') {
      return students.filter(s => {
        const matchesGrade = s.grade_level === sourceGrade;
        const matchesSec = sourceSectionId === 'all' || s.section_id === sourceSectionId;
        return matchesGrade && matchesSec;
      });
    } else {
      return students.filter(s => s.grade_level === transferGrade);
    }
  }, [students, mode, sourceGrade, sourceSectionId, transferGrade]);

  // Next grade level for promotion
  const nextGradeLevel = Math.min(12, sourceGrade + 1);
  const targetSectionsForPromotion = sections.filter(s => s.grade_level === nextGradeLevel);
  const targetSectionsForTransfer = sections.filter(s => s.grade_level === transferGrade);

  useEffect(() => {
    const defaultTargetSec =
      mode === 'promotion'
        ? targetSectionsForPromotion[0]?.id || ''
        : targetSectionsForTransfer[0]?.id || '';

    setRows(
      eligibleStudents.map(st => ({
        student: st,
        selected: true,
        outcome: mode === 'promotion' ? (sourceGrade === 12 ? 'graduated' : 'promoted') : 'enrolled',
        targetSectionId: defaultTargetSec,
      }))
    );
  }, [eligibleStudents, mode, sourceGrade, transferGrade]);

  const handleApplyBatchTargetSection = (targetSecId: string) => {
    setBatchTargetSectionId(targetSecId);
    setRows(prev =>
      prev.map(r => (r.selected ? { ...r, targetSectionId: targetSecId } : r))
    );
  };

  const handleApplyBatchOutcome = (outcome: EnrollmentStatus) => {
    setRows(prev =>
      prev.map(r => (r.selected ? { ...r, outcome } : r))
    );
  };

  const handleCommitLeveling = async () => {
    setErrorMessage(null);
    setStatusMessage(null);

    const selectedRows = rows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      setErrorMessage('Please select at least one student to process.');
      return;
    }

    // Verify Rule A for target sections: target sections must have subjects
    for (const r of selectedRows) {
      if (r.outcome === 'promoted' || (mode === 'transfer' && r.targetSectionId)) {
        const subCount = sectionSubjectsMap.get(r.targetSectionId) ?? 0;
        if (subCount === 0 && sectionSubjectsMap.size > 0 && Array.from(sectionSubjectsMap.values()).some(v => v > 0)) {
          const sec = sections.find(s => s.id === r.targetSectionId);
          setErrorMessage(`Target section "${sec?.name || 'Selected'}" has zero subjects assigned (Rule A violation). Please assign subjects first.`);
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);
      const effectiveDate = new Date().toISOString().split('T')[0];

      // Update in Supabase and local storage
      const stored = getStoredStudents();

      for (const item of selectedRows) {
        const studentId = item.student.id;
        const nextGrade =
          item.outcome === 'promoted' ? nextGradeLevel : item.student.grade_level;
        const nextSectionId =
          item.outcome === 'promoted' || mode === 'transfer'
            ? item.targetSectionId
            : item.student.section_id;

        const targetSec = sections.find(s => s.id === nextSectionId);

        // 1. Mark existing enrollment as not current, insert new historical enrollment
        if (supabase && isSupabaseConfigured) {
          await supabase
            .from('enrollments')
            .update({ is_current: false })
            .eq('student_id', studentId);

          await supabase.from('enrollments').insert({
            student_id: studentId,
            school_year_id: targetSchoolYearId || null,
            grade_level: nextGrade,
            section_id: nextSectionId,
            status: item.outcome,
            effective_date: effectiveDate,
            changed_by: user?.id,
            is_current: true,
            notes: mode === 'promotion' ? `Year-end promotion to Grade ${nextGrade}` : 'Mid-year section transfer',
          });

          // 2. Update students row
          await supabase
            .from('students')
            .update({
              grade_level: nextGrade,
              section_id: nextSectionId,
            })
            .eq('id', studentId);
        }

        // 3. Update local storage
        const idx = stored.findIndex(s => s.id === studentId);
        if (idx >= 0) {
          stored[idx] = {
            ...stored[idx]!,
            sectionId: nextSectionId,
            sectionName: targetSec?.name || stored[idx]!.sectionName,
          };
        }
      }

      saveStoredStudents(stored);
      setStatusMessage(
        `Successfully processed ${selectedRows.length} student(s) for ${mode === 'promotion' ? 'year-end promotion' : 'section transfer'}.`
      );
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while updating enrollment levels.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Student Leveling & Enrollment Operations"
      subtitle="Manage official DepEd Year-End Promotions and Mid-Year Section Transfers"
      maxWidth="2xl"
    >
      <div className="space-y-4">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setMode('promotion')}
            className={cn(
              'py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2',
              mode === 'promotion'
                ? 'bg-white dark:bg-slate-900 text-primary dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            )}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Year-End Promotion</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('transfer')}
            className={cn(
              'py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2',
              mode === 'transfer'
                ? 'bg-white dark:bg-slate-900 text-primary dark:text-emerald-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            )}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Mid-Year Section Transfer</span>
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 font-semibold rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Filter & Batch Configuration Bars */}
        {mode === 'promotion' ? (
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Source Grade Level
                </label>
                <select
                  value={sourceGrade}
                  onChange={e => setSourceGrade(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  {[7, 8, 9, 10, 11, 12].map(lvl => (
                    <option key={lvl} value={lvl}>
                      Grade {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Source Section
                </label>
                <select
                  value={sourceSectionId}
                  onChange={e => setSourceSectionId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="all">All Sections</option>
                  {sections
                    .filter(s => s.grade_level === sourceGrade)
                    .map(sec => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Target School Year
                </label>
                <select
                  value={targetSchoolYearId}
                  onChange={e => setTargetSchoolYearId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  {schoolYears.map(sy => (
                    <option key={sy.id} value={sy.id}>
                      {sy.name} {sy.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Batch Helper */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600 dark:text-slate-400">Batch Target Section:</span>
                <select
                  value={batchTargetSectionId}
                  onChange={e => handleApplyBatchTargetSection(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                >
                  <option value="">Choose Target (Grade {nextGradeLevel})...</option>
                  {targetSectionsForPromotion.map(ts => (
                    <option key={ts.id} value={ts.id}>
                      {ts.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Batch Outcome:</span>
                <button
                  type="button"
                  onClick={() => handleApplyBatchOutcome('promoted')}
                  className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]"
                >
                  Promote All
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyBatchOutcome('retained')}
                  className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[10px]"
                >
                  Retain All
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Transfer Configuration */
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Current Grade Level
                </label>
                <select
                  value={transferGrade}
                  onChange={e => setTransferGrade(parseInt(e.target.value, 10))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  {[7, 8, 9, 10, 11, 12].map(lvl => (
                    <option key={lvl} value={lvl}>
                      Grade {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Destination Section (Same Grade)
                </label>
                <select
                  value={transferTargetSectionId}
                  onChange={e => {
                    const secId = e.target.value;
                    setTransferTargetSectionId(secId);
                    setRows(prev => prev.map(r => (r.selected ? { ...r, targetSectionId: secId } : r)));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                >
                  <option value="">Select Destination Section...</option>
                  {targetSectionsForTransfer.map(ts => (
                    <option key={ts.id} value={ts.id}>
                      {ts.name} {ts.adviser_name ? `(Adviser: ${ts.adviser_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Student Leveling Table */}
        <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
              <tr>
                <th className="py-2 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every(r => r.selected)}
                    onChange={e => {
                      const chk = e.target.checked;
                      setRows(prev => prev.map(r => ({ ...r, selected: chk })));
                    }}
                    className="rounded border-slate-300 text-primary w-4 h-4"
                  />
                </th>
                <th className="py-2 px-3">Student Name</th>
                <th className="py-2 px-3">LRN</th>
                <th className="py-2 px-3">Current Section</th>
                <th className="py-2 px-3">Outcome</th>
                <th className="py-2 px-3">Assigned Target Section</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => (
                <tr key={r.student.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                  <td className="py-2 px-3">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      onChange={e => {
                        const chk = e.target.checked;
                        setRows(prev => prev.map((item, idx) => (idx === i ? { ...item, selected: chk } : item)));
                      }}
                      className="rounded border-slate-300 text-primary w-4 h-4"
                    />
                  </td>
                  <td className="py-2 px-3 font-semibold">
                    {r.student.first_name} {r.student.last_name}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-500">{r.student.lrn}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{r.student.section_name}</td>
                  <td className="py-2 px-3">
                    <select
                      value={r.outcome}
                      onChange={e => {
                        const out = e.target.value as EnrollmentStatus;
                        setRows(prev => prev.map((item, idx) => (idx === i ? { ...item, outcome: out } : item)));
                      }}
                      className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                    >
                      <option value="promoted">Promoted</option>
                      <option value="retained">Retained</option>
                      <option value="transferred_out">Transferred Out</option>
                      <option value="dropped">Dropped</option>
                      <option value="graduated">Graduated</option>
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={r.targetSectionId}
                      onChange={e => {
                        const sec = e.target.value;
                        setRows(prev => prev.map((item, idx) => (idx === i ? { ...item, targetSectionId: sec } : item)));
                      }}
                      disabled={r.outcome === 'graduated' || r.outcome === 'dropped' || r.outcome === 'transferred_out'}
                      className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 disabled:opacity-50"
                    >
                      <option value="">Select Section...</option>
                      {(mode === 'promotion' ? targetSectionsForPromotion : targetSectionsForTransfer).map(sec => (
                        <option key={sec.id} value={sec.id}>
                          {sec.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-slate-400">
                    No students found matching selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            {rows.filter(r => r.selected).length} student(s) selected
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isSubmitting || rows.filter(r => r.selected).length === 0}
              onClick={handleCommitLeveling}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Executing Leveling...' : 'Commit Batch Leveling'}</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

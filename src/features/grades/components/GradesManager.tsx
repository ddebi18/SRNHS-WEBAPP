import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchSections,
  fetchSubjects,
  fetchTeachingAssignments,
} from '@/features/faculty/api';
import {
  fetchHydratedQuarterGrades,
  saveGrades,
  setQuarterPublicationStatus,
  fetchGeneralAverages,
} from '../api';
import {
  computeFinalRating,
  getGradeRemark,
} from '../lib/gradeCalculations';
import {
  Award,
  Save,
  CheckCircle2,
  Send,
  Users,
  Sparkles,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

export const GradesManager: React.FC = () => {
  const { user, isAdmin } = useRole();
  const queryClient = useQueryClient();

  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [isGenAvgModalOpen, setIsGenAvgModalOpen] = useState(false);

  // Draft edits state: { [student_id]: { q1?, q2?, q3?, q4? } }
  const [draftEdits, setDraftEdits] = useState<Record<string, { q1?: string; q2?: string; q3?: string; q4?: string }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 1. Load Sections & Subjects & Assignments
  const { data: allSections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: fetchSections,
  });

  const { data: allSubjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
  });

  const { data: teacherAssignments = [] } = useQuery({
    queryKey: ['teaching_assignments', user?.id],
    queryFn: () => fetchTeachingAssignments(user?.id),
    enabled: !!user?.id,
  });

  // Filter sections and subjects accessible to user
  const accessibleSections = useMemo(() => {
    if (isAdmin) return allSections;
    // Teacher can access sections they teach OR sections they advise
    const assignedSecIds = new Set(teacherAssignments.map(a => a.section_id));
    return allSections.filter(s => {
      const isAdviser = s.adviser_id === user?.id || (s as any).teacherId === user?.id;
      return assignedSecIds.has(s.id) || isAdviser;
    });
  }, [allSections, teacherAssignments, isAdmin, user]);

  const accessibleSubjects = useMemo(() => {
    if (isAdmin) return allSubjects;
    if (!selectedSection) return [];
    // Teacher can only grade subjects they are assigned to for this section
    const assignedSubIds = new Set(
      teacherAssignments.filter(a => a.section_id === selectedSection).map(a => a.subject_id)
    );
    return allSubjects.filter(sub => assignedSubIds.has(sub.id));
  }, [allSubjects, teacherAssignments, selectedSection, isAdmin]);

  // Set initial selections
  useEffect(() => {
    if (!selectedSection && accessibleSections.length > 0 && accessibleSections[0]) {
      setSelectedSection(accessibleSections[0].id);
    }
  }, [accessibleSections, selectedSection]);

  useEffect(() => {
    if (accessibleSubjects.length > 0 && (!selectedSubject || !accessibleSubjects.some(s => s.id === selectedSubject))) {
      setSelectedSubject(accessibleSubjects[0]!.id);
    }
  }, [accessibleSubjects, selectedSubject]);

  // 2. Fetch Grades for selected section & subject
  const {
    data: studentGrades = [],
    isLoading: isLoadingGrades,
    refetch: refetchGrades,
  } = useQuery({
    queryKey: ['grades', selectedSection, selectedSubject],
    queryFn: () => fetchHydratedQuarterGrades(selectedSection, selectedSubject),
    enabled: !!selectedSection && !!selectedSubject,
  });

  // Reset drafts when section/subject changes
  useEffect(() => {
    setDraftEdits({});
    setHasUnsavedChanges(false);
    setSaveSuccessMsg(null);
  }, [selectedSection, selectedSubject]);

  // 3. Mutation: Save Drafts
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        student_id: string;
        subject_id: string;
        section_id: string;
        quarter: 1 | 2 | 3 | 4;
        grade: number;
        recorded_by?: string | null;
      }[] = [];

      for (const [student_id, quarters] of Object.entries(draftEdits)) {
        ([1, 2, 3, 4] as const).forEach(q => {
          const key = `q${q}` as 'q1' | 'q2' | 'q3' | 'q4';
          const valStr = quarters[key];
          if (valStr !== undefined && valStr.trim() !== '') {
            const num = parseFloat(valStr);
            if (!isNaN(num) && num >= 60 && num <= 100) {
              payload.push({
                student_id,
                subject_id: selectedSubject,
                section_id: selectedSection,
                quarter: q,
                grade: num,
                recorded_by: user?.id || null,
              });
            }
          }
        });
      }

      await saveGrades(payload);
    },
    onSuccess: () => {
      setDraftEdits({});
      setHasUnsavedChanges(false);
      setSaveSuccessMsg('Grades saved successfully as drafts.');
      refetchGrades();
      queryClient.invalidateQueries({ queryKey: ['grades'] });
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    },
  });

  // 4. Mutation: Publish Quarter
  const publishMutation = useMutation({
    mutationFn: async () => {
      await setQuarterPublicationStatus(selectedSection, selectedSubject, selectedQuarter, true);
    },
    onSuccess: () => {
      setSaveSuccessMsg(`Quarter ${selectedQuarter} published. Visible to parents.`);
      refetchGrades();
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    },
  });

  // Handlers for cell editing
  const handleGradeChange = (studentId: string, quarter: 'q1' | 'q2' | 'q3' | 'q4', rawValue: string) => {
    setDraftEdits(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [quarter]: rawValue,
      },
    }));
    setHasUnsavedChanges(true);
  };

  // 5. General Average data query
  const { data: generalAverages = [], isLoading: isLoadingGenAvg } = useQuery({
    queryKey: ['general_averages', selectedSection],
    queryFn: () => fetchGeneralAverages(selectedSection),
    enabled: isGenAvgModalOpen && !!selectedSection,
  });

  return (
    <div className="space-y-6">
      {/* ── Filter & Action Header ────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Student Quarterly Assessment
                {hasUnsavedChanges && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse">
                    ● Unsaved changes
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                DepEd Order No. 8, s. 2015 compliant grading scale (60–100, passing mark 75).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsGenAvgModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
            >
              <Users className="w-4 h-4 text-emerald-600" />
              General Average Summary
            </button>

            <button
              type="button"
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm',
                hasUnsavedChanges
                  ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                  : 'bg-slate-400 dark:bg-slate-600 cursor-not-allowed opacity-75'
              )}
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving...' : 'Save Drafts'}
            </button>

            <button
              type="button"
              disabled={publishMutation.isPending || !selectedSection || !selectedSubject}
              onClick={() => {
                if (window.confirm(`Publish Quarter ${selectedQuarter} grades for this class? Once published, grades become visible to parents.`)) {
                  publishMutation.mutate();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Publish Q{selectedQuarter}
            </button>
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-medium flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            {saveSuccessMsg}
          </div>
        )}

        {/* ── Selectors (Section & Subject & Quarter) ──────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/60">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Class Section
            </label>
            <select
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {accessibleSections.length === 0 ? (
                <option value="">No authorized sections</option>
              ) : (
                accessibleSections.map(s => (
                  <option key={s.id} value={s.id}>
                    Grade {s.grade_level} - {s.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Subject
            </label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {accessibleSubjects.length === 0 ? (
                <option value="">No assigned subjects in this section</option>
              ) : (
                accessibleSubjects.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name || sub.title} ({sub.code || 'SUB'})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Quarter for Publication
            </label>
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              {([1, 2, 3, 4] as const).map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setSelectedQuarter(q)}
                  className={cn(
                    'py-1.5 text-xs font-semibold rounded-lg transition-all',
                    selectedQuarter === q
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  )}
                >
                  Q{q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Spreadsheet Grid ─────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {isLoadingGrades ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Loading student roster and assessment records...
          </div>
        ) : studentGrades.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No enrolled students found in this section.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3.5 px-4 font-semibold w-12 text-center">#</th>
                  <th className="py-3.5 px-4 font-semibold min-w-[200px]">Student Name</th>
                  <th className="py-3.5 px-4 font-semibold w-36">LRN</th>
                  <th className="py-3.5 px-3 font-semibold text-center w-24">Q1</th>
                  <th className="py-3.5 px-3 font-semibold text-center w-24">Q2</th>
                  <th className="py-3.5 px-3 font-semibold text-center w-24">Q3</th>
                  <th className="py-3.5 px-3 font-semibold text-center w-24">Q4</th>
                  <th className="py-3.5 px-4 font-semibold text-center w-28 bg-emerald-50/50 dark:bg-emerald-950/20">Final</th>
                  <th className="py-3.5 px-4 font-semibold text-center w-28">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {studentGrades.map((student, idx) => {
                  const draft = draftEdits[student.student_id] || {};
                  const q1Val = draft.q1 !== undefined ? draft.q1 : (student.q1 !== null && student.q1 !== undefined ? String(student.q1) : '');
                  const q2Val = draft.q2 !== undefined ? draft.q2 : (student.q2 !== null && student.q2 !== undefined ? String(student.q2) : '');
                  const q3Val = draft.q3 !== undefined ? draft.q3 : (student.q3 !== null && student.q3 !== undefined ? String(student.q3) : '');
                  const q4Val = draft.q4 !== undefined ? draft.q4 : (student.q4 !== null && student.q4 !== undefined ? String(student.q4) : '');

                  // Parse numbers for live calculation
                  const q1Num = q1Val ? parseFloat(q1Val) : null;
                  const q2Num = q2Val ? parseFloat(q2Val) : null;
                  const q3Num = q3Val ? parseFloat(q3Val) : null;
                  const q4Num = q4Val ? parseFloat(q4Val) : null;

                  const liveFinal = computeFinalRating(q1Num, q2Num, q3Num, q4Num);
                  const liveRemark = getGradeRemark(liveFinal);

                  return (
                    <tr
                      key={student.student_id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                        {student.student_name}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {student.lrn}
                      </td>

                      {/* Q1 Input */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="number"
                          min="60"
                          max="100"
                          step="1"
                          placeholder="—"
                          value={q1Val}
                          onChange={e => handleGradeChange(student.student_id, 'q1', e.target.value)}
                          className={cn(
                            'w-16 px-2 py-1.5 text-center text-xs font-semibold rounded-lg border bg-slate-50 dark:bg-slate-900/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            draft.q1 !== undefined
                              ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                              : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                          )}
                        />
                      </td>

                      {/* Q2 Input */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="number"
                          min="60"
                          max="100"
                          step="1"
                          placeholder="—"
                          value={q2Val}
                          onChange={e => handleGradeChange(student.student_id, 'q2', e.target.value)}
                          className={cn(
                            'w-16 px-2 py-1.5 text-center text-xs font-semibold rounded-lg border bg-slate-50 dark:bg-slate-900/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            draft.q2 !== undefined
                              ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                              : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                          )}
                        />
                      </td>

                      {/* Q3 Input */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="number"
                          min="60"
                          max="100"
                          step="1"
                          placeholder="—"
                          value={q3Val}
                          onChange={e => handleGradeChange(student.student_id, 'q3', e.target.value)}
                          className={cn(
                            'w-16 px-2 py-1.5 text-center text-xs font-semibold rounded-lg border bg-slate-50 dark:bg-slate-900/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            draft.q3 !== undefined
                              ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                              : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                          )}
                        />
                      </td>

                      {/* Q4 Input */}
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="number"
                          min="60"
                          max="100"
                          step="1"
                          placeholder="—"
                          value={q4Val}
                          onChange={e => handleGradeChange(student.student_id, 'q4', e.target.value)}
                          className={cn(
                            'w-16 px-2 py-1.5 text-center text-xs font-semibold rounded-lg border bg-slate-50 dark:bg-slate-900/80 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500',
                            draft.q4 !== undefined
                              ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                              : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                          )}
                        />
                      </td>

                      {/* Live Final Rating */}
                      <td className="py-3 px-4 text-center font-bold text-sm bg-emerald-50/30 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-300">
                        {liveFinal !== null ? liveFinal : '—'}
                      </td>

                      {/* Live Remark */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={cn(
                            'inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide',
                            liveRemark === 'Passed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              : liveRemark === 'Failed'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          )}
                        >
                          {liveRemark}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── General Average Summary Modal ────────────────────── */}
      <Modal
        isOpen={isGenAvgModalOpen}
        onClose={() => setIsGenAvgModalOpen(false)}
        title="General Average Summary"
        subtitle="Year-end general average computed across completed subject areas"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>
              General Average is computed as the whole-number average of final ratings across all subjects.
            </span>
          </div>

          {isLoadingGenAvg ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Calculating general averages...
            </div>
          ) : generalAverages.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No students found for this section.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
              {generalAverages.map((student, idx) => (
                <div key={student.student_id} className="py-2.5 px-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-slate-400 text-[11px] w-5">{idx + 1}</span>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{student.student_name}</p>
                      <p className="text-[11px] font-mono text-slate-400">LRN: {student.lrn}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                        student.is_complete
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      )}
                    >
                      {student.is_complete ? 'All Subjects Complete' : 'Incomplete Quarters'}
                    </span>
                    <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100 w-10 text-right">
                      {student.general_average !== null ? student.general_average : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
            <button
              type="button"
              onClick={() => setIsGenAvgModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

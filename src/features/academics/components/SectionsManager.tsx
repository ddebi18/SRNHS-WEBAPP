import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { Modal } from '@/components/ui/Modal';
import { Section } from '@/types/domain.types';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Users,
  GraduationCap,
  AlertTriangle,
  Search,
  ScanFace,
  ChevronRight,
  BookOpen,
  Lock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import { cn } from '@/lib/utils';
import {
  getStoredSections,
  saveStoredSections,
  getStoredStudents,
  toFRSection,
  GRADE_LEVELS,
  generateUUID,
} from '../academicsStorage';

const inputCls =
  'w-full px-3 py-2.5 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 ' +
  'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';

export const SectionsManager: React.FC = () => {
  const { isAdmin } = useRole();
  const [sections, setSections] = useState<Section[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

  // Form fields
  const [secGrade, setSecGrade] = useState<number>(10);
  const [secName, setSecName] = useState('');
  const [secAdviser, setSecAdviser] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Load sections on mount
  useEffect(() => {
    const frSections = getStoredSections();
    setSections(
      frSections.map(fr => ({
        id: fr.id,
        grade_level: parseInt(fr.gradeLevel.replace('Grade ', ''), 10) || 10,
        name: fr.name,
        adviser_id: fr.teacherId || null,
        adviser_name: fr.teacherName !== 'Unassigned' ? fr.teacherName : '',
        created_at: new Date().toISOString(),
      }))
    );
  }, []);

  const persistSections = (next: Section[]) => {
    setSections(next);
    saveStoredSections(next.map(toFRSection));
  };

  const studentCountBySec = (secId: string) => {
    const students = getStoredStudents();
    return students.filter(s => s.sectionId === secId).length;
  };

  const totalStudents = useMemo(() => {
    return sections.reduce((acc, sec) => acc + studentCountBySec(sec.id), 0);
  }, [sections]);

  const advisedCount = useMemo(() => {
    return sections.filter(s => Boolean(s.adviser_name)).length;
  }, [sections]);

  const avgClassSize = useMemo(() => {
    if (sections.length === 0) return 0;
    return Math.round(totalStudents / sections.length);
  }, [sections, totalStudents]);

  const filteredSections = useMemo(() => {
    return sections
      .filter(sec => {
        const matchesGrade = selectedGrade === 'all' || sec.grade_level === selectedGrade;
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          !q ||
          sec.name.toLowerCase().includes(q) ||
          (sec.adviser_name && sec.adviser_name.toLowerCase().includes(q)) ||
          `grade ${sec.grade_level}`.includes(q);
        return matchesGrade && matchesQuery;
      })
      .sort((a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name));
  }, [sections, selectedGrade, searchQuery]);

  if (!isAdmin) {
    return (
      <ForbiddenState message="Section curriculum configuration is strictly restricted to School Administrators." />
    );
  }

  const openAdd = () => {
    setEditingSection(null);
    setSecGrade(10);
    setSecName('');
    setSecAdviser('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (sec: Section) => {
    setEditingSection(sec);
    setSecGrade(sec.grade_level);
    setSecName(sec.name);
    setSecAdviser(sec.adviser_name || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = secName.trim();
    if (!trimmed) {
      setFormError('Section name cannot be empty.');
      return;
    }

    const duplicate = sections.find(
      s =>
        s.grade_level === secGrade &&
        s.name.toLowerCase() === trimmed.toLowerCase() &&
        s.id !== editingSection?.id
    );
    if (duplicate) {
      setFormError(`A section named "${trimmed}" already exists in Grade ${secGrade}.`);
      return;
    }

    if (editingSection) {
      const isLocked = studentCountBySec(editingSection.id) > 0;
      if (isLocked && secGrade !== editingSection.grade_level) {
        setFormError('Grade level cannot be changed once learners are enrolled (Rule B).');
        return;
      }
      const updated = sections.map(s =>
        s.id === editingSection.id
          ? {
              ...s,
              grade_level: isLocked ? editingSection.grade_level : secGrade,
              name: trimmed,
              adviser_name: secAdviser.trim(),
            }
          : s
      );
      persistSections(updated);
    } else {
      const newSec: Section = {
        id: generateUUID(),
        grade_level: secGrade,
        name: trimmed,
        adviser_id: null,
        adviser_name: secAdviser.trim(),
        created_at: new Date().toISOString(),
      };
      persistSections([...sections, newSec]);
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (studentCountBySec(deleteTarget.id) > 0) {
      alert('Cannot delete a section that has enrolled learners (Rule B).');
      setDeleteTarget(null);
      return;
    }
    persistSections(sections.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Hero Header (Matching Overview / Live Gate Log) ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
              <LordIcon src={LORD_ICONS.school} size={18} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
              <span>Academic Curriculum Master</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
              Class Sections Directory
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-400/80 mt-1 max-w-xl">
              Configure junior and senior high school grade sections, homeroom adviser assignments, and student roster capacities.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={openAdd}
              className="px-4 py-2.5 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Section</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Stat Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Total Sections</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{sections.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Enrolled Learners</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{totalStudents}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Assigned Advisers</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{advisedCount}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Avg Class Size</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{avgClassSize}</div>
          </div>
        </div>
      </div>

      {/* ── 3. Search & Grade Filter Controls ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-3.5 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by section or adviser..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setSelectedGrade('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedGrade === 'all'
                ? 'bg-[#006937] text-white shadow-sm'
                : 'text-slate-600 dark:text-emerald-300/80 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
            }`}
          >
            All Grades
          </button>
          {GRADE_LEVELS.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedGrade === g
                  ? 'bg-[#006937] text-white shadow-sm'
                  : 'text-slate-600 dark:text-emerald-300/80 hover:bg-slate-100 dark:hover:bg-emerald-950/40'
              }`}
            >
              Grade {g}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. Sections List Cards ── */}
      {filteredSections.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-[#0A2016] rounded-xl border border-slate-200 dark:border-emerald-800/40 p-8 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center mx-auto text-emerald-700 dark:text-emerald-400">
            <Layers className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-emerald-50">
            {sections.length === 0 ? 'No sections created yet' : 'No sections match your filter'}
          </div>
          <p className="text-xs text-slate-500 dark:text-emerald-400/80 max-w-sm mx-auto">
            {sections.length === 0
              ? 'Click "Add Section" above to configure your first curriculum grade section.'
              : 'Try clearing your search query or switching to All Grades.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredSections.map(sec => {
            const count = studentCountBySec(sec.id);
            return (
              <div
                key={sec.id}
                className="bg-white dark:bg-[#0A2016] rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Natural book / bag motif matching existing school theme */}
                    <div className="w-11 h-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
                      <LordIcon src={LORD_ICONS.book} size={28} trigger="hover" colors="primary:#006937,secondary:#d4a373" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-bold text-base text-slate-900 dark:text-emerald-50 truncate">
                          {sec.name}
                        </h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-[#06180F] text-[#006937] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 shrink-0">
                          Grade {sec.grade_level}
                        </span>
                        {count > 0 && (
                          <span
                            title="Locked: Has enrolled learners. Cannot be deleted or change grade level (Rule B)."
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shrink-0"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>Locked</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-emerald-400/80 mt-1">
                        <GraduationCap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="truncate">
                          {sec.adviser_name ? `Adviser: ${sec.adviser_name}` : <span className="italic text-slate-400">No adviser assigned</span>}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(sec)}
                      title="Edit Section"
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      disabled={count > 0}
                      onClick={() => setDeleteTarget(sec)}
                      title={count > 0 ? "Cannot delete section with enrolled learners (Rule B)" : "Delete Section"}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        count > 0
                          ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                          : "hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600"
                      )}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-emerald-950/40 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-emerald-400/70">
                    <Users className="w-3.5 h-3.5" />
                    <span>{count} learners enrolled</span>
                  </div>

                  <Link
                    to={`/sections/${sec.id}/face-registration`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary dark:text-emerald-400 hover:underline"
                  >
                    <ScanFace className="w-3.5 h-3.5" />
                    <span>Roster & Biometrics</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSection ? 'Edit Grade Section' : 'Create New Grade Section'}
        subtitle="Manage DepEd curriculum grade level, section name, and homeroom adviser"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Grade Level</span>
              {editingSection && studentCountBySec(editingSection.id) > 0 && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-normal">
                  <Lock className="w-3 h-3" /> Locked (has enrolled learners)
                </span>
              )}
            </label>
            <select
              value={secGrade}
              disabled={Boolean(editingSection && studentCountBySec(editingSection.id) > 0)}
              onChange={e => setSecGrade(parseInt(e.target.value, 10))}
              className={cn(
                inputCls,
                editingSection && studentCountBySec(editingSection.id) > 0 && "opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-900"
              )}
            >
              {GRADE_LEVELS.map(g => (
                <option key={g} value={g} className="dark:bg-slate-900">
                  Grade {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Section Name
            </label>
            <input
              type="text"
              required
              value={secName}
              onChange={e => setSecName(e.target.value)}
              placeholder="e.g. Rizal, Bonifacio, Aguinaldo"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-emerald-400/60">
              Unique name for this grade section.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Homeroom Adviser <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={secAdviser}
              onChange={e => setSecAdviser(e.target.value)}
              placeholder="e.g. Maria Santos"
              className={inputCls}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white shadow-sm transition-colors cursor-pointer"
            >
              {editingSection ? 'Save Changes' : 'Create Section'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Section Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Permanent Action</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Are you sure you want to delete <strong>Grade {deleteTarget?.grade_level} - {deleteTarget?.name}</strong>?
                Enrolled learners will keep their records, but this section will no longer be available in enrollment dropdowns.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer"
            >
              Delete Section
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { Modal } from '@/components/ui/Modal';
import { Subject } from '@/types/domain.types';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import {
  getStoredSubjects,
  saveSubjects,
  generateUUID,
} from '../academicsStorage';

const inputCls =
  'w-full px-3 py-2.5 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 ' +
  'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';

export const SubjectsManager: React.FC = () => {
  const { isAdmin } = useRole();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);

  // Form fields
  const [subCode, setSubCode] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSubjects(getStoredSubjects());
  }, []);

  const persistSubjects = (next: Subject[]) => {
    setSubjects(next);
    saveSubjects(next);
  };

  const filteredSubjects = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return subjects;
    return subjects.filter(
      s =>
        (s.code && s.code.toLowerCase().includes(q)) ||
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    );
  }, [subjects, searchQuery]);

  if (!isAdmin) {
    return (
      <ForbiddenState message="Subject curriculum configuration is strictly restricted to School Administrators." />
    );
  }

  const openAdd = () => {
    setEditingSubject(null);
    setSubCode('');
    setSubTitle('');
    setSubDesc('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (sub: Subject) => {
    setEditingSubject(sub);
    setSubCode(sub.code || '');
    setSubTitle(sub.title);
    setSubDesc(sub.description || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = subTitle.trim();
    const code = subCode.trim().toUpperCase();

    if (!title) {
      setFormError('Subject title is required.');
      return;
    }

    const duplicate = subjects.find(
      s =>
        s.id !== editingSubject?.id &&
        (s.title.toLowerCase() === title.toLowerCase() ||
          (code && s.code && s.code.toLowerCase() === code.toLowerCase()))
    );
    if (duplicate) {
      setFormError('A subject with this title or course code already exists.');
      return;
    }

    if (editingSubject) {
      const updated = subjects.map(s =>
        s.id === editingSubject.id
          ? {
              ...s,
              code: code || null,
              title,
              name: title,
              description: subDesc.trim() || undefined,
            }
          : s
      );
      persistSubjects(updated);
    } else {
      const newSub: Subject = {
        id: generateUUID(),
        code: code || null,
        title,
        name: title,
        description: subDesc.trim() || undefined,
        created_at: new Date().toISOString(),
      };
      persistSubjects([...subjects, newSub]);
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    persistSubjects(subjects.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Hero Header ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
              <LordIcon src={LORD_ICONS.book} size={18} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
              <span>Curriculum Subject Catalog</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
              Academic Subjects
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-400/80 mt-1 max-w-xl">
              Maintain the junior and senior high school subject roster, course codes, and curriculum descriptions.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={openAdd}
              className="px-4 py-2.5 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Subject</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Stat Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Total Subjects</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{subjects.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">With Course Codes</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">
              {subjects.filter(s => Boolean(s.code)).length}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Curriculum Scope</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">DepEd K-12</div>
          </div>
        </div>
      </div>

      {/* ── 3. Search Bar ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-3.5 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by code, title, or description..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* ── 4. Subjects List Cards ── */}
      {filteredSubjects.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-[#0A2016] rounded-xl border border-slate-200 dark:border-emerald-800/40 p-8 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center mx-auto text-emerald-700 dark:text-emerald-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-emerald-50">
            {subjects.length === 0 ? 'No curriculum subjects added yet' : 'No subjects match your search'}
          </div>
          <p className="text-xs text-slate-500 dark:text-emerald-400/80 max-w-sm mx-auto">
            {subjects.length === 0
              ? 'Click "Add Subject" above to configure your first curriculum course.'
              : 'Try searching with a different course title or code.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredSubjects.map(sub => (
            <div
              key={sub.id}
              className="bg-white dark:bg-[#0A2016] rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-[#06180F] text-[#006937] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      {sub.code || 'NO-CODE'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(sub)}
                      title="Edit Subject"
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(sub)}
                      title="Delete Subject"
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-heading font-bold text-sm text-slate-900 dark:text-emerald-50 mt-2.5 line-clamp-1">
                  {sub.title}
                </h3>

                <p className="text-xs text-slate-500 dark:text-emerald-400/80 mt-1 line-clamp-2">
                  {sub.description || 'Standard DepEd curriculum syllabus offering.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-emerald-950/40 text-[11px] text-slate-400 dark:text-emerald-400/60 flex items-center justify-between">
                <span>Classroom subject</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">Active</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingSubject ? 'Edit Subject' : 'Add Subject to Catalog'}
        subtitle="Configure subject code, official course title, and brief description"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Course Code <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={subCode}
              onChange={e => setSubCode(e.target.value.toUpperCase())}
              placeholder="e.g. MATH-10, ENG-09, SCI-10"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Official Subject Title
            </label>
            <input
              type="text"
              required
              value={subTitle}
              onChange={e => setSubTitle(e.target.value)}
              placeholder="e.g. Mathematics, Science & Technology"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Description <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={subDesc}
              onChange={e => setSubDesc(e.target.value)}
              placeholder="Brief course objectives and syllabus details..."
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
              {editingSubject ? 'Save Changes' : 'Create Subject'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Subject Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Permanent Action</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Are you sure you want to remove <strong>{deleteTarget?.title}</strong> ({deleteTarget?.code || 'No Code'})?
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
              Delete Subject
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

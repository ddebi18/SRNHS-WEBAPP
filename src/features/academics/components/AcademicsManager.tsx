import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { Modal } from '@/components/ui/Modal';
import { Room, Subject, Section } from '@/types/domain.types';
import {
  Building2,
  BookOpen,
  Layers,
  Plus,
  Edit2,
  Trash2,
  Users,
  GraduationCap,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getStoredSections,
  saveStoredSections,
  getStoredStudents,
  generateUUID,
} from '@/features/faceRegistration/api';
import { Section as FRSection } from '@/features/faceRegistration/types';

// ─── LocalStorage keys for rooms & subjects ───────────────────────────────────
const LS_ROOMS = 'srnhs_academics_rooms_v1';
const LS_SUBJECTS = 'srnhs_academics_subjects_v1';

function getStoredRooms(): Room[] {
  try {
    const raw = localStorage.getItem(LS_ROOMS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function saveRooms(rooms: Room[]) {
  try { localStorage.setItem(LS_ROOMS, JSON.stringify(rooms)); } catch {}
}
function getStoredSubjects(): Subject[] {
  try {
    const raw = localStorage.getItem(LS_SUBJECTS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}
function saveSubjects(subjects: Subject[]) {
  try { localStorage.setItem(LS_SUBJECTS, JSON.stringify(subjects)); } catch {}
}

// Convert domain Section ↔ faceRegistration Section
function toFRSection(sec: Section): FRSection {
  return {
    id: sec.id,
    name: sec.name,
    gradeLevel: `Grade ${sec.grade_level}`,
    teacherId: sec.adviser_id || '',
    teacherName: sec.adviser_name || 'Unassigned',
    totalStudents: 0,
    registeredStudents: 0,
  };
}

// ─── Grade level options ───────────────────────────────────────────────────────
const GRADE_LEVELS = [7, 8, 9, 10, 11, 12];

// ─── Reusable form input style ────────────────────────────────────────────────
const inputCls =
  'w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 ' +
  'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow';

export const AcademicsManager: React.FC = () => {
  const { isAdmin } = useRole();
  const [activeTab, setActiveTab] = useState<'sections' | 'subjects' | 'rooms'>('sections');

  // ── Persisted state ──────────────────────────────────────────────────────────
  const [rooms, setRooms] = useState<Room[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sections, setSections] = useState<Section[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setRooms(getStoredRooms());
    setSubjects(getStoredSubjects());

    // Map faceRegistration sections → domain Section shape
    const frSections = getStoredSections();
    setSections(
      frSections.map(fr => ({
        id: fr.id,
        grade_level: parseInt(fr.gradeLevel.replace('Grade ', ''), 10) || 10,
        name: fr.name,
        adviser_id: fr.teacherId || null,
        adviser_name: fr.teacherName || '',
        created_at: new Date().toISOString(),
      }))
    );
  }, []);

  // ── Persist helpers ──────────────────────────────────────────────────────────
  const persistSections = (next: Section[]) => {
    setSections(next);
    // Also save to faceRegistration store so student enrollment dropdown sees them
    saveStoredSections(next.map(toFRSection));
  };
  const persistRooms = (next: Room[]) => { setRooms(next); saveRooms(next); };
  const persistSubjects = (next: Subject[]) => { setSubjects(next); saveSubjects(next); };

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Section form fields
  const [secGrade, setSecGrade] = useState('10');
  const [secName, setSecName] = useState('');
  const [secAdviser, setSecAdviser] = useState('');

  // Room form fields
  const [roomName, setRoomName] = useState('');
  const [roomBuilding, setRoomBuilding] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('');

  // Subject form fields
  const [subCode, setSubCode] = useState('');
  const [subTitle, setSubTitle] = useState('');
  const [subDesc, setSubDesc] = useState('');

  if (!isAdmin) {
    return (
      <ForbiddenState message="Academic master data configuration (Rooms, Subjects, Sections) is restricted to Administrators." />
    );
  }

  // ── Open modal helpers ───────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingItem(null);
    setSecGrade('10'); setSecName(''); setSecAdviser('');
    setRoomName(''); setRoomBuilding(''); setRoomCapacity('');
    setSubCode(''); setSubTitle(''); setSubDesc('');
    setIsModalOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    if (activeTab === 'sections') {
      setSecGrade(String(item.grade_level));
      setSecName(item.name);
      setSecAdviser(item.adviser_name || '');
    } else if (activeTab === 'rooms') {
      setRoomName(item.name);
      setRoomBuilding(item.building);
      setRoomCapacity(String(item.capacity));
    } else {
      setSubCode(item.code);
      setSubTitle(item.title);
      setSubDesc(item.description || '');
    }
    setIsModalOpen(true);
  };

  // ── Save handler ─────────────────────────────────────────────────────────────
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'sections') {
      const grade = parseInt(secGrade, 10) || 10;
      if (editingItem) {
        persistSections(
          sections.map(s =>
            s.id === editingItem.id
              ? { ...s, grade_level: grade, name: secName.trim(), adviser_name: secAdviser.trim() }
              : s
          )
        );
      } else {
        const newSec: Section = {
          id: generateUUID(),
          grade_level: grade,
          name: secName.trim(),
          adviser_id: null,
          adviser_name: secAdviser.trim(),
          created_at: new Date().toISOString(),
        };
        persistSections([...sections, newSec]);
      }
    } else if (activeTab === 'rooms') {
      if (editingItem) {
        persistRooms(
          rooms.map(r =>
            r.id === editingItem.id
              ? { ...r, name: roomName.trim(), building: roomBuilding.trim(), capacity: Number(roomCapacity) || 40 }
              : r
          )
        );
      } else {
        persistRooms([
          ...rooms,
          {
            id: `rm-${Date.now()}`,
            name: roomName.trim(),
            building: roomBuilding.trim(),
            capacity: Number(roomCapacity) || 40,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } else {
      if (editingItem) {
        persistSubjects(
          subjects.map(s =>
            s.id === editingItem.id
              ? { ...s, code: subCode.trim(), title: subTitle.trim(), description: subDesc.trim() }
              : s
          )
        );
      } else {
        persistSubjects([
          ...subjects,
          {
            id: `sub-${Date.now()}`,
            code: subCode.trim(),
            title: subTitle.trim(),
            description: subDesc.trim(),
            created_at: new Date().toISOString(),
          },
        ]);
      }
    }
    setIsModalOpen(false);
  };

  // ── Delete handler ───────────────────────────────────────────────────────────
  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (activeTab === 'sections') persistSections(sections.filter(s => s.id !== deleteTarget.id));
    if (activeTab === 'rooms') persistRooms(rooms.filter(r => r.id !== deleteTarget.id));
    if (activeTab === 'subjects') persistSubjects(subjects.filter(s => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  // ── Student count per section (for display) ──────────────────────────────────
  const allStudents = getStoredStudents();
  const studentCountBySec = (secId: string) =>
    allStudents.filter(s => s.sectionId === secId).length;

  // ── Tab config ───────────────────────────────────────────────────────────────
  const tabs = [
    { key: 'sections' as const, label: 'Sections', count: sections.length, icon: <Layers className="w-4 h-4" /> },
    { key: 'subjects' as const, label: 'Subjects', count: subjects.length, icon: <BookOpen className="w-4 h-4" /> },
    { key: 'rooms' as const, label: 'Rooms', count: rooms.length, icon: <Building2 className="w-4 h-4" /> },
  ];

  const addLabel =
    activeTab === 'sections' ? 'Add Section' :
    activeTab === 'subjects' ? 'Add Subject' : 'Add Room';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Academics Master Data
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure grade sections, subjects, and rooms for SRNHS.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-2xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 shadow-card transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          {addLabel}
        </motion.button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold border-b-2 transition-all',
              activeTab === tab.key
                ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            {tab.icon}
            {tab.label}
            <span className={cn(
              'ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
              activeTab === tab.key
                ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Sections Table ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'sections' && (
          <motion.div
            key="sections"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {sections.length === 0 ? (
              <EmptyState
                icon={<Layers className="w-8 h-8" />}
                title="No sections yet"
                description="Create your first grade section. Students can then be enrolled into it."
                action={<button onClick={openAdd} className="px-4 py-2 text-xs font-bold rounded-xl bg-sidebar text-white hover:bg-black/80 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add Section</button>}
              />
            ) : (
              <div className="space-y-2">
                {sections
                  .sort((a, b) => a.grade_level - b.grade_level || a.name.localeCompare(b.name))
                  .map((sec, i) => {
                    const count = studentCountBySec(sec.id);
                    return (
                      <motion.div
                        key={sec.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm hover:shadow-card transition-all group"
                      >
                        {/* Grade badge */}
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm">
                          {sec.grade_level}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-black text-sm text-slate-900 dark:text-slate-100 truncate">
                            {sec.name}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Grade {sec.grade_level}
                            </span>
                            <span className="text-[11px] text-slate-400">·</span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <GraduationCap className="w-3 h-3" />
                              {sec.adviser_name || 'No adviser'}
                            </span>
                          </div>
                        </div>

                        {/* Student count */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                          <Users className="w-3 h-3" />
                          {count} {count === 1 ? 'student' : 'students'}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={() => openEdit(sec)}
                            className="p-2 rounded-xl text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"
                            title="Edit section"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ id: sec.id, name: sec.name })}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete section"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Subjects Table ── */}
        {activeTab === 'subjects' && (
          <motion.div
            key="subjects"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {subjects.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="w-8 h-8" />}
                title="No subjects yet"
                description="Add the subjects taught at SRNHS for scheduling and records."
                action={<button onClick={openAdd} className="px-4 py-2 text-xs font-bold rounded-xl bg-sidebar text-white hover:bg-black/80 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add Subject</button>}
              />
            ) : (
              <div className="space-y-2">
                {subjects.map((sub, i) => (
                  <motion.div
                    key={sub.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm hover:shadow-card transition-all group"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-slate-900 dark:text-slate-100">{sub.title}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{sub.code}</span>
                        {sub.description && <> · {sub.description}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => openEdit(sub)} className="p-2 rounded-xl text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget({ id: sub.id, name: sub.title })} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Rooms Table ── */}
        {activeTab === 'rooms' && (
          <motion.div
            key="rooms"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {rooms.length === 0 ? (
              <EmptyState
                icon={<Building2 className="w-8 h-8" />}
                title="No rooms yet"
                description="Add classrooms and buildings used for scheduling and camera placement."
                action={<button onClick={openAdd} className="px-4 py-2 text-xs font-bold rounded-xl bg-sidebar text-white hover:bg-black/80 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Add Room</button>}
              />
            ) : (
              <div className="space-y-2">
                {rooms.map((room, i) => (
                  <motion.div
                    key={room.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card-sm hover:shadow-card transition-all group"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm text-slate-900 dark:text-slate-100">{room.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {room.building} · {room.capacity} seats
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => openEdit(room)} className="p-2 rounded-xl text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setDeleteTarget({ id: room.id, name: room.name })} className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add / Edit Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`${editingItem ? 'Edit' : 'New'} ${activeTab === 'sections' ? 'Section' : activeTab === 'subjects' ? 'Subject' : 'Room'}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {/* Section fields */}
          {activeTab === 'sections' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Grade Level
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {GRADE_LEVELS.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setSecGrade(String(g))}
                      className={cn(
                        'py-2 rounded-xl text-sm font-bold transition-all border',
                        secGrade === String(g)
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400'
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Section Name
                </label>
                <input
                  required
                  type="text"
                  value={secName}
                  onChange={e => setSecName(e.target.value)}
                  placeholder="e.g. Sampaguita, STEM-A, Rizal"
                  className={inputCls}
                />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  Just the section name — the grade level is added automatically.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Section Adviser <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={secAdviser}
                  onChange={e => setSecAdviser(e.target.value)}
                  placeholder="e.g. Mr. Juan Dela Cruz"
                  className={inputCls}
                />
              </div>
            </>
          )}

          {/* Room fields */}
          {activeTab === 'rooms' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Room Name / Label</label>
                <input required type="text" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="Room 101" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Building</label>
                <input required type="text" value={roomBuilding} onChange={e => setRoomBuilding(e.target.value)} placeholder="Building A" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Capacity (seats)</label>
                <input required type="number" min={1} value={roomCapacity} onChange={e => setRoomCapacity(e.target.value)} placeholder="45" className={inputCls} />
              </div>
            </>
          )}

          {/* Subject fields */}
          {activeTab === 'subjects' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Subject Code</label>
                <input required type="text" value={subCode} onChange={e => setSubCode(e.target.value)} placeholder="MATH-10" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Subject Title</label>
                <input required type="text" value={subTitle} onChange={e => setSubTitle(e.target.value)} placeholder="General Mathematics" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Description <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea value={subDesc} onChange={e => setSubDesc(e.target.value)} placeholder="Brief description..." className={inputCls} rows={3} />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-bold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700 shadow-sm transition-colors"
            >
              {editingItem ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Delete"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">This cannot be undone</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Delete <strong>"{deleteTarget?.name}"</strong>?
                {activeTab === 'sections' && ' Students enrolled in this section will keep their records but the section will no longer appear in dropdowns.'}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-xs font-bold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-sm transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─── Empty State Helper ────────────────────────────────────────────────────────
const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
    <div className="w-14 h-14 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500">
      {icon}
    </div>
    <div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{description}</p>
    </div>
    {action}
  </div>
);

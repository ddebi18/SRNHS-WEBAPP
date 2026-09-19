import React, { useState } from 'react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Room, Subject, Section } from '@/types/domain.types';
import { Building2, BookOpen, Layers, Plus, Edit2, Trash2 } from 'lucide-react';

const INITIAL_ROOMS: Room[] = [];

const INITIAL_SUBJECTS: Subject[] = [];

const INITIAL_SECTIONS: Section[] = [];

export const AcademicsManager: React.FC = () => {
  const { isAdmin } = useRole();
  const [activeTab, setActiveTab] = useState<'rooms' | 'subjects' | 'sections'>('sections');

  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS);
  const [sections, setSections] = useState<Section[]>(INITIAL_SECTIONS);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  // Form Fields
  const [formField1, setFormField1] = useState('');
  const [formField2, setFormField2] = useState('');
  const [formField3, setFormField3] = useState('');

  if (!isAdmin) {
    return <ForbiddenState message="Academic master data configuration (Rooms, Subjects, Sections) is restricted to Administrators." />;
  }

  const openAddModal = () => {
    setEditingItem(null);
    setFormField1('');
    setFormField2('');
    setFormField3('');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'rooms') {
      if (editingItem) {
        setRooms(prev => prev.map(r => r.id === editingItem.id ? { ...r, name: formField1, building: formField2, capacity: Number(formField3) || 40 } : r));
      } else {
        setRooms(prev => [...prev, { id: `rm-${Date.now()}`, name: formField1, building: formField2, capacity: Number(formField3) || 40, created_at: new Date().toISOString() }]);
      }
    } else if (activeTab === 'subjects') {
      if (editingItem) {
        setSubjects(prev => prev.map(s => s.id === editingItem.id ? { ...s, code: formField1, title: formField2, description: formField3 } : s));
      } else {
        setSubjects(prev => [...prev, { id: `sub-${Date.now()}`, code: formField1, title: formField2, description: formField3, created_at: new Date().toISOString() }]);
      }
    } else if (activeTab === 'sections') {
      if (editingItem) {
        setSections(prev => prev.map(sec => sec.id === editingItem.id ? { ...sec, grade_level: Number(formField1) || 10, name: formField2, adviser_name: formField3 } : sec));
      } else {
        setSections(prev => [...prev, { id: `sec-${Date.now()}`, grade_level: Number(formField1) || 10, name: formField2, adviser_name: formField3, created_at: new Date().toISOString() }]);
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (activeTab === 'rooms') setRooms(prev => prev.filter(r => r.id !== id));
    if (activeTab === 'subjects') setSubjects(prev => prev.filter(s => s.id !== id));
    if (activeTab === 'sections') setSections(prev => prev.filter(sec => sec.id !== id));
  };

  // Columns Definitions
  const roomColumns: Column<Room>[] = [
    { header: 'Room Name / Label', accessorKey: 'name', cell: r => <span className="font-bold text-slate-900 dark:text-slate-100">{r.name}</span> },
    { header: 'Building', accessorKey: 'building', cell: r => <span className="text-slate-700 dark:text-slate-300">{r.building}</span> },
    { header: 'Student Capacity', accessorKey: 'capacity', cell: r => <span className="text-slate-600 dark:text-slate-400">{r.capacity} seats</span> },
    {
      header: 'Actions',
      cell: r => (
        <div className="flex gap-2">
          <button onClick={() => { setEditingItem(r); setFormField1(r.name); setFormField2(r.building); setFormField3(String(r.capacity)); setIsModalOpen(true); }} className="p-1 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => handleDelete(r.id)} className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const subjectColumns: Column<Subject>[] = [
    { header: 'Subject Code', accessorKey: 'code', cell: s => <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{s.code}</span> },
    { header: 'Subject Title', accessorKey: 'title', cell: s => <span className="font-bold text-slate-900 dark:text-slate-100">{s.title}</span> },
    { header: 'Description', accessorKey: 'description', cell: s => <span className="text-slate-600 dark:text-slate-400">{s.description}</span> },
    {
      header: 'Actions',
      cell: s => (
        <div className="flex gap-2">
          <button onClick={() => { setEditingItem(s); setFormField1(s.code); setFormField2(s.title); setFormField3(s.description || ''); setIsModalOpen(true); }} className="p-1 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => handleDelete(s.id)} className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const sectionColumns: Column<Section>[] = [
    { header: 'Grade Level', accessorKey: 'grade_level', cell: sec => <span className="font-bold text-slate-900 dark:text-slate-100">Grade {sec.grade_level}</span> },
    { header: 'Section Name', accessorKey: 'name', cell: sec => <span className="font-bold text-brand-600 dark:text-brand-400">{sec.name}</span> },
    { header: 'Section Adviser', accessorKey: 'adviser_name', cell: sec => <span className="text-slate-700 dark:text-slate-300">{sec.adviser_name || 'Unassigned'}</span> },
    {
      header: 'Actions',
      cell: sec => (
        <div className="flex gap-2">
          <button onClick={() => { setEditingItem(sec); setFormField1(String(sec.grade_level)); setFormField2(sec.name); setFormField3(sec.adviser_name || ''); setIsModalOpen(true); }} className="p-1 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => handleDelete(sec.id)} className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Academics Master Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Admin configuration for SRNHS Rooms, Subjects, and Grade Sections.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-800 flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add New {activeTab === 'rooms' ? 'Room' : activeTab === 'subjects' ? 'Subject' : 'Section'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('sections')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'sections'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          Sections ({sections.length})
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'subjects'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Subjects ({subjects.length})
        </button>

        <button
          onClick={() => setActiveTab('rooms')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs md:text-sm font-bold border-b-2 transition-all ${
            activeTab === 'rooms'
              ? 'border-brand-600 text-brand-600 dark:text-brand-400 dark:border-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Rooms ({rooms.length})
        </button>
      </div>

      {/* Content Tables */}
      {activeTab === 'sections' && (
        <DataTable data={sections} columns={sectionColumns} keyExtractor={s => s.id} searchPlaceholder="Search sections or advisers..." searchFilter={(s, q) => s.name.toLowerCase().includes(q.toLowerCase())} />
      )}
      {activeTab === 'subjects' && (
        <DataTable data={subjects} columns={subjectColumns} keyExtractor={s => s.id} searchPlaceholder="Search subjects..." searchFilter={(s, q) => s.title.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase())} />
      )}
      {activeTab === 'rooms' && (
        <DataTable data={rooms} columns={roomColumns} keyExtractor={r => r.id} searchPlaceholder="Search rooms..." searchFilter={(r, q) => r.name.toLowerCase().includes(q.toLowerCase()) || r.building.toLowerCase().includes(q.toLowerCase())} />
      )}

      {/* Dynamic CRUD Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`${editingItem ? 'Edit' : 'Add New'} ${activeTab.slice(0, -1).toUpperCase()}`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {activeTab === 'rooms' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Room Name</label>
                <input required type="text" value={formField1} onChange={e => setFormField1(e.target.value)} placeholder="Building A – Room 101" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Building</label>
                <input required type="text" value={formField2} onChange={e => setFormField2(e.target.value)} placeholder="Building A" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Capacity</label>
                <input required type="number" value={formField3} onChange={e => setFormField3(e.target.value)} placeholder="45" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
            </>
          )}

          {activeTab === 'subjects' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject Code</label>
                <input required type="text" value={formField1} onChange={e => setFormField1(e.target.value)} placeholder="MATH-10" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Subject Title</label>
                <input required type="text" value={formField2} onChange={e => setFormField2(e.target.value)} placeholder="General Mathematics" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <textarea value={formField3} onChange={e => setFormField3(e.target.value)} placeholder="Brief subject description..." className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" rows={3} />
              </div>
            </>
          )}

          {activeTab === 'sections' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Grade Level (7 to 12)</label>
                <input required type="number" min={7} max={12} value={formField1} onChange={e => setFormField1(e.target.value)} placeholder="10" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Full Section Name</label>
                <input required type="text" value={formField2} onChange={e => setFormField2(e.target.value)} placeholder="Grade 10 – Sampaguita" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Section Adviser Name</label>
                <input type="text" value={formField3} onChange={e => setFormField3(e.target.value)} placeholder="Mr. Juan Dela Cruz" className="w-full px-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100" />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold rounded-xl bg-sidebar text-white hover:bg-black/80 dark:hover:bg-slate-700">Save Record</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { useRole } from '@/hooks/useRole';
import { ForbiddenState } from '@/components/ui/StateViews';
import { Modal } from '@/components/ui/Modal';
import { Room } from '@/types/domain.types';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertTriangle,
  DoorOpen,
  Users,
} from 'lucide-react';
import { LordIcon, LORD_ICONS } from '@/components/motion/LordIcon';
import {
  getStoredRooms,
  saveRooms,
  generateUUID,
} from '../academicsStorage';

const inputCls =
  'w-full px-3 py-2.5 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 ' +
  'bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';

export const RoomsManager: React.FC = () => {
  const { isAdmin } = useRole();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);

  // Form fields
  const [roomName, setRoomName] = useState('');
  const [roomBuilding, setRoomBuilding] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('45');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setRooms(getStoredRooms());
  }, []);

  const persistRooms = (next: Room[]) => {
    setRooms(next);
    saveRooms(next);
  };

  const totalCapacity = useMemo(() => {
    return rooms.reduce((acc, r) => acc + (r.capacity || 0), 0);
  }, [rooms]);

  const uniqueBuildings = useMemo(() => {
    const b = new Set(rooms.map(r => r.building).filter(Boolean));
    return b.size;
  }, [rooms]);

  const filteredRooms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rooms;
    return rooms.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        (r.building && r.building.toLowerCase().includes(q))
    );
  }, [rooms, searchQuery]);

  if (!isAdmin) {
    return (
      <ForbiddenState message="Campus facility and room management is restricted to School Administrators." />
    );
  }

  const openAdd = () => {
    setEditingRoom(null);
    setRoomName('');
    setRoomBuilding('');
    setRoomCapacity('45');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (room: Room) => {
    setEditingRoom(room);
    setRoomName(room.name);
    setRoomBuilding(room.building || '');
    setRoomCapacity(room.capacity ? String(room.capacity) : '45');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = roomName.trim();
    if (!name) {
      setFormError('Room name/number cannot be empty.');
      return;
    }

    const cap = parseInt(roomCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      setFormError('Capacity must be a positive number.');
      return;
    }

    const duplicate = rooms.find(
      r =>
        r.id !== editingRoom?.id &&
        r.name.toLowerCase() === name.toLowerCase() &&
        (r.building || '').toLowerCase() === roomBuilding.trim().toLowerCase()
    );
    if (duplicate) {
      setFormError('A room with this name in the same building already exists.');
      return;
    }

    if (editingRoom) {
      const updated = rooms.map(r =>
        r.id === editingRoom.id
          ? {
              ...r,
              name,
              building: roomBuilding.trim() || 'Main Campus',
              capacity: cap,
            }
          : r
      );
      persistRooms(updated);
    } else {
      const newRoom: Room = {
        id: generateUUID(),
        name,
        building: roomBuilding.trim() || 'Main Campus',
        capacity: cap,
        created_at: new Date().toISOString(),
      };
      persistRooms([...rooms, newRoom]);
    }

    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    persistRooms(rooms.filter(r => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Hero Header ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-5 sm:p-6 border border-slate-200 dark:border-emerald-800/40 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">
              <LordIcon src={LORD_ICONS.school} size={18} trigger="loop" colors="primary:#006937,secondary:#d4a373" />
              <span>Campus Physical Facilities</span>
            </div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 dark:text-emerald-50 tracking-tight">
              Classrooms & Facilities
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-400/80 mt-1 max-w-xl">
              Manage instructional classrooms, laboratory facilities, building designations, and seat capacities.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={openAdd}
              className="px-4 py-2.5 rounded-lg bg-[#006937] hover:bg-[#008C4A] text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Room</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── 2. Stat Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Total Rooms</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{rooms.length}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <DoorOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Campus Buildings</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{uniqueBuildings || 1}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0A2016] rounded-lg p-4 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-400/70">Total Seating Capacity</div>
            <div className="text-xl font-bold text-slate-900 dark:text-emerald-50 leading-tight">{totalCapacity}</div>
          </div>
        </div>
      </div>

      {/* ── 3. Search Bar ── */}
      <div className="bg-white dark:bg-[#0A2016] rounded-xl p-3.5 border border-slate-200 dark:border-emerald-800/40 shadow-sm flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by room name or building..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* ── 4. Rooms List Cards ── */}
      {filteredRooms.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-[#0A2016] rounded-xl border border-slate-200 dark:border-emerald-800/40 p-8 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center mx-auto text-emerald-700 dark:text-emerald-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-emerald-50">
            {rooms.length === 0 ? 'No rooms configured yet' : 'No rooms match your search'}
          </div>
          <p className="text-xs text-slate-500 dark:text-emerald-400/80 max-w-sm mx-auto">
            {rooms.length === 0
              ? 'Click "Add Room" above to register classroom and facility spaces.'
              : 'Try clearing your search query.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredRooms.map(room => (
            <div
              key={room.id}
              className="bg-white dark:bg-[#0A2016] rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-emerald-800/40 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-[#06180F] text-[#006937] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                      {room.building || 'Main Campus'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(room)}
                      title="Edit Room"
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(room)}
                      title="Delete Room"
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="font-heading font-bold text-base text-slate-900 dark:text-emerald-50 mt-2.5 truncate">
                  {room.name}
                </h3>

                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-emerald-400/80 mt-1">
                  <Users className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Max Capacity: {room.capacity || 45} seats</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-emerald-950/40 text-[11px] text-slate-400 dark:text-emerald-400/60 flex items-center justify-between">
                <span>Instructional Room</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">Available</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRoom ? 'Edit Room' : 'Add Campus Facility Room'}
        subtitle="Configure room number, building designation, and learner seat capacity"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Room Name / Identifier
            </label>
            <input
              type="text"
              required
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="e.g. Room 201, Science Lab A, AVR"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Building Designation <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={roomBuilding}
              onChange={e => setRoomBuilding(e.target.value)}
              placeholder="e.g. Main Building, Rizal Wing, Science Hall"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Seat Capacity
            </label>
            <input
              type="number"
              min="1"
              max="200"
              required
              value={roomCapacity}
              onChange={e => setRoomCapacity(e.target.value)}
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
              {editingRoom ? 'Save Changes' : 'Create Room'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm Delete Modal ── */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirm Room Deletion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Permanent Action</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                Are you sure you want to remove <strong>{deleteTarget?.name}</strong>?
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
              Delete Room
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

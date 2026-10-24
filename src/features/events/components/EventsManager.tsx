import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRole } from '@/hooks/useRole';
import {
  fetchEvents,
  fetchEventAttendance,
  createEvent,
  updateEventStatus,
  deleteEvent,
} from '../api';
import { SchoolEvent } from '@/types/domain.types';
import {
  Calendar,
  Plus,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  PlayCircle,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { EventCheckInModal } from './EventCheckInModal';

const STATUS_CONFIG: Record<SchoolEvent['status'], { label: string; color: string; icon: React.ReactNode }> = {
  upcoming:  { label: 'Upcoming',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',   icon: <Clock size={12} /> },
  ongoing:   { label: 'Ongoing',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', icon: <PlayCircle size={12} /> },
  completed: { label: 'Completed', color: 'text-slate-400 bg-slate-400/10 border-slate-400/30',  icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Cancelled', color: 'text-red-400 bg-red-400/10 border-red-400/30',       icon: <XCircle size={12} /> },
};

const EMPTY_FORM = {
  title: '',
  description: '',
  event_date: '',
  start_time: '',
  end_time: '',
  venue: '',
  status: 'upcoming' as SchoolEvent['status'],
};

export const EventsManager: React.FC = () => {
  const { user, isAdmin } = useRole();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: fetchEvents,
    staleTime: 30_000,
  });

  const { data: attendees = [] } = useQuery({
    queryKey: ['event_attendance', selectedEventId],
    queryFn: () => fetchEventAttendance(selectedEventId!),
    enabled: !!selectedEventId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: createEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setIsCreateOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err?.message || 'Failed to create event.'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SchoolEvent['status'] }) =>
      updateEventStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      if (selectedEventId) setSelectedEventId(null);
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    if (!form.title.trim()) { setFormError('Event title is required.'); return; }
    if (!form.event_date) { setFormError('Event date is required.'); return; }
    setFormError(null);
    createMut.mutate({
      ...form,
      created_by: user?.id,
    });
  }, [form, user, createMut]);

  const handleOpenCheckIn = (event: SchoolEvent) => {
    setSelectedEventId(event.id);
    setIsCheckInOpen(true);
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/15">
            <Calendar size={22} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">School Events</h2>
            <p className="text-xs text-slate-400">{events.length} event{events.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          New Event
        </button>
      </div>

      {/* Event Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Calendar size={48} className="mb-4 opacity-30" />
          <p className="text-sm">No events yet. Create one to start tracking attendance.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {events.map(event => {
            const cfg = STATUS_CONFIG[event.status];
            return (
              <div
                key={event.id}
                className="group relative rounded-2xl bg-slate-800/60 border border-slate-700/50 hover:border-violet-500/40 p-5 transition-all duration-200 flex flex-col gap-3"
              >
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <span className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border', cfg.color)}>
                    {cfg.icon}
                    {cfg.label}
                  </span>

                  {/* Status change + delete (admin only) */}
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <select
                        value={event.status}
                        onChange={e => statusMut.mutate({ id: event.id, status: e.target.value as SchoolEvent['status'] })}
                        className="text-xs bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-1.5 py-1 cursor-pointer"
                        title="Change status"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      <button
                        onClick={() => deleteMut.mutate(event.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                        title="Delete event"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Title & date */}
                <div>
                  <h3 className="font-semibold text-white text-sm leading-snug">{event.title}</h3>
                  {event.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{event.description}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="shrink-0" />
                    <span>{new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-PH', {
                      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                    })}</span>
                  </div>
                  {(event.start_time || event.end_time) && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} className="shrink-0" />
                      <span>
                        {event.start_time && event.start_time.slice(0, 5)}
                        {event.start_time && event.end_time && ' – '}
                        {event.end_time && event.end_time.slice(0, 5)}
                      </span>
                    </div>
                  )}
                  {event.venue && (
                    <div className="flex items-center gap-1.5">
                      <MapPin size={11} className="shrink-0" />
                      <span className="truncate">{event.venue}</span>
                    </div>
                  )}
                </div>

                {/* Check-in button */}
                {event.status !== 'cancelled' && event.status !== 'completed' ? (
                  <button
                    onClick={() => handleOpenCheckIn(event)}
                    className="mt-auto w-full py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Users size={13} />
                    Check-In Students
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenCheckIn(event)}
                    className="mt-auto w-full py-2 rounded-xl bg-slate-700/30 border border-slate-600/30 text-slate-400 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors hover:bg-slate-700/60"
                  >
                    <Users size={13} />
                    View Attendance
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => { setIsCreateOpen(false); setFormError(null); setForm(EMPTY_FORM); }}
        title="New School Event"
      >
        <div className="space-y-4 p-1">
          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle size={14} className="shrink-0" />
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Event Title *</span>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Foundation Day 2026"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
            </label>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Description</span>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Optional details..."
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Date *</span>
                <input
                  type="date"
                  value={form.event_date}
                  onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">Start Time</span>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-400 mb-1 block">End Time</span>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Venue</span>
              <input
                type="text"
                value={form.venue}
                onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                placeholder="e.g. School Gymnasium"
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
            </label>

            <label className="block">
              <span className="text-xs text-slate-400 mb-1 block">Initial Status</span>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as SchoolEvent['status'] }))}
                className="w-full bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="upcoming">Upcoming</option>
                <option value="ongoing">Ongoing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setIsCreateOpen(false); setForm(EMPTY_FORM); setFormError(null); }}
              className="px-4 py-2 rounded-xl border border-slate-600 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {createMut.isPending ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Check-In Modal */}
      {selectedEventId && selectedEvent && (
        <EventCheckInModal
          isOpen={isCheckInOpen}
          onClose={() => { setIsCheckInOpen(false); }}
          event={selectedEvent}
          attendees={attendees}
          onCheckedIn={() => queryClient.invalidateQueries({ queryKey: ['event_attendance', selectedEventId] })}
        />
      )}
    </div>
  );
};

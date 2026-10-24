import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Plus,
  Search,
  CheckCircle2,
  Eye,
  Camera,
  X,
  ShieldAlert,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  Violation,
  ViolationType,
  ViolationStatus,
  ViolationView,
} from '@/types/domain.types';
import {
  fetchViolations,
  fetchViolationTypes,
  createViolation,
  uploadViolationEvidence,
  updateViolationStatus,
  recordViolationView,
  fetchViolationViews,
  subscribeToViolations,
} from '@/features/violations/api';
import { getStoredStudents } from '@/features/faceRegistration/api';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { LoadingSpinner } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const ViolationsPage: React.FC = () => {
  const { user } = useAuth();
  const [violations, setViolations] = useState<Violation[]>([]);
  const [types, setTypes] = useState<ViolationType[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Realtime banner
  const [realtimeAlert, setRealtimeAlert] = useState<Violation | null>(null);

  // Report Modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [occurredAt, setOccurredAt] = useState<string>(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState<string>('Main Building Hallway');
  const [notes, setNotes] = useState<string>('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Detail / "Who Saw It" Modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeViolation, setActiveViolation] = useState<Violation | null>(null);
  const [viewersList, setViewersList] = useState<ViolationView[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);

  // Resolve Modal state
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [violationToResolve, setViolationToResolve] = useState<Violation | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const students = getStoredStudents();
  const studentOptions = students.map((s: any) => ({
    value: s.id,
    label: `${s.name} (${s.studentNumber || s.lrn || 'No LRN'})`,
    description: s.sectionName || 'Section',
  }));

  const loadData = async () => {
    try {
      setLoading(true);
      const [vList, tList] = await Promise.all([
        fetchViolations({
          status: statusFilter !== 'all' ? (statusFilter as ViolationStatus) : undefined,
          type_id: typeFilter !== 'all' ? typeFilter : undefined,
          search: searchTerm.trim() || undefined,
        }),
        fetchViolationTypes(),
      ]);
      setViolations(vList);
      setTypes(tList);
      if (tList.length > 0 && !selectedTypeId) {
        setSelectedTypeId(tList[0]!.id);
      }
    } catch (e) {
      console.warn('Failed to load violations:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, typeFilter]);

  // Subscribe to realtime infractions
  useEffect(() => {
    const unsubscribe = subscribeToViolations(newViol => {
      setRealtimeAlert(newViol);
      setViolations(prev => [newViol, ...prev]);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenDetail = async (viol: Violation) => {
    setActiveViolation(viol);
    setDetailModalOpen(true);
    setLoadingViewers(true);

    // Track "Who Saw It" view for logged-in user
    if (user) {
      recordViolationView(viol.id, {
        id: user.id,
        role: user.role || 'teacher',
        full_name: user.full_name,
      }).catch(() => {});
    }

    try {
      const views = await fetchViolationViews(viol.id);
      setViewersList(views);
    } catch (e) {
      console.warn('Failed to load viewers:', e);
    } finally {
      setLoadingViewers(false);
    }
  };

  const handleAcknowledge = async (viol: Violation) => {
    try {
      await updateViolationStatus(viol.id, 'acknowledged');
      setViolations(prev =>
        prev.map(v => (v.id === viol.id ? { ...v, status: 'acknowledged' } : v))
      );
      if (activeViolation?.id === viol.id) {
        setActiveViolation(prev => (prev ? { ...prev, status: 'acknowledged' } : null));
      }
    } catch (e) {
      console.warn('Failed to acknowledge violation:', e);
    }
  };

  const handleOpenResolve = (viol: Violation) => {
    setViolationToResolve(viol);
    setResolutionNotes('');
    setResolveModalOpen(true);
  };

  const handleConfirmResolve = async () => {
    if (!violationToResolve) return;
    try {
      setResolving(true);
      await updateViolationStatus(violationToResolve.id, 'resolved', resolutionNotes);
      setViolations(prev =>
        prev.map(v =>
          v.id === violationToResolve.id
            ? { ...v, status: 'resolved', notes: resolutionNotes || v.notes }
            : v
        )
      );
      setResolveModalOpen(false);
      setViolationToResolve(null);
    } catch (e) {
      console.warn('Failed to resolve violation:', e);
    } finally {
      setResolving(false);
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setReportError('Please select a student.');
      return;
    }
    if (!selectedTypeId) {
      setReportError('Please select a violation type.');
      return;
    }

    try {
      setSubmitting(true);
      setReportError(null);

      let evidencePath: string | null = null;
      if (evidenceFile) {
        setUploadingEvidence(true);
        evidencePath = await uploadViolationEvidence(evidenceFile);
        setUploadingEvidence(false);
      }

      const st = students.find((s: any) => s.id === selectedStudentId);

      const res = await createViolation({
        student_id: selectedStudentId,
        student_name: st?.name,
        student_lrn: st?.studentNumber || (st as any)?.lrn,
        violation_type_id: selectedTypeId,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
        location: location.trim(),
        notes: notes.trim(),
        evidence_path: evidencePath,
        source: 'manual',
      });

      if (!res.success) {
        setReportError(res.error || 'Failed to submit report.');
        return;
      }

      // Reset and refresh
      setReportModalOpen(false);
      setSelectedStudentId(null);
      setNotes('');
      setEvidenceFile(null);
      await loadData();
    } catch (err: any) {
      setReportError(err.message || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
      setUploadingEvidence(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Alert Banner */}
      {realtimeAlert && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-between shadow-lg animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div>
              <span className="font-bold text-xs uppercase tracking-wider block">Live Infraction Reported</span>
              <p className="text-xs text-foreground font-medium">
                <strong>{realtimeAlert.student_name || 'Student'}</strong> — {realtimeAlert.violation_type_name} ({realtimeAlert.location})
              </p>
            </div>
          </div>
          <button
            onClick={() => setRealtimeAlert(null)}
            className="p-1 rounded-lg hover:bg-rose-500/20 text-foreground cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Student Violations &amp; Disciplinary Log</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
              Staff Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log and resolve student policy infractions with photo evidence, realtime incident alerts, and "Who Saw It" read tracking.
          </p>
        </div>

        <button
          onClick={() => {
            setReportError(null);
            setReportModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Log Infraction
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadData()}
            placeholder="Search by student, LRN, type..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="reported">Reported</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Violation Types</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Violations Feed / Table */}
      {loading ? (
        <div className="p-12">
          <LoadingSpinner label="Loading violations log..." />
        </div>
      ) : violations.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-card border border-border text-muted-foreground space-y-2">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/60" />
          <p className="text-sm font-semibold text-foreground">No Violations Found</p>
          <p className="text-xs">No student disciplinary infractions recorded under the selected criteria.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3.5">Student / Section</th>
                  <th className="p-3.5">Infraction Type</th>
                  <th className="p-3.5">Date &amp; Location</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-center">Who Saw It</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {violations.map(viol => (
                  <tr key={viol.id} className="hover:bg-muted/40 transition-colors">
                    <td className="p-3.5">
                      <span className="font-bold text-foreground block">{viol.student_name || 'Student'}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        LRN: {viol.student_lrn || '—'} {viol.section_name ? `• ${viol.section_name}` : ''}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-semibold text-foreground block">{viol.violation_type_name}</span>
                      {viol.notes && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{viol.notes}</p>
                      )}
                    </td>
                    <td className="p-3.5">
                      <span className="font-mono text-[11px] text-foreground block">
                        {new Date(viol.occurred_at).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{viol.location || 'Campus'}</span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={cn(
                          'px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                          viol.status === 'resolved' && 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
                          viol.status === 'acknowledged' && 'bg-blue-500/10 text-blue-500 border border-blue-500/20',
                          viol.status === 'reported' && 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        )}
                      >
                        {viol.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleOpenDetail(viol)}
                        className="px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted border border-border text-foreground font-semibold text-[11px] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3 h-3 text-primary" />
                        <span>{viol.views_count || 0} staff</span>
                      </button>
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {viol.status === 'reported' && (
                          <button
                            onClick={() => handleAcknowledge(viol)}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        )}
                        {viol.status !== 'resolved' && (
                          <button
                            onClick={() => handleOpenResolve(viol)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                          >
                            Resolve
                          </button>
                        )}
                        {viol.status === 'resolved' && (
                          <span className="text-[10px] font-bold text-emerald-500">Case Closed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Log Student Infraction</h3>
                  <p className="text-[11px] text-muted-foreground">Official disciplinary incident record</p>
                </div>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
                {reportError}
              </div>
            )}

            <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-foreground block mb-1">Select Student *</label>
                <SearchableSelect
                  options={studentOptions}
                  value={selectedStudentId}
                  onChange={val => setSelectedStudentId(val)}
                  placeholder="Search student by name or LRN..."
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Infraction Type *</label>
                <select
                  value={selectedTypeId}
                  onChange={e => setSelectedTypeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
                  required
                >
                  {types.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-foreground block mb-1">Date &amp; Time *</label>
                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={e => setOccurredAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-foreground block mb-1">Incident Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. Science Wing Hallway"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Incident Description / Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Detail the circumstances, actions taken, or witness faculty..."
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="font-bold text-foreground block mb-1">Photo Evidence (Optional)</label>
                <label className="p-3 rounded-xl border border-dashed border-border hover:border-primary flex items-center justify-center gap-2 cursor-pointer bg-muted/40 text-muted-foreground hover:text-foreground transition-colors">
                  <Camera className="w-4 h-4 text-primary" />
                  <span>{evidenceFile ? evidenceFile.name : 'Upload photo evidence image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => setEvidenceFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingEvidence}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold cursor-pointer shadow-sm"
                >
                  {submitting ? 'Submitting...' : 'Log Infraction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail & "Who Saw It" Modal */}
      {detailModalOpen && activeViolation && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block mb-0.5">
                  Infraction Record Details
                </span>
                <h3 className="text-base font-bold text-foreground">
                  {activeViolation.student_name} ({activeViolation.student_lrn})
                </h3>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Violation</span>
                  <span className="font-bold text-foreground">{activeViolation.violation_type_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Status</span>
                  <span className="font-bold text-foreground capitalize">{activeViolation.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Occurred</span>
                  <span className="font-mono text-foreground">{new Date(activeViolation.occurred_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Location</span>
                  <span className="text-foreground">{activeViolation.location || 'Campus'}</span>
                </div>
              </div>

              {activeViolation.notes && (
                <div>
                  <span className="font-bold text-foreground block mb-1">Notes / Narrative:</span>
                  <p className="p-3 rounded-xl bg-background border border-border text-foreground leading-relaxed">
                    {activeViolation.notes}
                  </p>
                </div>
              )}

              {activeViolation.evidence_path && (
                <div>
                  <span className="font-bold text-foreground block mb-1">Photo Evidence:</span>
                  <a
                    href={activeViolation.evidence_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View Uploaded Evidence Photo
                  </a>
                </div>
              )}

              {/* "Who Saw It" Section */}
              <div className="pt-3 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    Who Saw It (Read Audit)
                  </span>
                  <span className="text-[11px] text-muted-foreground">{viewersList.length} staff viewers</span>
                </div>

                {loadingViewers ? (
                  <LoadingSpinner label="Loading viewer audit..." />
                ) : viewersList.length === 0 ? (
                  <p className="text-muted-foreground text-[11px]">You are the first staff member to view this record.</p>
                ) : (
                  <div className="rounded-xl border border-border divide-y divide-border/60 max-h-40 overflow-y-auto">
                    {viewersList.map((vw, i) => (
                      <div key={vw.id || i} className="p-2.5 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-bold text-foreground block">{vw.user_name || 'Staff Member'}</span>
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">{vw.role}</span>
                        </div>
                        <div className="text-right text-[10px] text-muted-foreground font-mono">
                          <span>First: {new Date(vw.first_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="block">Last: {new Date(vw.last_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <button
                onClick={() => setDetailModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveModalOpen && violationToResolve && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-border rounded-3xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Resolve Infraction Case</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mark case for <strong>{violationToResolve.student_name}</strong> as resolved.
              </p>
            </div>

            <div className="text-xs space-y-2">
              <label className="font-bold text-foreground block">Resolution Notes / Action Taken</label>
              <textarea
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Guidance counselling conducted; parent conference held on Oct 24."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none"
              />
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setResolveModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResolve}
                disabled={resolving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                {resolving ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

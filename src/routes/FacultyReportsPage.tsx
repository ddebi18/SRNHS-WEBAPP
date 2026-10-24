import React, { useState, useEffect } from 'react';
import {
  Printer,
  Download,
  Award,
  AlertTriangle,
  Activity,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRole } from '@/hooks/useRole';
import {
  FacultyAttendanceSummary,
  FacultyGradesStatus,
  Violation,
  UserLog,
} from '@/types/domain.types';
import {
  fetchFacultyAttendanceSummary,
  fetchFacultyGradesStatus,
  fetchFacultyViolations,
  fetchFacultyActivityLogs,
} from '@/features/facultyReports/api';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/ui/StateViews';
import { cn } from '@/lib/utils';

export const FacultyReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { role } = useRole();
  const isAdmin = role === 'admin';

  // Teacher list for Admin dropdown
  const [facultyList, setFacultyList] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(user?.id || '');

  // Filter state
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [dateRange, setDateRange] = useState<'quarter' | 'semester' | 'all'>('quarter');

  // Report data states
  const [loading, setLoading] = useState(true);
  const [attendanceSummary, setAttendanceSummary] = useState<FacultyAttendanceSummary | null>(null);
  const [gradesStatus, setGradesStatus] = useState<FacultyGradesStatus[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [activityLogs, setActivityLogs] = useState<UserLog[]>([]);

  // 1. Load faculty list if Admin
  useEffect(() => {
    async function loadFaculty() {
      if (isAdmin) {
        if (supabase && isSupabaseConfigured) {
          const { data } = await supabase
            .from('staff_profiles')
            .select('id, full_name, email, role')
            .eq('role', 'teacher')
            .order('full_name');

          if (data && data.length > 0) {
            setFacultyList(data);
            if (!selectedTeacherId) setSelectedTeacherId(data[0]!.id);
            return;
          }
        }

        // Local fallback
        const mockFaculty = [
          { id: user?.id || 'tch-01', full_name: user?.full_name || 'Maria Santos', email: user?.email || 'maria.santos@srnhs.edu.ph' },
          { id: 'tch-02', full_name: 'Jose Rizal', email: 'jose.rizal@srnhs.edu.ph' },
          { id: 'tch-03', full_name: 'Andres Bonifacio', email: 'andres.bonifacio@srnhs.edu.ph' },
        ];
        setFacultyList(mockFaculty);
        if (!selectedTeacherId) setSelectedTeacherId(mockFaculty[0]!.id);
      } else {
        // Teacher is always self
        if (user?.id) setSelectedTeacherId(user.id);
      }
    }
    loadFaculty();
  }, [isAdmin, user]);

  // 2. Load report data whenever selectedTeacherId or filters change
  useEffect(() => {
    if (!selectedTeacherId) return;

    async function loadReport() {
      try {
        setLoading(true);

        const now = new Date();
        const start = dateRange === 'quarter'
          ? new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : '2025-06-01';
        const end = now.toISOString().split('T')[0];

        const [att, grades, viols, logs] = await Promise.all([
          fetchFacultyAttendanceSummary(selectedTeacherId, start, end),
          fetchFacultyGradesStatus(selectedTeacherId),
          fetchFacultyViolations(selectedTeacherId),
          fetchFacultyActivityLogs(selectedTeacherId, 20),
        ]);

        setAttendanceSummary(att);
        setGradesStatus(grades);
        setViolations(viols);
        setActivityLogs(logs);
      } catch (err) {
        console.warn('Failed to load faculty report:', err);
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [selectedTeacherId, schoolYear, dateRange]);

  const activeTeacher = facultyList.find(f => f.id === selectedTeacherId) || {
    id: selectedTeacherId,
    full_name: user?.full_name || 'Faculty Member',
    email: user?.email || '',
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push(`"FACULTY COMPREHENSIVE PERFORMANCE REPORT"`);
    lines.push(`"Faculty:","${activeTeacher.full_name} (${activeTeacher.email})"`);
    lines.push(`"School Year:","${schoolYear}"`);
    lines.push(`"Generated:","${new Date().toLocaleString()}"`);
    lines.push('');

    // Attendance Section
    lines.push(`"1. ATTENDANCE HANDLING SUMMARY"`);
    lines.push(`"Metric","Value"`);
    lines.push(`"Sessions Held","${attendanceSummary?.total_sessions_held || 0}"`);
    lines.push(`"Total Attendees Marked","${attendanceSummary?.total_attendees_marked || 0}"`);
    lines.push(`"Present Count","${attendanceSummary?.present_count || 0}"`);
    lines.push(`"Late Count","${attendanceSummary?.late_count || 0}"`);
    lines.push(`"Absent Count","${attendanceSummary?.absent_count || 0}"`);
    lines.push(`"Excused Count","${attendanceSummary?.excused_count || 0}"`);
    lines.push(`"Overall Attendance Rate","${attendanceSummary?.overall_attendance_rate || 0}%"`);
    lines.push('');

    // Grades Section
    lines.push(`"2. GRADE SUBMISSION STATUS"`);
    lines.push(`"Section","Grade Level","Subject Code","Subject Title","Enrolled","Q1 Entered","Q1 Published","Q2 Entered","Q2 Published","Q3 Entered","Q3 Published","Q4 Entered","Q4 Published"`);
    for (const g of gradesStatus) {
      lines.push(
        `"${g.section_name}","${g.grade_level}","${g.subject_code}","${g.subject_title}","${g.total_enrolled}","${g.q1_entered}","${g.q1_published}","${g.q2_entered}","${g.q2_published}","${g.q3_entered}","${g.q3_published}","${g.q4_entered}","${g.q4_published}"`
      );
    }
    lines.push('');

    // Violations Section
    lines.push(`"3. VIOLATIONS LOGGED"`);
    lines.push(`"Date","Student Name","LRN","Violation Type","Location","Status"`);
    for (const v of violations) {
      lines.push(
        `"${v.occurred_at}","${v.student_name || ''}","${v.student_lrn || ''}","${v.violation_type_name || ''}","${v.location || ''}","${v.status}"`
      );
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faculty_report_${activeTeacher.full_name.replace(/\s+/g, '_')}_${schoolYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls (Hidden in Print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Faculty Performance &amp; Activity Reports</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              DepEd Monitoring
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Consolidated overview of classroom attendance handling, quarterly grading progress, and student violations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-2 rounded-xl bg-card border border-border hover:bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4 text-primary" />
            Print Report
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter / Scope Toolbar (Hidden in Print) */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Faculty Selector (Admins can choose; Teachers are locked) */}
          {isAdmin ? (
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-2 text-xs">
              <UserCheck className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground font-semibold">Faculty:</span>
              <select
                value={selectedTeacherId}
                onChange={e => setSelectedTeacherId(e.target.value)}
                className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
              >
                {facultyList.map(f => (
                  <option key={f.id} value={f.id} className="bg-card text-foreground">
                    {f.full_name} ({f.email})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border text-xs">
              <UserCheck className="w-4 h-4 text-primary" />
              <span className="font-bold text-foreground">{user?.full_name}</span>
              <span className="text-muted-foreground">({user?.email})</span>
            </div>
          )}

          {/* School Year */}
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-2 text-xs">
            <span className="text-muted-foreground font-semibold">S.Y.:</span>
            <select
              value={schoolYear}
              onChange={e => setSchoolYear(e.target.value)}
              className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="2025-2026">2025–2026</option>
              <option value="2026-2027">2026–2027</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-3 py-2 text-xs">
            <span className="text-muted-foreground font-semibold">Range:</span>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as any)}
              className="bg-transparent font-bold text-foreground focus:outline-none cursor-pointer"
            >
              <option value="quarter">Current Quarter (90d)</option>
              <option value="semester">Semester (180d)</option>
              <option value="all">Entire School Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── PRINT-ONLY DEPED OFFICIAL HEADER ── */}
      <div className="hidden print:block text-center border-b-2 border-black pb-4 mb-6 space-y-1">
        <p className="text-xs uppercase tracking-widest text-gray-600 font-serif">Republic of the Philippines • Department of Education</p>
        <p className="text-xs uppercase tracking-wider text-gray-600 font-serif">Region IV-A CALABARZON • Division of Antipolo City</p>
        <h2 className="text-lg font-black tracking-tight text-black font-serif">SAN ROQUE NATIONAL HIGH SCHOOL</h2>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mt-2">
          Faculty Performance &amp; Supervisory Monitoring Report
        </h3>
        <p className="text-xs text-gray-600 font-mono">
          Faculty: <strong>{activeTeacher.full_name}</strong> | School Year: {schoolYear} | Date: {new Date().toLocaleDateString()}
        </p>
      </div>

      {loading ? (
        <div className="p-12">
          <LoadingSpinner label="Generating comprehensive faculty report..." />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── SECTION 1: ATTENDANCE HANDLING ── */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                    1. Classroom Attendance Handling
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Classroom check-in sessions recorded by this teacher</p>
                </div>
              </div>
              {attendanceSummary && (
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Attendance Rate
                  </span>
                  <span className="text-xl font-black text-emerald-500">
                    {attendanceSummary.overall_attendance_rate}%
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Sessions Held</span>
                <span className="text-2xl font-black text-foreground mt-1 block">
                  {attendanceSummary?.total_sessions_held || 0}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Students Marked</span>
                <span className="text-2xl font-black text-foreground mt-1 block">
                  {attendanceSummary?.total_attendees_marked || 0}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Present &amp; On-Time</span>
                <span className="text-2xl font-black text-emerald-500 mt-1 block">
                  {attendanceSummary?.present_count || 0}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-muted/40 border border-border">
                <span className="text-[10px] font-bold uppercase text-muted-foreground block">Tardy &amp; Absences</span>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xl font-black text-amber-500">
                    {attendanceSummary?.late_count || 0} <span className="text-[10px] text-muted-foreground">late</span>
                  </span>
                  <span className="text-xl font-black text-rose-500">
                    {attendanceSummary?.absent_count || 0} <span className="text-[10px] text-muted-foreground">abs</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 2: GRADE SUBMISSION PROGRESS ── */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                  2. DepEd Quarterly Grade Submission Status
                </h3>
                <p className="text-[11px] text-muted-foreground">Quarterly grade entry and publication status by assigned subject</p>
              </div>
            </div>

            {gradesStatus.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No active teaching assignments found for this teacher.
              </div>
            ) : (
              <div className="rounded-2xl border border-border overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3.5">Assigned Class / Subject</th>
                      <th className="p-3.5 text-center">Enrolled</th>
                      <th className="p-3.5 text-center">1st Quarter</th>
                      <th className="p-3.5 text-center">2nd Quarter</th>
                      <th className="p-3.5 text-center">3rd Quarter</th>
                      <th className="p-3.5 text-center">4th Quarter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {gradesStatus.map((g, idx) => (
                      <tr key={idx} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3.5">
                          <span className="font-bold text-foreground block">{g.subject_title}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {g.section_name} (Grade {g.grade_level}) • {g.subject_code}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-foreground">
                          {g.total_enrolled}
                        </td>
                        {[
                          { entered: g.q1_entered, pub: g.q1_published },
                          { entered: g.q2_entered, pub: g.q2_published },
                          { entered: g.q3_entered, pub: g.q3_published },
                          { entered: g.q4_entered, pub: g.q4_published },
                        ].map((q, qIdx) => (
                          <td key={qIdx} className="p-3.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono text-[11px] font-bold">
                                {q.entered} / {g.total_enrolled}
                              </span>
                              <span
                                className={cn(
                                  'px-1.5 py-0.2 rounded text-[9px] font-black uppercase mt-0.5',
                                  q.pub
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : q.entered > 0
                                    ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {q.pub ? 'Published' : q.entered > 0 ? 'Draft' : 'Pending'}
                              </span>
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── SECTION 3: VIOLATIONS LOGGED ── */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                    3. Student Infractions Logged
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Disciplinary reports submitted by this faculty member</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-muted text-foreground">
                Total: {violations.length}
              </span>
            </div>

            {violations.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No student disciplinary infractions on record for this faculty member.
              </div>
            ) : (
              <div className="rounded-2xl border border-border overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3.5">Date &amp; Time</th>
                      <th className="p-3.5">Student</th>
                      <th className="p-3.5">Violation</th>
                      <th className="p-3.5">Location</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {violations.map(v => (
                      <tr key={v.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {new Date(v.occurred_at).toLocaleDateString()}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-foreground block">{v.student_name || 'Student'}</span>
                          {v.student_lrn && (
                            <span className="text-[10px] font-mono text-muted-foreground">LRN: {v.student_lrn}</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="font-semibold text-foreground block">{v.violation_type_name}</span>
                          {v.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{v.notes}</p>}
                        </td>
                        <td className="p-3.5 text-muted-foreground">{v.location || 'Campus'}</td>
                        <td className="p-3.5">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                              v.status === 'resolved' && 'bg-emerald-500/10 text-emerald-500',
                              v.status === 'acknowledged' && 'bg-blue-500/10 text-blue-500',
                              v.status === 'reported' && 'bg-rose-500/10 text-rose-500'
                            )}
                          >
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── SECTION 4: RECENT ACTIVITY LOGS (Hidden in Print) ── */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-sm space-y-4 print:hidden">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
              <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                  4. Recent System Activity &amp; Audit Trail
                </h3>
                <p className="text-[11px] text-muted-foreground">Non-repudiable audit log entries tied to this account</p>
              </div>
            </div>

            {activityLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No recent activity logs recorded for this account.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {activityLogs.map(log => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                      <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded text-[11px]">
                        {log.action}
                      </span>
                      <span className="text-muted-foreground">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)})` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── PRINT-ONLY SIGNATURE SECTION ── */}
          <div className="hidden print:grid grid-cols-2 gap-12 pt-16 mt-8 border-t border-gray-400 text-xs">
            <div className="text-center space-y-1">
              <div className="border-b border-black w-48 mx-auto pb-6"></div>
              <p className="font-bold uppercase text-black">{activeTeacher.full_name}</p>
              <p className="text-gray-600 text-[11px]">Faculty Member / Teacher</p>
            </div>
            <div className="text-center space-y-1">
              <div className="border-b border-black w-48 mx-auto pb-6"></div>
              <p className="font-bold uppercase text-black">DR. MARIA ELENA SANTOS</p>
              <p className="text-gray-600 text-[11px]">Secondary School Principal IV</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

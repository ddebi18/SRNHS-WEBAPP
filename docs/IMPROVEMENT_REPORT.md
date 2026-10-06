# SRNHS Attendance & Monitoring System — Product & UX Improvement Report
**Institution:** San Roque National High School (DepEd Region IV-A CALABARZON, Division of Antipolo City)  
**Date:** September 2026  
**Auditor:** Senior Product Engineer & UX Reviewer  
**Methodology:** Ponytail (Minimal, YAGNI, standard library & native features first, strictly low-cost/maintainable for public school operations)

---

## 1. Baseline System Audit

### Current Role Capabilities
* **School Administrator (`admin`):** Full access to Overview, Live Gate Log (`/gate-log`), Classroom Attendance (`/classroom`), Face Registration (`/face-registration`), Students & Guardians (`/students`), Faculty & Schedules (`/faculty`), Academics Master (`/academics`), and SMS Audit Log (`/sms-log`). Can trigger manual gate entries, register/delete student records, and manage academic curriculum/sections.
* **Teacher / Faculty (`teacher`):** Restricted view. Can access Overview, Classroom Attendance (`/classroom`), Students & Guardians (read-only without delete), Faculty schedule views, and Face Registration. Blocked from Gate Log, Academics Master, and SMS Audit Log via `ProtectedRoute` in [`AppRouter.tsx:23-51`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/AppRouter.tsx#L23-L51).

### Navigation & Screen Structure
* **Desktop:** Fixed green sidebar (`#006937`) with DepEd institutional header, active route indicators, school seal, and bottom user card with logout ([`NavigationLayout.tsx:75-172`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/components/ui/NavigationLayout.tsx#L75-L172)).
* **Mobile / Phone View:** Responsive top header with DepEd institutional strip, hamburger drawer menu, and fixed bottom navigation bar (`md:hidden`) with top 4 destinations (`Overview`, `Gate Log` [admin only], `Classroom`, `Students`) plus a `More` trigger ([`NavigationLayout.tsx:362-395`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/components/ui/NavigationLayout.tsx#L362-L395)).
* **States & Feedback:** Dedicated components exist in [`StateViews.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/components/ui/StateViews.tsx) (`LoadingSpinner`, `EmptyState`, `ErrorState`, `ForbiddenState`).

### Observable Pain Points in the Codebase

1. **Broken Metrics on Dashboard Overview**
   * *File & Lines:* [`src/routes/DashboardOverviewPage.tsx:61,77`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/DashboardOverviewPage.tsx#L61)
   * *Evidence:* `enrolledCount` reads from browser `localStorage` (`getStoredStudents().length`). The query only fetches 8 events: `supabaseRecognitionAdapter.getEvents({ limit: 8 })`. The dashboard then calculates today's attendance rate using `todayScansCount / enrolledCount`. Because scans are capped at 8, the attendance rate is mathematically bounded to at most `8 / enrolledCount` (e.g., 2% for 400 students), presenting false and alarming school-wide metrics to the Principal.

2. **Teacher Attendance Overrides Are Trapped in LocalStorage**
   * *File & Lines:* [`src/features/attendance/components/ClassroomAttendanceBoard.tsx:34-48,191-201`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx#L34-L48)
   * *Evidence:* When a teacher manually marks a student "Present", "Late", or "Excused", the override is stored strictly in `localStorage` under `srnhs_attendance_teacher_overrides_v1`. It is never written to Supabase. If the teacher switches devices or the principal checks the master gate logs, the overrides are invisible.

3. **Gate Scan Truncation Causes False "Absent" Statuses in Class**
   * *File & Lines:* [`src/features/attendance/components/ClassroomAttendanceBoard.tsx:118,150-153`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx#L118)
   * *Evidence:* `loadScans` executes `getEvents({ limit: 100 })`. In a high school with 500+ students entering within a 30-minute morning window, any student whose turnstile scan was pushed past the top 100 is computed as `absent` on the teacher's board.

4. **SMS Audit Log Is Mocked & Exposes Unmasked Phone Numbers (RA 10173)**
   * *File & Lines:* [`src/features/notifications/components/SmsAuditLog.tsx:3,17,42-47`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/notifications/components/SmsAuditLog.tsx#L3)
   * *Evidence:* The screen imports `mockNotificationAdapter` and displays mock dispatch data instead of querying the Supabase `sms_notifications` table. Furthermore, `log.guardian_phone` renders complete, unmasked phone numbers in plain text across the table without masking (e.g., `+639171234567` instead of `+63917***4567`).

5. **Biometric Consent Is Synthetically Assumed**
   * *File & Lines:* [`src/features/students/components/StudentManager.tsx:50-51`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx#L50-L51)
   * *Evidence:* When loading student profiles, `parent_consent: true` and `consent_date: '2026-06-01'` are hardcoded fallback constants. Under the Philippine Data Privacy Act of 2012 (RA 10173) and DepEd child protection policies, biometric face templates require explicit, auditable guardian consent records.

6. **Full-Table Refetches on Every Realtime Gate Scan**
   * *File & Lines:* [`src/features/attendance/components/LiveGateLog.tsx:30-33`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/LiveGateLog.tsx#L30-L33)
   * *Evidence:* When a Realtime insert occurs on `recognition_events`, the subscription handler runs `supabaseRecognitionAdapter.getEvents().then(setEvents);`, discarding the payload and re-fetching 50 rows over the network on every student scan. Under morning peak entry (1-2 scans/second), this overwhelms school Wi-Fi and triggers React re-renders.

7. **Destructive Student Deletion Relies on Browser `confirm()`**
   * *File & Lines:* [`src/features/students/components/StudentManager.tsx:177-184`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx#L177-L184)
   * *Evidence:* Deleting a student executes `if (!confirm(...)) return;` and immediately deletes the record. Accidental taps on mobile or misclicks delete student biometric references without a 2-step confirmation or audit trail.

---

## 2. Institutions Reviewed

| Institution | Category | Verified Public URL | Key Observations & Relevant Design Patterns | Unverifiable Elements |
|---|---|---|---|---|
| **DepEd School Form 2 (SF2) / LIS** | PH K-12 Standard | [DepEd Order No. 4, s. 2014 & Order 54, s. 2016](https://www.deped.gov.ph) | Mandatory attendance register format: Daily grid (Present = blank, Absent = `x`, Tardy/Cutting = half-shaded). Standard threshold: **5 consecutive days of absence triggers mandatory home visitation and SARDO (Student-At-Risk-of-Dropping-Out) intervention**. Monthly summary calculations: Total Enrolment, Average Daily Attendance (ADA), and Attendance Rate (%). | Internal LIS cloud backend APIs; teacher manual encoding speed in low-connectivity rural schools. |
| **University of the Philippines (UP) SAIS / CRS** | PH Higher Ed | [sais.up.edu.ph](https://sais.up.edu.ph) & [ictsupport.up.edu.ph](https://ictsupport.up.edu.ph) | Role-gated class rosters; faculty encode grades and review class listings based on official section assignments; centralized helpdesk ticketing integration; explicit session timeouts for security. | Internal attendance marking module configurations across specific campuses (handled ad-hoc or via LMS). |
| **Ateneo de Manila University (AISIS / UDPO)** | PH Higher Ed | [ateneo.edu/privacy](https://www.ateneo.edu/privacy) & [aisis.ateneo.edu](https://aisis.ateneo.edu) | Strong Data Privacy Act (RA 10173) compliance: Explicit data protection manual, strict role-based data segregation, clear purpose specification for personal data collection, parent/student data subject request workflows. | Private authenticated student portal views; internal faculty evaluation workflows. |
| **De La Salle University (DLSU My.LaSalle / AnimoSpace)** | PH Higher Ed | [dlsu.edu.ph](https://www.dlsu.edu.ph) | Course attendance threshold policies (maximum 20% absences before FDA/Failure Due to Absences); daily LMS-integrated attendance records; clear student handbook policy cross-references. | Student-facing live attendance dashboards (confirmed not publicly accessible to students). |
| **University of Santo Tomas (UST MyUSTe / Cloud Campus)** | PH Higher Ed | [myusteportal.ust.edu.ph](https://myusteportal.ust.edu.ph) | Time In / Time Out interface for faculty; multi-factor authentication (Google Authenticator TOTP) layered over institutional Google Workspace accounts; high visual branding consistency. | Exact administrative back-office attendance aggregation dashboards. |
| **Stanford University** | Global Higher Ed | [identity.stanford.edu](https://identity.stanford.edu) | **Decanter Design System:** Strict WCAG 2.1 AA compliance (3:1 contrast for large/bold text, 4.5:1 for body); semantic digital interactive palette (Digital Red for critical alerts, Digital Green for validation, Digital Blue for actions); avoidance of pure `#000000` on `#ffffff` to minimize cognitive fatigue. | Stanford Axess internal student attendance tracking UI (enterprise PeopleSoft behind SSO). |
| **MIT Registrar & WebSIS** | Global Higher Ed | [registrar.mit.edu](https://registrar.mit.edu) | Clean, high-density tabular layouts with robust keyboard navigation; explicit term-based attendance certification; transparent status explanations and downloadable official audit reports. | Live classroom card-swipe kiosk hardware telemetry. |
| **University of Melbourne** | Global Higher Ed | [design-system.unimelb.edu.au](https://design-system.unimelb.edu.au) | **Gen 3 Design System:** Strict table accessibility rules (`<th>` headers with screen reader scope, keyboard row focus); accessible form controls with explicit error associations; responsive micro-states. | Internal LMS class attendance plugin views behind student SSO. |
| **National University of Singapore (NUS uNivUS / EduRec)** | Global Higher Ed | [nus.edu.sg](https://nus.edu.sg) | Dual-mode check-in: Mobile app QR code scanning paired with back-office attendance logging; Special Consideration request workflow for excused medical absences. | Back-end database synchronization rules for offline QR scans. |
| **SchoolPass (Raptor Technologies)** | K-12 Product | [schoolpass.com](https://schoolpass.com) | Purpose-built for K-12 campus safety: Integrated gate/turnstile arrival & dismissal logging; real-time on-campus roster for emergency drills; automated parental absence notification via SMS. | Real-time automated cellular SIM rollover protocols during carrier outages. |
| **openSIS (Classic Edition)** | Open Source K-12 | [opensis.com](https://opensis.com) & [github.com/OS4ED/openSIS-Classic](https://github.com/OS4ED/openSIS-Classic) | Single-click "Mark All Present" default with quick toggle for exceptions; configurable attendance codes (Present, Absent, Tardy, Excused); bulk daily attendance export to state compliance templates. | Commercial enterprise cloud SMS gateway connector performance. |

---

## 3. Prioritized Recommendations

### Phase 1: Quick Wins (< 1 Day Effort, Low Risk, High Immediate Payoff)

#### 1. Fix Dashboard Metric Queries & Denominator Calculation
* **Problem:** Overview attendance percentage is artificially capped by `limit: 8` query and reads student counts from `localStorage` ([`DashboardOverviewPage.tsx:61,77`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/DashboardOverviewPage.tsx#L61)).
* **Inspired by:** DepEd SF2 calculation standards (`ADA / Total Enrolment`) & openSIS analytics summary.
* **Proposed Change:** Replace the 8-item event query with a targeted Supabase count query for today's midnight-to-now scans (`select('id', { count: 'exact', head: true }).gte('captured_at', todayMidnight)`), and query actual student count from Supabase `students` table.
* **Impact:** High | **Effort:** S (2 hours) | **Risk:** Very Low
* **Dependencies:** None. Existing Supabase PostgREST client.

#### 2. Mask Guardian Contact Numbers in Plaintext Views (RA 10173 Compliance)
* **Problem:** Full guardian phone numbers (`+639171234567`) are rendered in clear text across SMS Logs and Student Tables ([`SmsAuditLog.tsx:42-47`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/notifications/components/SmsAuditLog.tsx#L42-L47), [`StudentManager.tsx:235`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx#L235)).
* **Inspired by:** Ateneo University Data Protection Office guidelines ([ateneo.edu/privacy](https://www.ateneo.edu/privacy)) and RA 10173 data minimization principle.
* **Proposed Change:** Introduce a simple, native formatting helper `maskPhone(phone: string)` returning `+63 917 ••• 4567` for standard views, with an explicit "Reveal" button logged for Admins only.
* **Impact:** High (Legal/Compliance) | **Effort:** S (1 hour) | **Risk:** None
* **Dependencies:** None (Pure TS helper).

#### 3. Optimistic Realtime Event Appending on Live Gate Log
* **Problem:** Every turnstile scan triggers a complete refetch of 50 rows via `getEvents()` ([`LiveGateLog.tsx:30-33`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/LiveGateLog.tsx#L30-L33)), causing UI flicker and network strain.
* **Inspired by:** Stanford Decanter live feed performance standards & SchoolPass real-time arrival monitors.
* **Proposed Change:** Update the Supabase Realtime callback in `LiveGateLog` to prepend the incoming `payload.new` directly into state: `setEvents(prev => [newEvent, ...prev.slice(0, 49)])`.
* **Impact:** High (Responsiveness) | **Effort:** S (1 hour) | **Risk:** Very Low
* **Dependencies:** None.

#### 4. Add "Mark All Present" One-Click Action to Classroom Attendance
* **Problem:** Teachers in 45-student high school classes must click through individual students or rely on manual overrides ([`ClassroomAttendanceBoard.tsx:191`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx#L191)).
* **Inspired by:** openSIS Attendance Module ([opensis.com](https://opensis.com)) "Mark All Present" pattern.
* **Proposed Change:** Add a "Mark All Unmarked as Present" button at the top of the classroom roster. In typical classes where 95%+ of students are present, this reduces teacher administrative overhead to a single click, only requiring manual toggling for absent/late exceptions.
* **Impact:** High (Teacher UX) | **Effort:** S (2 hours) | **Risk:** Low
* **Dependencies:** None.

#### 5. Replace Browser `confirm()` with a 2-Step Safe Delete Dialog
* **Problem:** Deleting student records triggers native browser alert dialogs ([`StudentManager.tsx:177`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx#L177)) with zero undo and high mobile misclick risk.
* **Inspired by:** University of Melbourne Gen 3 Modal Accessibility guidelines ([design-system.unimelb.edu.au](https://design-system.unimelb.edu.au)).
* **Proposed Change:** Use the existing accessible [`Modal.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/components/ui/Modal.tsx) component with explicit confirmation text ("Type student last name to delete") or a 5-second undo toast.
* **Impact:** Med | **Effort:** S (3 hours) | **Risk:** Very Low
* **Dependencies:** None (re-uses existing `Modal.tsx`).

---

### Phase 2: Next Sprint (1–2 Weeks Effort)

#### 6. DepEd SF2 Attendance Export (Monthly Daily Attendance Register)
* **Problem:** Teachers currently have no way to export attendance data into the mandated DepEd Form 2 format, forcing them to manually re-encode attendance from the app into official DepEd spreadsheets.
* **Inspired by:** DepEd Order No. 4, s. 2014 & Order No. 54, s. 2016 ([deped.gov.ph](https://www.deped.gov.ph)).
* **Proposed Change:** Add an "Export SF2 (CSV/Excel)" action in Classroom Attendance and Academics pages. Compute official monthly figures:
  * Total Days of Classes
  * Daily present/absent/tardy grid per student
  * Consecutive absence tracking (>5 days flagged)
  * Average Daily Attendance (ADA) and Attendance Percentage.
* **Impact:** High (Massive administrative time savings for public school teachers) | **Effort:** M | **Risk:** Low
* **Dependencies:** Browser-native CSV builder or lightweight standard sheet generator (zero new heavy dependencies).

#### 7. Persist Classroom Attendance Overrides to Supabase Table
* **Problem:** Classroom teacher overrides are stored in `localStorage` ([`ClassroomAttendanceBoard.tsx:38-48`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx#L38-L48)), preventing multi-device use and school-wide administrative reporting.
* **Inspired by:** UP SAIS Faculty Portal & openSIS centralized attendance database.
* **Proposed Change:** Create a simple table `classroom_attendance_records (id, student_id, section_id, date, status, marked_by, updated_at)` with upsert on `(student_id, date)`. Replace `loadStoredOverrides` with Supabase query.
* **Impact:** High | **Effort:** M | **Risk:** Med (Requires small Supabase migration)
* **Dependencies:** Supabase migration `2026xxxx_classroom_attendance.sql`.

#### 8. Connect Real Supabase `sms_notifications` to SMS Audit Log
* **Problem:** [`SmsAuditLog.tsx:17`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/notifications/components/SmsAuditLog.tsx#L17) queries a mock adapter and misses real dispatches sent by the SMSGate edge engine and webhook functions.
* **Inspired by:** SchoolPass Parent Communication Logs ([schoolpass.com](https://schoolpass.com)).
* **Proposed Change:** Switch the query in `SmsAuditLog` to `supabase.from('sms_notifications').select('*').order('sent_at', { ascending: false })`. Display real delivery status (`sent`, `failed`, `pending`), gateway message IDs, and error messages.
* **Impact:** High | **Effort:** S-M | **Risk:** Low
* **Dependencies:** None. The table and Edge Function already exist.

#### 9. 5-Day Consecutive Absence Alerting (DepEd SARDO Early Warning)
* **Problem:** Chronic absenteeism is only noticed at end-of-month manual reviews.
* **Inspired by:** DepEd Order No. 4, s. 2014 Section V (Students-At-Risk-of-Dropping-Out intervention trigger).
* **Proposed Change:** Display an "At-Risk Alert" badge next to any student with 5 or more consecutive absences on the Classroom Attendance board and Overview dashboard, prompting guidance counselor intervention before formal dropout occurs.
* **Impact:** High (Direct positive student retention impact) | **Effort:** M | **Risk:** Low
* **Dependencies:** Computed client-side or via a simple Postgres SQL view.

---

### Phase 3: Later (Future Enhancements)

#### 10. Offline Queue for Classroom Attendance via IndexedDB
* **Problem:** Public schools in Region IV-A often experience campus Wi-Fi drops or mobile signal degradation during inclement weather. If internet drops, teachers cannot mark attendance.
* **Inspired by:** NUS uNivUS offline resilience and progressive web app standards.
* **Proposed Change:** When network status is offline (`navigator.onLine === false`), queue manual attendance marks into IndexedDB (already used for biometric photo caching) and auto-sync when connection restores.
* **Impact:** High (Operational reliability) | **Effort:** L | **Risk:** Med (Conflict resolution on sync)
* **Dependencies:** Native browser IndexedDB API.

#### 11. DepEd Google Workspace SSO Authentication
* **Problem:** Staff manage separate email/password credentials for the app, leading to forgotten passwords and admin support tickets.
* **Inspired by:** UP SAIS (UP Mail SSO) and UST (UST Google Workspace TOTP SSO).
* **Proposed Change:** Enable Supabase Google Auth restricted to the `@deped.gov.ph` domain so teachers log in with their official DepEd credentials.
* **Impact:** Med | **Effort:** M | **Risk:** Low (Requires DepEd OAuth app approval)
* **Dependencies:** Supabase Auth Google Provider configuration.

---

## 4. Master Recommendation Matrix

| # | Recommendation | Screen / Target File | Impact | Effort | Inspired By |
|---|---|---|---|---|---|
| **1** | Fix Dashboard Metrics Query & Denominator | [`src/routes/DashboardOverviewPage.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/DashboardOverviewPage.tsx) | High | S (<2h) | DepEd SF2 & openSIS |
| **2** | Mask Guardian Phone Numbers (RA 10173) | [`SmsAuditLog.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/notifications/components/SmsAuditLog.tsx), [`StudentManager.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx) | High | S (1h) | Ateneo UDPO Privacy Standards |
| **3** | Prepend Live Realtime Scan Events in Memory | [`LiveGateLog.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/LiveGateLog.tsx) | High | S (1h) | Stanford Decanter & SchoolPass |
| **4** | "Mark All Present" One-Click Classroom Action | [`ClassroomAttendanceBoard.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx) | High | S (2h) | openSIS Classroom Workflow |
| **5** | Accessible 2-Step Deletion Modal (No `confirm()`) | [`StudentManager.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/students/components/StudentManager.tsx) | Med | S (3h) | Univ. of Melbourne Gen 3 Design System |
| **6** | DepEd School Form 2 (SF2) CSV/Sheet Export | [`ClassroomAttendanceBoard.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx) | High | M (2d) | DepEd Order 4, s. 2014 & Order 54, s. 2016 |
| **7** | Persist Teacher Overrides to Supabase Table | [`ClassroomAttendanceBoard.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx), Supabase | High | M (2d) | UP SAIS Faculty Portal |
| **8** | Connect Real `sms_notifications` Table to UI | [`SmsAuditLog.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/notifications/components/SmsAuditLog.tsx) | High | S-M (4h) | SchoolPass Dispatch Logs |
| **9** | 5-Day Consecutive Absence Early Warning (SARDO) | [`DashboardOverviewPage.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/DashboardOverviewPage.tsx), [`ClassroomAttendanceBoard.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx) | High | M (1d) | DepEd SARDO Drop-Out Interventions |
| **10** | IndexedDB Offline Queue for Classroom Attendance | [`ClassroomAttendanceBoard.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/features/attendance/components/ClassroomAttendanceBoard.tsx), sync engine | High | L (1w) | NUS uNivUS Offline Attendance |
| **11** | DepEd Google Workspace SSO (`@deped.gov.ph`) | [`AdminLoginPage.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/AdminLoginPage.tsx), [`TeacherLoginPage.tsx`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src/routes/TeacherLoginPage.tsx) | Med | M (2d) | UP SAIS & UST Google Authenticator SSO |

---

## 5. Considered and Rejected

| Proposed Concept | Source / Precedent | Rationale for Rejection |
|---|---|---|
| **Commercial SMS Provider Integration (Twilio/Infobip)** | Global SaaS Standard | **Rejected.** Prohibitive per-message international fees (~$0.05/SMS) unsustainable on public school MOOE (Maintenance and Other Operating Expenses) budget. Current local Android SMSGate hardware gateway costs zero per-message on unlimited domestic telco promos. |
| **In-Browser Deep Face Recognition Neural Net** | MIT/Stanford Computer Vision Research | **Rejected.** Running large facial recognition inference directly on low-spec teacher Chromebooks or budget Android phones causes browser freezing, extreme thermal throttling, and battery drain. The Python edge engine (OpenCV YuNet + SFace) on the dedicated gate machine is the appropriate architecture. |
| **Enterprise SSO & SAML IdP (Okta / Ping Identity)** | Top Universities (MIT Touchstone, Stanford WebAuth) | **Rejected.** Massive licensing cost and complex enterprise IT administration required. If SSO is needed, standard Google Workspace OAuth for DepEd email is free and native. |
| **Native Mobile Apps (iOS/Android in Swift/Kotlin)** | NUS uNivUS Mobile App | **Rejected.** Requires maintaining three codebases, paying Apple Developer ($99/year) and Google Play licenses, and handling app store review cycles. The current mobile-responsive PWA layout in React + Tailwind provides 95% of the utility with zero store friction. |
| **Heavy Business Intelligence Tools (PowerBI / Tableau)** | Enterprise SIS Portals | **Rejected.** Adds unnecessary cloud hosting costs, complex data pipelines, and steep learning curves for public school teachers. Native tabular exports into DepEd's familiar Excel format provide far greater utility. |

---

## 6. Open Questions for School Administration

1. **DepEd Form 2 Output Format:** Does San Roque National High School currently accept a standard CSV/Excel attendance export, or must the output strictly follow the Division of Antipolo City's official pre-formatted `.xlsx` SF2 workbook template?
2. **Guardian SMS Alert Policy:** Should automated SMS alerts for gate entry/exit be sent immediately upon every scan, or should the school batch/throttle SMS dispatches to avoid draining the SIM's daily carrier caps (typically 800–1000 SMS/day on local telcos)?
3. **Teacher Attendance Override Hierarchy:** If a gate turnstile camera automatically logs a student as "Present" at 7:15 AM, but the advisory teacher marks them "Absent" during 1st period roll call (e.g., cutting class or in the clinic), which record takes precedence in official school reports?
4. **Biometric Consent Form Archives:** Where are the signed physical DepEd biometric consent slips currently filed, and should the student profile store a physical archive reference number (e.g., Box/Folder ID) to satisfy National Privacy Commission (NPC) audit requirements?
5. **Staff Authentication Standards:** Do all SRNHS teachers and administrative staff possess active `@deped.gov.ph` Google Workspace accounts, or do some contractual/local personnel use personal email addresses?

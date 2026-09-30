# Project File Structure — SRNHS Attendance & Monitoring System

**Project:** San Roque National High School (SRNHS) Automated Facial Recognition Attendance & Monitoring System  
**Institution:** San Roque National High School (DepEd Region IV-A CALABARZON)

---

## Complete Directory Tree

```text
SRNHS-WEBAPP/
├── .agents/                                # AI agent customizations and skills
│   ├── rules/
│   │   └── ponytail.md
│   └── skills/
│       ├── ponytail/                       # Minimalist / YAGNI engineering skill
│       ├── ponytail-audit/
│       ├── ponytail-debt/
│       ├── ponytail-gain/
│       ├── ponytail-help/
│       └── ponytail-review/
├── .env                                    # Environment variables (local, gitignored)
├── .env.example                            # Root environment template
├── .gitignore                              # Git exclusion rules
├── FILE_STRUCTURE.md                       # Comprehensive file structure documentation
├── SF2-Daily-Attendance-Report-of-Learners.pdf # Official DepEd SF2 template reference
├── SYSTEM_DESIGN.md                        # Complete IT11 system architecture & spec
├── stack.md                                # Technology stack documentation
├── package.json                            # Node.js dependencies & scripts
├── package-lock.json                       # Exact lockfile for npm dependencies
├── tsconfig.json                           # TypeScript strict compiler configuration
├── tailwind.config.js                      # Tailwind CSS design system tokens & theme
├── postcss.config.js                       # PostCSS configuration for Tailwind
├── vite.config.ts                          # Vite build tool & basic-ssl dev server config
├── vercel.json                             # Vercel SPA routing and header configuration
├── index.html                              # HTML5 entry point template
│
├── docs/                                   # Architectural audit & improvement reports
│   └── IMPROVEMENT_REPORT.md               # Hardening & enhancement report
│
├── public/                                 # Static public assets
│   ├── _redirects                          # SPA fallback redirect rule
│   └── srnhs-seal.jpg                      # Official San Roque NHS school seal
│
├── scripts/                                # Project maintenance & security audit scripts
│   └── check-no-dummy-auth.mjs             # Zero-dummy-auth CI verification script
│
├── infra/                                  # Local and edge infrastructure configs
│   └── mediamtx.yml                        # MediaMTX WebRTC (WHEP) / RTSP video streamer
│
├── edge_engine/                            # Turnstile edge recognition & hardware engine
│   ├── README.md                           # Edge engine operational setup guide
│   ├── SMS_HOOK.md                         # Edge SMS recognition hook guide
│   ├── gate_biometrics.py                  # Primary OpenCV YuNet + SFace recognition node
│   ├── sms_hook.py                         # Non-blocking background SMS test hook
│   ├── local_sms_gateway.py                # PySerial / AT-command GSM modem driver
│   ├── requirements.txt                    # Python edge runtime dependencies
│   ├── models/                             # Biometric ONNX deep learning models
│   │   ├── face_detection_yunet_2023mar.onnx
│   │   └── face_recognition_sface_2021dec.onnx
│   ├── tests/                              # Edge engine unit tests & manual scripts
│   │   ├── manual_hook_check.py            # Offline diagnostic runner for SMS hook
│   │   ├── test_sms_hook.py                # Unit tests for SMS recognition hook
│   │   └── test_unidentified_faces.py      # Unit tests for ambiguous & unknown face logs
│   └── logs/                               # Edge diagnostic CSV logs (gitignored)
│
├── tools/                                  # Diagnostic and evaluation harnesses
│   └── sms_test/                           # Standalone SMSGate test harness
│       ├── README.md                       # Test harness documentation & CLI commands
│       ├── .env.example                    # SMSGate test configuration template
│       ├── sms_test.py                     # CLI benchmark tool (send, burst, soak, badnumber, report)
│       ├── test_sms_test.py                # Unit tests for SMSGate test tool
│       └── results/                        # Benchmark results CSV logs (gitignored)
│
├── supabase/                               # Supabase backend definitions
│   ├── functions/                          # Supabase Edge Functions (Deno / TypeScript)
│   │   ├── notify-test-sms/                # SMS delivery test & diagnostic function
│   │   │   ├── .env.example                # Function test environment template
│   │   │   ├── README.md                   # Edge function deployment and test guide
│   │   │   ├── index.ts                    # Edge function HTTP handler
│   │   │   └── index_test.ts               # Deno unit test suite
│   │   └── send-sms/                       # Cloud SMS dispatcher function
│   │       └── index.ts                    # SMS dispatcher function handler
│   ├── migrations/                         # PostgreSQL schema migrations and RLS policies
│   └── scripts/                            # Administrative setup & maintenance scripts
│       ├── bootstrap_admin.ts              # Initial administrator provisioning
│       ├── check_schema.ts                 # Database schema verification
│       ├── create_teachers.ts              # Faculty teacher bulk account generation
│       └── reset_student_storage.ts        # Storage bucket cleanup & reset utility
│
└── src/                                    # Frontend Web Application Source (React 18 + TS)
    ├── main.tsx                            # React DOM entry point
    ├── App.tsx                             # Root application provider wrapper
    ├── index.css                           # Global styles & Tailwind CSS utility layers
    ├── vite-env.d.ts                       # Vite client TypeScript definitions
    │
    ├── config/                             # Application runtime configurations
    │   └── siteConfig.ts                   # Site navigation, titles, and branding constants
    │
    ├── context/                            # Global React Contexts
    │   ├── AuthContext.tsx                 # Supabase session & RBAC authentication state
    │   └── ThemeContext.tsx                # Dark / Light theme provider
    │
    ├── hooks/                              # Shared custom React hooks
    │   └── useRole.ts                      # Role-based authorization hooks (Admin vs Teacher)
    │
    ├── lib/                                # Core utility libraries & clients
    │   ├── supabase.ts                     # Supabase JS client instance & config
    │   ├── queryClient.ts                  # TanStack React Query global client
    │   ├── utils.ts                        # Styling helper (cn / clsx / tailwind-merge)
    │   ├── validation.ts                   # Common Zod schema validators
    │   ├── dashboardLabels.ts              # UI display label constants
    │   └── dashboardLabels.test.ts         # Unit tests for display labels
    │
    ├── types/                              # Global domain TypeScript definitions
    │   └── domain.types.ts                 # Core database schemas, students, logs, and roles
    │
    ├── routes/                             # Top-level Page Components & Router
    │   ├── AppRouter.tsx                   # Central router with protected route guards
    │   ├── LoginPage.tsx                   # Unified login selector page
    │   ├── AdminLoginPage.tsx              # Administrator login portal
    │   ├── TeacherLoginPage.tsx            # Faculty teacher login portal
    │   ├── DashboardOverviewPage.tsx       # Live admin dashboard overview & metrics
    │   ├── GateLogPage.tsx                 # Real-time turnstile entry/exit stream monitor
    │   ├── ClassroomAttendancePage.tsx     # Teacher classroom attendance tracker & roll call
    │   ├── FaceRegistrationPage.tsx        # 3-angle student biometric enrolment portal
    │   ├── StudentsPage.tsx                # Student master roster management
    │   ├── FacultyPage.tsx                 # Faculty load & teacher schedule management
    │   ├── AcademicsPage.tsx               # Academic tracks, strands, & sections management
    │   ├── SmsLogPage.tsx                  # SMS notification dispatch audit logs
    │   ├── TempAccessPage.tsx              # Temporary visitor & student QR pass generator
    │   ├── ForbiddenPage.tsx               # 403 Forbidden access denial page
    │   └── NotFoundPage.tsx                # 404 Route not found fallback page
    │
    ├── components/                         # Shared UI and motion components
    │   ├── auth/
    │   │   └── PortalLoginForm.tsx         # Reusable authenticated login form
    │   ├── motion/                         # Micro-animations & visual components
    │   │   ├── CampusDoodle.tsx            # Background decorative campus artwork
    │   │   ├── LordIcon.tsx                # Animated icon renderer
    │   │   └── PageFade.tsx                # Framer Motion page transition wrapper
    │   └── ui/                             # Standard UI component primitives
    │       ├── Card.tsx                    # Glassmorphic card container
    │       ├── DataTable.tsx               # Sortable, filterable paginated data table
    │       ├── Modal.tsx                   # Accessible modal dialog
    │       ├── NavigationLayout.tsx        # Responsive sidebar, header, and user menu
    │       ├── StateViews.tsx              # Empty, loading, and error UI placeholders
    │       └── StatusBadge.tsx             # Color-coded attendance status pills
    │
    ├── features/                           # Feature-driven business modules
    │   ├── academics/                      # Academic structure management
    │   │   └── components/
    │   │       └── AcademicsManager.tsx    # Sections and grade level management UI
    │   │
    │   ├── attendance/                     # Core attendance monitoring & vision engine
    │   │   ├── components/
    │   │   │   ├── LiveGateLog.tsx         # Real-time turnstile recognition feed table
    │   │   │   ├── LiveCameraFeedCard.tsx  # WebRTC / webcam video stream card
    │   │   │   ├── ClassroomAttendanceBoard.tsx # Classroom roll-call grid
    │   │   │   └── ManualEntryModal.tsx    # Manual attendance override modal
    │   │   ├── hooks/
    │   │   │   └── useFaceRecognition.ts   # Web-based real-time face detection hook
    │   │   ├── lib/
    │   │   │   ├── faceNetEngine.ts        # Client-side face descriptor extraction
    │   │   │   ├── faceNetMatcher.ts       # Cosine similarity vector matcher
    │   │   │   ├── recognitionStatus.ts    # Biometric match status definitions
    │   │   │   └── tesdaQualityEngine.ts   # Image illumination and clarity scoring
    │   │   └── services/
    │   │       ├── RecognitionAdapter.ts   # Abstract recognition data adapter interface
    │   │       ├── SupabaseRecognitionAdapter.ts # Production Supabase Realtime adapter
    │   │       ├── MockRecognitionAdapter.ts     # Offline mock development adapter
    │   │       └── WebRtcStream.ts         # MediaMTX WebRTC (WHEP) stream player
    │   │
    │   ├── faceRegistration/               # Student biometric enrolment pipeline
    │   │   ├── api.ts                      # Biometric storage upload & profile APIs
    │   │   ├── types.ts                    # Enrolment session & landmark types
    │   │   ├── hooks/
    │   │   │   ├── useCamera.ts            # User media webcam permissions & stream hook
    │   │   │   ├── useFaceCaptureSession.ts # 3-angle multi-frame enrolment state machine
    │   │   │   ├── useFaceDetection.ts     # MediaPipe landmark detection hook
    │   │   │   └── useRegisterStudentFace.ts# Vector submission & database save mutation
    │   │   └── components/
    │   │       ├── CameraPreview.tsx       # Live enrolment camera viewfinder
    │   │       ├── CaptureControls.tsx     # Enrolment capture action buttons
    │   │       ├── CaptureProgressDots.tsx # Front/Left/Right angle progress indicator
    │   │       ├── CapturedFrameThumbnails.tsx # Captured angle previews
    │   │       ├── ConsentConfirmCheckbox.tsx # RA 10173 Data Privacy consent check
    │   │       ├── FaceCaptureModal.tsx    # Full-screen guided biometric modal
    │   │       ├── LivenessStepBanner.tsx  # Interactive posture guidance banner
    │   │       ├── SectionRosterEnrollment.tsx # Section-based batch enrolment view
    │   │       ├── StudentRosterRow.tsx    # Individual student enrolment status row
    │   │       └── ViewRegisteredFaceModal.tsx # Inspection modal for enrolled portraits
    │   │
    │   ├── faculty/                        # Faculty teacher management
    │   │   └── components/
    │   │       └── FacultyManager.tsx      # Teacher profile & section assignment UI
    │   │
    │   ├── notifications/                  # SMS parent notification subsystem
    │   │   ├── components/
    │   │   │   └── SmsAuditLog.tsx         # SMS dispatch log history & status table
    │   │   └── services/
    │   │       ├── index.ts                # Notification service exports
    │   │       ├── NotificationAdapter.ts  # Notification interface contract
    │   │       ├── MockNotificationAdapter.ts # Offline notification mock
    │   │       └── supabaseNotificationAdapter.ts # Supabase Edge Function SMS delivery adapter
    │   │
    │   ├── students/                       # Student registry subsystem
    │   │   ├── api.ts                      # Student CRUD and roster fetching queries
    │   │   └── components/
    │   │       └── StudentManager.tsx      # Student record editor & LRN management
    │   │
    │   ├── sync/                           # Offline-first caching & sync
    │   │   ├── syncService.ts              # LocalStorage / IndexedDB cache synchronization
    │   │   └── components/
    │   │       └── DeviceSyncModal.tsx     # Offline sync status & manual trigger modal
    │   │
    │   └── tempAccess/                     # Visitor & temporary QR access passes
    │       ├── api.ts                      # Temporary pass generation & validation APIs
    │       ├── types.ts                    # QR pass schema definitions
    │       └── components/
    │           └── GenerateAccessQrModal.tsx # QR code generator modal
    │
    └── test/                               # Frontend unit and integration tests (Vitest)
        ├── setup.ts                        # Vitest environment setup and mocks
        ├── RecognitionAdapter.test.ts      # Tests for Supabase / Mock recognition adapters
        ├── authHardening.test.ts           # Tests for role-based authentication & route security
        ├── faceNetMatcher.test.ts          # Tests for client-side cosine similarity matching
        └── tempAccess.test.ts              # Tests for QR temporary access pass logic
```

---

## Key Modules by Tier

| Tier | Directory | Description |
| :--- | :--- | :--- |
| **Frontend Web App** | [`src/`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/src) | React 18 + TypeScript SPA with Role-Based Access Control, Realtime turnstile dashboard, 3-angle biometric enrolment, and SF2 reporting. |
| **Edge Biometrics Engine** | [`edge_engine/`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/edge_engine) | Python 3.11 OpenCV YuNet + SFace node running at physical gate turnstiles for low-latency face recognition and feature-flagged SMSGate dispatch. |
| **Diagnostic Testing Tooling** | [`tools/sms_test/`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/tools/sms_test) | Isolated CLI tool for benchmarking SMSGate Android gateway (latency, throughput, soak, bad-number handling). |
| **Cloud & Backend BaaS** | [`supabase/`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/supabase) | Supabase PostgreSQL schema, migrations, RLS security policies, Storage buckets, and Deno Edge Functions. |
| **Video Streaming Infra** | [`infra/`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/infra) | MediaMTX RTSP-to-WebRTC (WHEP) streaming server configuration for ultra-low latency browser preview. |
| **System Architecture Specs** | [`SYSTEM_DESIGN.md`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/SYSTEM_DESIGN.md), [`stack.md`](file:///c:/Users/Sheila/OneDrive/Desktop/SRNHS%20WEBAPP/stack.md) | Comprehensive architecture documentation, compliance matrices, and technology stack breakdown. |

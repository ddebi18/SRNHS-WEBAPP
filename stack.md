# Technology Stack — SRNHS Attendance & Monitoring System

**Project:** San Roque National High School (SRNHS) Automated Facial Recognition Attendance & Monitoring System  
**Institution:** San Roque National High School (DepEd Region IV-A CALABARZON)

---

## 1. Web Application Tier (Frontend)

| Layer / Domain | Technology | Version / Spec | Purpose |
| :--- | :--- | :--- | :--- |
| **Core Framework** | [React](https://react.dev/) | `^18.3.1` | Component-based interactive UI library |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `^5.6.3` | Type-safe static analysis and strict typing |
| **Build Tool & Dev Server** | [Vite](https://vitejs.dev/) + `@vitejs/plugin-react` | `^6.0.3` / `^4.3.4` | Next-generation frontend tooling, Fast Refresh & HMR |
| **SSL Development** | `@vitejs/plugin-basic-ssl` | `^2.3.0` | Local HTTPS certificate generator for camera/biometric permissions |
| **Routing** | [React Router DOM](https://reactrouter.com/) | `^6.28.0` | Client-side routing with role-based route guards |
| **Server State Management** | [TanStack React Query](https://tanstack.com/query/latest) | `^5.62.0` | Asynchronous caching, synchronization, and background refetching |
| **Cloud & BaaS Client** | [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript) | `^2.47.0` | Client for PostgreSQL PostgREST, Auth JWT, Realtime & Storage |
| **Styling & Design System** | [Tailwind CSS](https://tailwindcss.com/) | `^3.4.16` | Utility-first styling with custom theme configurations |
| **CSS Preprocessing** | PostCSS, Autoprefixer | `^8.4.49` / `^10.4.20` | Vendor prefixing and stylesheet transformations |
| **Component Utilities** | `clsx`, `tailwind-merge`, `class-variance-authority` | Latest | Dynamic className composition and component variants |
| **Icons** | [Lucide React](https://lucide.dev/) | `^0.469.0` | Vector icon system |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | `^13.1.1` | Fluid UI transitions, micro-interactions, and modal animations |
| **Forms & Validation** | [React Hook Form](https://react-hook-form.com/) + `@hookform/resolvers` + [Zod](https://zod.dev/) | `^7.54.0` / `^3.9.1` / `^3.24.1` | Schema-driven form validation and error handling |
| **Client Face AI & Vision** | [`@vladmandic/face-api`](https://github.com/vladmandic/face-api), `@mediapipe/tasks-vision` | `^1.7.15` / `^1.0.1` | Web-based face landmark detection and enrolment verification |
| **QR Code Generation** | `qrcode.react` | `^4.2.0` | Generation of temporary access and student pass QR codes |
| **Testing Suite** | [Vitest](https://vitest.dev/), `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` | `^2.1.8` / `^16.1.0` / `^6.6.3` / `^25.0.1` | Fast unit, component, and integration testing |

---

## 2. Edge Biometrics & Hardware Tier

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Runtime Environment** | Python 3.11+ | Edge turnstile runtime for gate capture pipeline |
| **Computer Vision Engine** | OpenCV (`opencv-python >= 4.8.0`) | Video stream decoding from turnstile IP cameras and image preprocessing |
| **Vector Embeddings** | NumPy (`numpy >= 1.24.0`) | Vector calculations and Euclidean / Cosine similarity matching for 128-D facial embeddings |
| **API & Cloud Sync** | Requests (`requests >= 2.31.0`) | Edge-to-cloud PostgREST synchronization and real-time attendance dispatch |
| **SMS Gateway Integration** | PySerial / AT Commands (`local_sms_gateway.py`) | Hardware GSM modem interface for offline and real-time parent/guardian SMS alerts |

---

## 3. Backend & Cloud BaaS Tier (Supabase)

| Service | Technology | Role & Function |
| :--- | :--- | :--- |
| **Database** | PostgreSQL | Relational storage for students, schedules, sections, logs, and biometrics |
| **Security & Privacy** | Row Level Security (RLS) | Granular access control adhering to the Philippine Data Privacy Act (RA 10173) |
| **Realtime Sync** | Supabase Realtime (WebSocket) | Live broadcast of turnstile attendance logs directly to staff dashboards |
| **Authentication** | Supabase Auth (JWT & GoTrue) | Role-Based Access Control (RBAC: Admin vs. Teacher) |
| **Object Storage** | Supabase Storage | Encrypted cloud storage for student reference portraits and compliance logs |
| **Serverless Functions** | Supabase Edge Functions (Deno) | Backend event triggers, SMS dispatcher (`send-sms`), and delivery tester (`notify-test-sms`) |
| **Admin & Migration Scripts** | TypeScript (`ts-node` / Deno) | Setup tools (`bootstrap_admin.ts`, `create_teachers.ts`, `check_schema.ts`, `reset_student_storage.ts`) |
| **Security Auditing** | Node.js ESM (`scripts/check-no-dummy-auth.mjs`) | Automated CI gatekeeper ensuring zero dummy auth fallback in production code |

---

## 4. Hosting & Infrastructure

| Environment | Platform | Notes |
| :--- | :--- | :--- |
| **Web Application Hosting** | [Vercel](https://vercel.com/) | Continuous deployment with SPA rewrite rules (`vercel.json`) |
| **Edge Hardware** | Local Gate / Turnstile PC | Linux/Windows edge device with camera and GSM module attached |
| **Cloud Infrastructure** | Supabase Cloud | Managed PostgreSQL, Auth, and Storage infrastructure |
| **Version Control** | Git & GitHub | Distributed version control and branch management |

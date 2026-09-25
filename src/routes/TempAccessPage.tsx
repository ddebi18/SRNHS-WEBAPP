import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  validateAccessToken,
  completeAccessGrant,
} from '@/features/tempAccess/api';
import {
  ValidateTokenResponse,
} from '@/features/tempAccess/types';
import { ensureFaceNetModels, detectAccurateFace } from '@/features/attendance/lib/faceNetEngine';
import {
  Camera,
  ShieldCheck,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Phone,
  User,
  Heart,
  ChevronRight,
  Lock,
} from 'lucide-react';

// Guardian Form Validation Schema
const guardianFormSchema = z.object({
  name: z.string().min(3, 'Guardian name must be at least 3 characters'),
  relationship: z.string().min(2, 'Please specify relationship (e.g. Mother, Father)'),
  phone_number: z
    .string()
    .regex(/^(09|\+639)\d{9}$/, 'Please enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional(),
});

type GuardianFormData = z.infer<typeof guardianFormSchema>;

export const TempAccessPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // In-memory temporary session state ONLY (Never stored in localStorage)
  const [session, setSession] = useState<ValidateTokenResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  // Expiration countdown
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Wizard state: 'face' | 'guardian' | 'completed'
  const [currentStep, setCurrentStep] = useState<'face' | 'guardian' | 'completed'>('face');

  // Camera & Face capture state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFaceInFrame, setIsFaceInFrame] = useState(false);
  const [livenessPassed, setLivenessPassed] = useState(false);
  const [livenessPrompt, setLivenessPrompt] = useState('Look straight at the camera and slowly turn your head or blink');
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedDescriptor, setCapturedDescriptor] = useState<number[] | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Liveness detection tracker
  const prevBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const motionHistoryRef = useRef<number[]>([]);

  // Submission state
  const [submitting, setSubmitting] = useState(false);

  // Guardian Form
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<GuardianFormData>({
    resolver: zodResolver(guardianFormSchema),
    mode: 'onChange',
  });

  // 1. Initial Token Validation on Mount
  useEffect(() => {
    let isMounted = true;
    if (!token) {
      setErrorState('No access token provided.');
      setLoading(false);
      return;
    }

    async function initSession() {
      try {
        const res = await validateAccessToken(token!);
        if (!isMounted) return;

        if (!res.valid) {
          if (res.reason === 'already_used') {
            setErrorState('This single-use access link has already been used and completed.');
          } else if (res.reason === 'expired') {
            setErrorState('This temporary access link has expired. Please ask staff to generate a new one.');
          } else if (res.reason === 'revoked') {
            setErrorState('This temporary access link has been revoked by administration.');
          } else {
            setErrorState('This access link is invalid. Please request a new QR code from your teacher or administrator.');
          }
          setLoading(false);
          return;
        }

        setSession(res);

        // Pre-fill guardian info if already exists
        if (res.guardian) {
          setValue('name', res.guardian.name || '');
          setValue('relationship', res.guardian.relationship || '');
          setValue('phone_number', res.guardian.phone_number || '');
        }

        // Calculate countdown seconds
        if (res.expires_at) {
          const diff = Math.max(0, Math.floor((new Date(res.expires_at).getTime() - Date.now()) / 1000));
          setRemainingSeconds(diff);
        }

        // Determine starting step based on purpose
        if (res.purpose === 'guardian_update') {
          setCurrentStep('guardian');
        } else {
          setCurrentStep('face');
        }

        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        setErrorState(err.message || 'Unable to validate temporary session.');
        setLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [token, setValue]);

  // 2. Client-side Expiry Countdown Timer
  useEffect(() => {
    if (!session || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorState('Your temporary access session has expired. Please request a new QR from school staff.');
          setSession(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session, remainingSeconds]);

  // 3. Camera lifecycle for Face Step
  useEffect(() => {
    if (currentStep !== 'face') {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      setCameraActive(false);
      return;
    }

    let activeStream: MediaStream | null = null;

    async function startCamera() {
      try {
        setCameraError(null);
        ensureFaceNetModels().catch(() => {});

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(() => {});
            setCameraActive(true);
          };
        }
      } catch (err: any) {
        setCameraError('Camera access denied or unavailable. Please enable camera permissions.');
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      setCameraActive(false);
    };
  }, [currentStep]);

  // 4. Liveness tracking loop
  useEffect(() => {
    if (!cameraActive || currentStep !== 'face' || capturedPhotoUrl) return;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const detection = await detectAccurateFace(video, 0.45);
        if (!detection) {
          setIsFaceInFrame(false);
          setLivenessPrompt('Position your face inside the circle');
          return;
        }

        setIsFaceInFrame(true);
        const box = detection.detection.box;

        if (prevBoxRef.current) {
          const dx = Math.abs(box.x - prevBoxRef.current.x);
          const dy = Math.abs(box.y - prevBoxRef.current.y);
          const motion = Math.hypot(dx, dy);

          motionHistoryRef.current.push(motion);
          if (motionHistoryRef.current.length > 8) {
            motionHistoryRef.current.shift();
          }

          // Check if natural micro-movement or head turn occurred
          const avgMotion =
            motionHistoryRef.current.reduce((a, b) => a + b, 0) / motionHistoryRef.current.length;

          if (avgMotion > 1.8 && avgMotion < 45) {
            setLivenessPassed(true);
            setLivenessPrompt('Liveness confirmed! You can now capture your face.');
          } else if (!livenessPassed) {
            setLivenessPrompt('Turn your head slightly or blink naturally to confirm liveness');
          }
        }

        prevBoxRef.current = { x: box.x, y: box.y, w: box.width, h: box.height };
      } catch {
        // Continue tracking
      }
    }, 250);

    return () => clearInterval(interval);
  }, [cameraActive, currentStep, capturedPhotoUrl, livenessPassed]);

  // Handle Capture
  const handleCapture = async () => {
    if (!videoRef.current || !livenessPassed) return;
    setCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.88);

      // Extract FaceNet 128D embedding
      const detection = await detectAccurateFace(video, 0.50);
      if (!detection || !detection.descriptor) {
        throw new Error('Could not extract a clear biometric vector. Please ensure good lighting and face forward.');
      }

      const descriptorArray = Array.from(detection.descriptor);

      setCapturedPhotoUrl(photoDataUrl);
      setCapturedDescriptor(descriptorArray);

      // Stop video stream
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
      setCameraActive(false);
    } catch (err: any) {
      alert(err.message || 'Capture failed. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handleRetake = () => {
    setCapturedPhotoUrl(null);
    setCapturedDescriptor(null);
    setLivenessPassed(false);
    motionHistoryRef.current = [];
    prevBoxRef.current = null;
  };

  // Complete Grant Handler
  const handleFinalSubmit = async (guardianData?: GuardianFormData) => {
    if (!token || !session) return;
    setSubmitting(true);

    try {
      const payload = {
        token,
        faceDescriptors: capturedDescriptor ? [capturedDescriptor] : undefined,
        capturedPhotoUrl: capturedPhotoUrl || undefined,
        guardianDetails: guardianData
          ? {
              name: guardianData.name,
              relationship: guardianData.relationship,
              phone_number: guardianData.phone_number,
              email: guardianData.email,
              address: guardianData.address,
            }
          : undefined,
      };

      const res = await completeAccessGrant(payload);
      if (!res.success) {
        throw new Error(res.error || 'Failed to submit registration.');
      }

      // Memory-only session teardown
      setSession(null);
      setCurrentStep('completed');
    } catch (err: any) {
      alert(err.message || 'An error occurred during completion. Please ask staff for assistance.');
    } finally {
      setSubmitting(false);
    }
  };

  // Format countdown string
  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Render States ─────────────────────────────────────────────────────────

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-4">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-400 mx-auto" />
          <p className="text-sm text-neutral-400">Validating temporary access credential…</p>
        </div>
      </div>
    );
  }

  // Error / Expired Screen
  if (errorState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-4">
        <div className="max-w-md w-full bg-neutral-800/80 border border-neutral-700 p-8 rounded-2xl text-center space-y-5 shadow-2xl backdrop-blur-md">
          <div className="w-14 h-14 rounded-full bg-rose-950/60 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Access Unavailable</h2>
            <p className="text-sm text-neutral-400 mt-2">{errorState}</p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => navigate('/teacher/login')}
              className="px-5 py-2.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-200 text-xs font-medium rounded-lg transition-colors"
            >
              Return to Faculty Sign-In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Completed Success Screen
  if (currentStep === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-neutral-800/90 border border-neutral-700 p-8 rounded-2xl text-center space-y-6 shadow-2xl"
        >
          <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Registration Complete</h2>
            <p className="text-sm text-neutral-400 mt-2">
              Your updates have been securely submitted to the San Roque National High School system.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-700/80 text-left text-xs space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Single-use token finalized and invalidated</span>
            </div>
            <p className="text-neutral-400">
              No further changes can be made with this link. You may now safely close this browser window.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const student = session?.student;
  const isBoth = session?.purpose === 'both';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-between p-4 sm:p-6 font-sans">
      {/* Top Header Bar */}
      <header className="w-full max-w-2xl flex items-center justify-between py-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg overflow-hidden bg-primary-900/50 border border-primary-700/50 flex items-center justify-center">
            <img src="/srnhs-seal.jpg" alt="SRNHS Seal" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">
              San Roque National High School
            </h1>
            <p className="text-[11px] text-neutral-400">Temporary Student Portal</p>
          </div>
        </div>

        {/* Live Expiration Countdown Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-amber-400 text-xs font-mono font-medium">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatCountdown(remainingSeconds)}</span>
        </div>
      </header>

      {/* Main Form Body */}
      <main className="w-full max-w-2xl my-6 flex-1 flex flex-col justify-center">
        {/* Student Welcome Banner */}
        {student && (
          <div className="mb-6 p-4 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
              {student.photo_url ? (
                <img src={student.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-neutral-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-white truncate">
                {student.first_name} {student.last_name}
              </h2>
              <p className="text-xs text-neutral-400">
                LRN: <span className="font-mono text-neutral-300">{student.lrn}</span> • Grade{' '}
                {student.grade_level} ({student.section_name})
              </p>
            </div>
          </div>
        )}

        {/* Step Indicator (when both tasks required) */}
        {isBoth && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                currentStep === 'face'
                  ? 'border-primary-500 bg-primary-950/40 text-primary-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>1. Face Scan</span>
              {capturedDescriptor && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            </div>

            <ChevronRight className="w-4 h-4 text-neutral-600" />

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                currentStep === 'guardian'
                  ? 'border-primary-500 bg-primary-950/40 text-primary-300'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>2. Guardian Details</span>
            </div>
          </div>
        )}

        {/* STEP 1: Biometric Face Registration with Mandatory Liveness */}
        {currentStep === 'face' && (
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Camera className="w-5 h-5 text-primary-400" />
                Biometric Face Registration
              </h3>
              <p className="text-xs text-neutral-400">
                Liveness verification required: follow the on-screen prompt to enable capture
              </p>
            </div>

            {/* Camera Viewfinder */}
            <div className="relative mx-auto w-full max-w-sm aspect-[4/3] rounded-2xl overflow-hidden bg-black border-2 border-neutral-700 flex items-center justify-center shadow-inner">
              {!capturedPhotoUrl ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  {/* Oval Face Guide */}
                  <div
                    className={`absolute inset-0 pointer-events-none border-2 rounded-full m-8 transition-colors ${
                      livenessPassed
                        ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                        : isFaceInFrame
                        ? 'border-amber-400'
                        : 'border-neutral-600'
                    }`}
                  />
                  {/* Dynamic Status / Liveness Prompt Banner */}
                  <div className="absolute bottom-3 inset-x-3 p-2 rounded-lg bg-black/75 backdrop-blur-sm text-center text-xs">
                    <span
                      className={`font-medium ${
                        livenessPassed
                          ? 'text-emerald-400'
                          : isFaceInFrame
                          ? 'text-amber-300'
                          : 'text-neutral-400'
                      }`}
                    >
                      {livenessPrompt}
                    </span>
                  </div>
                </>
              ) : (
                <div className="relative w-full h-full">
                  <img
                    src={capturedPhotoUrl}
                    alt="Captured Front"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3 px-2 py-1 rounded bg-emerald-950/80 border border-emerald-700 text-emerald-400 text-xs font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Biometrics Extracted
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 p-6 bg-neutral-900/95 flex flex-col items-center justify-center text-center space-y-3">
                  <AlertCircle className="w-8 h-8 text-rose-400" />
                  <p className="text-xs text-neutral-300">{cameraError}</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              {!capturedPhotoUrl ? (
                <button
                  type="button"
                  disabled={!livenessPassed || capturing}
                  onClick={handleCapture}
                  className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 disabled:hover:bg-primary-600 text-white font-semibold text-sm shadow-md transition-all flex items-center gap-2"
                >
                  {capturing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      Capture Frame
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                  >
                    Retake Photo
                  </button>

                  {isBoth ? (
                    <button
                      type="button"
                      onClick={() => setCurrentStep('guardian')}
                      className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
                    >
                      <span>Proceed to Guardian Details</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleFinalSubmit()}
                      className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
                    >
                      {submitting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Finalize Face Registration
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Guardian Details Form */}
        {currentStep === 'guardian' && (
          <form
            onSubmit={handleSubmit((data) => handleFinalSubmit(data))}
            className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 space-y-5 shadow-xl"
          >
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                <Heart className="w-5 h-5 text-rose-400" />
                Emergency Guardian Contact Details
              </h3>
              <p className="text-xs text-neutral-400">
                Official SMS notifications and emergency gate alerts will be routed to this number
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Guardian Full Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    {...register('name')}
                    placeholder="e.g. Elena Reyes"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  />
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                </div>
                {errors.name && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Relationship *
                  </label>
                  <select
                    {...register('relationship')}
                    className="w-full px-3 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                  >
                    <option value="">Select relationship</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Legal Guardian">Legal Guardian</option>
                    <option value="Grandparent">Grandparent</option>
                    <option value="Sibling">Sibling (Of Legal Age)</option>
                    <option value="Relative">Relative</option>
                  </select>
                  {errors.relationship && (
                    <p className="text-[11px] text-rose-400 mt-1">{errors.relationship.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Mobile Phone Number *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      {...register('phone_number')}
                      placeholder="09171234567"
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none font-mono"
                    />
                    <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                  </div>
                  {errors.phone_number && (
                    <p className="text-[11px] text-rose-400 mt-1">{errors.phone_number.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  {...register('email')}
                  placeholder="parent@example.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
                {errors.email && (
                  <p className="text-[11px] text-rose-400 mt-1">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between border-t border-neutral-800">
              {isBoth && (
                <button
                  type="button"
                  onClick={() => setCurrentStep('face')}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
                >
                  Back to Face Scan
                </button>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="ml-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-md transition-all flex items-center gap-2"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Complete Registration
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-2xl py-3 border-t border-neutral-800 text-center text-[11px] text-neutral-500">
        San Roque National High School • DepEd Tayo Biometric Attendance System
      </footer>
    </div>
  );
};

export default TempAccessPage;

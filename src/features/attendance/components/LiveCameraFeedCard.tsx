import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Maximize2,
  Video,
  ShieldCheck,
  Radio,
  Eye,
  CheckCircle2,
  Info,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { connectToWhepStream, WebRtcStreamConnection } from '../services/WebRtcStream';
import { useFaceDetection } from '@/features/faceRegistration/hooks/useFaceDetection';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
import { getRecognitionStatusText } from '../lib/recognitionStatus';
import { MIN_ATTENDANCE_LOG_CONFIDENCE } from '../lib/faceNetMatcher';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { useCamera } from '@/features/faceRegistration/hooks/useCamera';
import type { EventType } from '@/types/domain.types';

interface LiveCameraFeedCardProps {
  className?: string;
}

export const LiveCameraFeedCard: React.FC<LiveCameraFeedCardProps> = ({ className }) => {
  const [selectedCamera, setSelectedCamera] = useState('cam-01');
  const [scanMode, setScanMode] = useState<EventType>('entry');
  const [lastScanNotice, setLastScanNotice] = useState<{
    studentName: string;
    type: EventType;
    time: string;
    alreadyLogged?: boolean;
  } | null>(null);
  const [dailyCompletedMap, setDailyCompletedMap] = useState<Map<string, string>>(new Map());
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamState, setStreamState] = useState<'standby' | 'connecting' | 'live' | 'error'>('standby');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const webRtcConnectionRef = useRef<WebRtcStreamConnection | null>(null);
  const loggedMatchesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const cameras = [
    { id: 'cam-01', name: 'Gate 01 — Main Entrance Turnstile', location: 'Main Gate', node: 'Node-Turnstile-01', eventType: (import.meta.env.VITE_TURNSTILE_CAM_01_EVENT_TYPE || 'entry') as EventType },
    { id: 'cam-02', name: 'Gate 02 — High School Quadrangle',  location: 'Junior High Wing', node: 'Node-Turnstile-02', eventType: (import.meta.env.VITE_TURNSTILE_CAM_02_EVENT_TYPE || 'entry') as EventType },
    { id: 'cam-03', name: 'Gate 03 — Senior High Annex Gate', location: 'SHS Building', node: 'Node-Turnstile-03', eventType: (import.meta.env.VITE_TURNSTILE_CAM_03_EVENT_TYPE || 'entry') as EventType },
  ];

  const currentCam = cameras.find(c => c.id === selectedCamera) || cameras[0]!;
  const streamUrls: Record<string, string | undefined> = {
    'cam-01': import.meta.env.VITE_TURNSTILE_CAM_01_STREAM_URL,
    'cam-02': import.meta.env.VITE_TURNSTILE_CAM_02_STREAM_URL,
    'cam-03': import.meta.env.VITE_TURNSTILE_CAM_03_STREAM_URL,
  };
  const whepUrls: Record<string, string | undefined> = {
    'cam-01': import.meta.env.VITE_TURNSTILE_CAM_01_WHEP_URL,
    'cam-02': import.meta.env.VITE_TURNSTILE_CAM_02_WHEP_URL,
    'cam-03': import.meta.env.VITE_TURNSTILE_CAM_03_WHEP_URL,
  };
  const streamUrl = streamUrls[selectedCamera];
  const whepUrl = whepUrls[selectedCamera];
  const envUseWebcam = import.meta.env.VITE_TURNSTILE_USE_WEBCAM === 'true';
  const [useWebcam, setUseWebcam] = useState<boolean>(() => {
    const saved = localStorage.getItem('srnhs_turnstile_use_webcam');
    return saved !== null ? saved === 'true' : envUseWebcam;
  });

  const toggleWebcam = () => {
    setUseWebcam(prev => {
      const next = !prev;
      localStorage.setItem('srnhs_turnstile_use_webcam', String(next));
      return next;
    });
  };

  const { stream: webcamStream, start: startWebcam, stop: stopWebcam, errorMessage: cameraErrorMessage } = useCamera();
  const hasVideoSource = useWebcam ? Boolean(webcamStream) : Boolean(streamUrl || whepUrl);
  const { isFaceDetected, faceBox, detectorError } = useFaceDetection(videoRef, 'front', hasVideoSource && isVideoReady);
  const { isLoading: isRecognitionLoading, isReady: isRecognitionReady, matchedStudent, error: recognitionError, recognitionBox, isLive, isAnalyzing, triggerInstantScan, diagnosticInfo } = useFaceRecognition(videoRef, hasVideoSource);
  const [isInstantScanning, setIsInstantScanning] = useState(false);
  const activeBox = faceBox || recognitionBox;
  const isAnyFaceDetected = isFaceDetected || Boolean(recognitionBox);

  // Keep scanning whenever a face is in the camera, including after Time-In.
  useEffect(() => {
    if (!isAnyFaceDetected || !isRecognitionReady || !hasVideoSource) return;

    const runScan = () => {
      triggerInstantScan().catch(() => {});
    };

    runScan();
    const timer = setInterval(runScan, matchedStudent ? 2200 : 900);
    return () => clearInterval(timer);
  }, [isAnyFaceDetected, isRecognitionReady, matchedStudent, hasVideoSource, triggerInstantScan]);

  useEffect(() => {
    if (!useWebcam) {
      stopWebcam();
      return;
    }

    setStreamState('connecting');
    startWebcam();
    return () => stopWebcam();
  }, [useWebcam, startWebcam, stopWebcam]);

  // Synchronize video stream and readiness across camera selections (Gate 01, Gate 02, Gate 03)
  useEffect(() => {
    if (useWebcam) {
      if (videoRef.current && webcamStream) {
        if (videoRef.current.srcObject !== webcamStream) {
          videoRef.current.srcObject = webcamStream;
        }
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
        if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          setIsVideoReady(true);
          setStreamState('live');
        }
      }
    } else {
      setIsVideoReady(false);
      setStreamState(streamUrl || whepUrl ? 'connecting' : 'standby');
    }
  }, [selectedCamera, streamUrl, whepUrl, useWebcam, webcamStream]);

  // Sync daily completed Time-In and Time-Out events (enforcing once per day per student)
  useEffect(() => {
    const syncDailyLogs = (events: any[]) => {
      const todayStr = new Date().toDateString();
      const map = new Map<string, string>();
      events.forEach(e => {
        if (new Date(e.captured_at).toDateString() === todayStr) {
          const time = new Date(e.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (e.student_id) map.set(`${e.student_id}_${e.event_type}`, time);
          if (e.student_lrn) map.set(`${e.student_lrn}_${e.event_type}`, time);
        }
      });
      setDailyCompletedMap(map);
    };

    supabaseRecognitionAdapter.getEvents().then(syncDailyLogs);
    const unsub = supabaseRecognitionAdapter.subscribeToEvents(() => {
      supabaseRecognitionAdapter.getEvents().then(syncDailyLogs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isLive || !matchedStudent || matchedStudent.confidence < MIN_ATTENDANCE_LOG_CONFIDENCE) return;

    const logKey = `${matchedStudent.id}_${scanMode}`;
    const alreadyLoggedTime = dailyCompletedMap.get(logKey);

    if (alreadyLoggedTime) {
      // Student already completed this event today: enforce 1 Time-In and 1 Time-Out per day
      const lastNoticeCooldown = loggedMatchesRef.current.get(`${matchedStudent.id}_already_${scanMode}`) || 0;
      if (Date.now() - lastNoticeCooldown > 15_000) {
        loggedMatchesRef.current.set(`${matchedStudent.id}_already_${scanMode}`, Date.now());
        setLastScanNotice({
          studentName: matchedStudent.name,
          type: scanMode,
          time: alreadyLoggedTime,
          alreadyLogged: true,
        });
        setTimeout(() => setLastScanNotice(null), 4000);
      }
      return;
    }

    const lastLoggedAt = loggedMatchesRef.current.get(logKey) || 0;
    // 15 seconds cooldown to prevent rapid trigger during transition
    if (Date.now() - lastLoggedAt < 15_000) return;

    loggedMatchesRef.current.set(logKey, Date.now());
    supabaseRecognitionAdapter.logRecognitionEvent({
      student_id: matchedStudent.id,
      student_name: matchedStudent.name,
      student_lrn: matchedStudent.studentNumber,
      event_type: scanMode,
      camera_id: currentCam.id,
      gate_id: currentCam.id,
      room_name: currentCam.name,
      confidence_score: matchedStudent.confidence,
    }).then(evt => {
      const timeStr = new Date(evt?.captured_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastScanNotice({
        studentName: matchedStudent.name,
        type: scanMode,
        time: timeStr,
        alreadyLogged: false,
      });
      setTimeout(() => setLastScanNotice(null), 4000);
    }).catch(error => {
      loggedMatchesRef.current.delete(logKey);
      console.warn('Could not log recognized turnstile entry:', error);
    });
  }, [matchedStudent, isLive, scanMode, currentCam.id, currentCam.name, dailyCompletedMap]);

  useEffect(() => {
    const controller = new AbortController();
    webRtcConnectionRef.current?.close();
    webRtcConnectionRef.current = null;

    if (useWebcam || !whepUrl || !videoRef.current) {
      if (!useWebcam) {
        setStreamState(streamUrl ? 'connecting' : 'standby');
      }
      return () => controller.abort();
    }

    setStreamState('connecting');
    connectToWhepStream(videoRef.current, whepUrl, controller.signal)
      .then(connection => {
        if (controller.signal.aborted) {
          connection.close();
          return;
        }
        webRtcConnectionRef.current = connection;
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setStreamState('error');
          console.warn('WebRTC turnstile stream connection failed:', error);
        }
      });

    return () => {
      controller.abort();
      webRtcConnectionRef.current?.close();
      webRtcConnectionRef.current = null;
    };
  }, [streamUrl, whepUrl, useWebcam]);

  return (
    <>
      <div
        className={cn(
          'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden transition-colors flex flex-col',
          className
        )}
      >
        {/* ── Card Header ─────────────────────────────────────────────────── */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-slate-900 text-white dark:bg-slate-800 shadow-card-sm border border-slate-700/50 shrink-0">
              <Video className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">Live Turnstile Camera Feed</h3>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                  streamState === 'live'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                    : streamState === 'error'
                      ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60'
                )}>
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    streamState === 'live' ? 'bg-emerald-500 animate-pulse' : streamState === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                  )} />
                  {streamState === 'live' ? 'Live' : streamState === 'connecting' ? 'Connecting' : streamState === 'error' ? 'Stream Error' : 'Standby Ready'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Real-time video ingestion for facial recognition edge turnstiles
              </p>
            </div>
          </div>

          {/* Mode Switcher: Time-In vs Time-Out, Camera Selector & Webcam Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleWebcam}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-card-sm',
                useWebcam
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-emerald-500/20'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
              title={useWebcam ? 'Click to switch to IP/RTSP Stream mode' : 'Click to use your laptop or mobile camera'}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{useWebcam ? 'Webcam Active' : 'Use Webcam'}</span>
            </button>

            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setScanMode('entry')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  scanMode === 'entry'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', scanMode === 'entry' ? 'bg-white' : 'bg-emerald-500')} />
                Time-In (Entry)
              </button>
              <button
                type="button"
                onClick={() => setScanMode('exit')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer',
                  scanMode === 'exit'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', scanMode === 'exit' ? 'bg-slate-950' : 'bg-amber-500')} />
                Time-Out (Exit)
              </button>
            </div>

            <select
              value={selectedCamera}
              onChange={e => setSelectedCamera(e.target.value)}
              className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-card-sm focus:outline-none cursor-pointer"
            >
              {cameras.map(cam => (
                <option key={cam.id} value={cam.id} className="dark:bg-slate-900">
                  {cam.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Viewfinder Video Canvas Area ──────────────── */}
        <div className="p-3 sm:p-5 lg:p-6 flex-1 flex flex-col">
          <div
            ref={viewfinderRef}
            className={cn(
              'bg-slate-950 overflow-hidden flex flex-col justify-between transition-all duration-200',
              isFullscreen
                ? 'fixed inset-0 z-50 p-4 sm:p-6 bg-black/95 backdrop-blur-md rounded-none border-0'
                : 'relative w-full aspect-[4/3] sm:aspect-video min-h-[250px] sm:min-h-[300px] rounded-2xl border border-slate-800 p-2.5 sm:p-4 shadow-inner group'
            )}
          >
            {/* Subtle Grid / Scanline Background */}
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none" />

            {/* Viewfinder Target Framing Reticles */}
            <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-l-2 border-emerald-500/80 rounded-tl-sm pointer-events-none" />
            <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 w-4 h-4 sm:w-5 sm:h-5 border-t-2 border-r-2 border-emerald-500/80 rounded-tr-sm pointer-events-none" />
            <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 w-4 h-4 sm:w-5 sm:h-5 border-b-2 border-l-2 border-emerald-500/80 rounded-bl-sm pointer-events-none" />
            <div className="absolute bottom-2.5 right-2.5 sm:bottom-3 sm:right-3 w-4 h-4 sm:w-5 sm:h-5 border-b-2 border-r-2 border-emerald-500/80 rounded-br-sm pointer-events-none" />

            {/* Top HUD Overlay */}
            <div className="relative z-10 flex items-center justify-between text-[10px] sm:text-[11px] font-mono text-emerald-400/90 drop-shadow">
              <div className="flex items-center gap-1.5 sm:gap-2 bg-black/70 backdrop-blur-md px-2 sm:px-2.5 py-1 rounded-lg border border-emerald-500/30">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>{currentCam.id.toUpperCase()} · {currentCam.node} ({scanMode === 'entry' ? 'TIME-IN' : 'TIME-OUT'})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-black/70 backdrop-blur-md px-2 sm:px-2.5 py-1 rounded-lg border border-slate-700/50 text-slate-300">
                  {currentTime}
                </div>
                {isFullscreen && (
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 font-bold transition-colors cursor-pointer"
                    title="Exit Fullscreen"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Close</span>
                  </button>
                )}
              </div>
            </div>

            {/* Real-time Scan Confirmation Banner */}
            <AnimatePresence>
              {lastScanNotice && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  className={cn(
                    'relative z-20 mx-auto max-w-md w-full px-4 py-2 rounded-xl text-center shadow-lg border backdrop-blur-md flex items-center justify-center gap-2 text-xs font-black',
                    lastScanNotice.alreadyLogged
                      ? 'bg-amber-500/90 text-slate-950 border-amber-400/60 shadow-amber-500/20'
                      : lastScanNotice.type === 'entry'
                      ? 'bg-emerald-500/90 text-white border-emerald-400/50'
                      : 'bg-amber-500/90 text-slate-950 border-amber-400/50'
                  )}
                >
                  {lastScanNotice.alreadyLogged ? (
                    <>
                      <Info className="w-4 h-4 shrink-0" />
                      <span>
                        Already {lastScanNotice.type === 'entry' ? 'Timed-In' : 'Timed-Out'} Today: {lastScanNotice.studentName} ({lastScanNotice.time})
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {lastScanNotice.type === 'entry' ? 'Time-In Logged' : 'Time-Out Logged'}: {lastScanNotice.studentName} at {lastScanNotice.time}
                      </span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {((useWebcam && webcamStream) || (!useWebcam && (streamUrl || whepUrl))) && (
              <video
                ref={(el) => {
                  (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
                  if (el && useWebcam && webcamStream && el.srcObject !== webcamStream) {
                    el.srcObject = webcamStream;
                    el.play().catch(() => {});
                  }
                }}
                {...(!useWebcam && streamUrl ? { src: streamUrl } : {})}
                autoPlay
                muted
                playsInline
                onLoadStart={() => setStreamState('connecting')}
                onLoadedData={() => {
                  setIsVideoReady(true);
                  setStreamState('live');
                }}
                onPlaying={() => {
                  setIsVideoReady(true);
                  setStreamState('live');
                }}
                onError={() => {
                  if (!useWebcam) setStreamState('error');
                }}
                className={cn(
                  'absolute inset-0 z-0 w-full h-full',
                  isFullscreen ? 'object-contain' : 'object-cover'
                )}
              />
            )}

            {activeBox && (() => {
              const isHighConfidence = Boolean(matchedStudent && matchedStudent.confidence >= 0.50);
              const isRecognized = Boolean(matchedStudent);
              const isDetecting = !isRecognized && (isAnalyzing || isInstantScanning || !isRecognitionReady);
              const isSpoofWarning = isRecognized && !isLive;

              return (
                <div
                  className={cn(
                    'absolute z-10 border-2 rounded-lg pointer-events-none transition-all duration-150',
                    isSpoofWarning
                      ? 'border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : isHighConfidence
                      ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                      : isRecognized
                      ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                      : isDetecting
                      ? 'border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                      : 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  )}
                  style={{
                    left: `${(activeBox.x / activeBox.videoWidth) * 100}%`,
                    top: `${(activeBox.y / activeBox.videoHeight) * 100}%`,
                    width: `${(activeBox.width / activeBox.videoWidth) * 100}%`,
                    height: `${(activeBox.height / activeBox.videoHeight) * 100}%`,
                  }}
                >
                  <span
                    className={cn(
                      'absolute -top-6 sm:-top-7 left-0 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-lg flex items-center gap-1 sm:gap-1.5',
                      isSpoofWarning
                        ? 'bg-amber-500 text-slate-950'
                        : isHighConfidence
                        ? 'bg-emerald-500 text-slate-950'
                        : isRecognized
                        ? 'bg-emerald-500 text-slate-950'
                        : isDetecting
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-rose-500 text-white'
                    )}
                  >
                    {isSpoofWarning ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                        Verifying Liveness…
                      </>
                    ) : isRecognized ? (
                      dailyCompletedMap.has(`${matchedStudent!.id}_${scanMode}`)
                        ? `${matchedStudent!.name} · ${scanMode === 'entry' ? 'Time-In Done' : 'Time-Out Done'}`
                        : `${matchedStudent!.name} · ${Math.round(matchedStudent!.confidence * 100)}% Match`
                    ) : isDetecting ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                        Scanning Face…
                      </>
                    ) : (
                      'Unknown Face'
                    )}
                  </span>
                </div>
              );
            })()}

            {/* Center Standby Viewfinder Placeholder */}
            {!hasVideoSource && (
              <div className="relative z-10 my-auto text-center space-y-2 sm:space-y-3 py-4 sm:py-6 px-4">
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-center mx-auto shadow-card text-emerald-400"
                >
                  <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
                </motion.div>

                <div className="space-y-1 max-w-sm mx-auto px-2">
                  <div className="text-xs sm:text-sm font-black text-slate-100 tracking-wide">
                    Camera Stream Ingestion Standby
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400 font-medium leading-relaxed">
                    Connect an RTSP/WebRTC turnstile camera endpoint, or turn on your device webcam for testing.
                  </p>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUseWebcam(true);
                      localStorage.setItem('srnhs_turnstile_use_webcam', 'true');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Turn On Device Camera / Webcam</span>
                  </button>
                </div>

                {cameraErrorMessage && useWebcam && (
                  <div className="text-xs text-rose-400 bg-rose-950/60 border border-rose-800/60 rounded-xl p-2.5 max-w-sm mx-auto">
                    {cameraErrorMessage}
                  </div>
                )}

                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-800 text-[10px] sm:text-[11px] font-mono text-slate-400 max-w-full truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                  <span className="truncate">RTSP: {streamUrl || whepUrl || 'rtsp://camera01.srnhs.local:554/live/ch0'}</span>
                </div>
              </div>
            )}

            {/* Bottom HUD Overlay */}
            <div className="relative z-10 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-1 sm:gap-2 text-[9px] sm:text-[10px] font-mono text-slate-400 bg-black/75 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <span>RES: <strong className="text-slate-200">1080p</strong></span>
                <span className="hidden sm:inline">FPS: <strong className="text-slate-200">30</strong></span>
                <span>LATENCY: <strong className="text-emerald-400">&lt;50ms</strong></span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300 max-w-full truncate">
                <ShieldCheck className={cn('w-3 h-3 shrink-0', recognitionError ? 'text-rose-400' : isLive ? 'text-emerald-400' : 'text-amber-400')} />
                <span className="truncate">
                  {recognitionError
                    ? recognitionError
                    : detectorError
                    ? `Error: ${detectorError}`
                    : getRecognitionStatusText({
                    matchedStudent,
                    isLoading: isRecognitionLoading,
                    isReady: isRecognitionReady,
                    isFaceDetected: isAnyFaceDetected,
                    isAnalyzing,
                  })}
                </span>
                {isAnyFaceDetected && (
                  <span className={cn(
                    'ml-1 px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase shrink-0',
                    isLive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  )}>
                    {isLive ? 'LIVE' : 'WAIT'}
                  </span>
                )}
              </div>
            </div>

            {/* Recognition Error Banner */}
            {recognitionError && (
              <div className="relative z-10 mt-1 px-2.5 py-1.5 rounded-lg bg-rose-950/80 backdrop-blur-md border border-rose-800/60 text-rose-300 text-[10px] sm:text-[11px] font-bold flex flex-col gap-1.5">
                <span>Recognition error: {recognitionError}</span>
                <span className="text-amber-200 font-semibold">
                  Register the correct student from Face Registration. Live camera faces are never auto-assigned to another person.
                </span>
              </div>
            )}
          </div>

          {/* ── Stream Status & Action Bar ───────────────────────────────── */}
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium text-[11px] sm:text-xs">
              <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{diagnosticInfo || 'Face recognition runs in <3s. Click Instant Scan for immediate snapshot match.'}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              {hasVideoSource && (
                <button
                  onClick={async () => {
                    setIsInstantScanning(true);
                    await triggerInstantScan();
                    setIsInstantScanning(false);
                  }}
                  disabled={isInstantScanning}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white font-black text-xs shadow-md transition-all cursor-pointer shrink-0"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isInstantScanning ? 'Scanning Snapshot…' : 'Instant Scan (<1s)'}</span>
                </button>
              )}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-card-sm text-xs font-bold"
                title="Toggle Expanded View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Expand</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

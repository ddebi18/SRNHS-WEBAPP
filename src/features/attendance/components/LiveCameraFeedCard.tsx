import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  Maximize2,
  Video,
  Settings,
  ShieldCheck,
  Radio,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { connectToWhepStream, WebRtcStreamConnection } from '../services/WebRtcStream';
import { useFaceDetection } from '@/features/faceRegistration/hooks/useFaceDetection';
import { useFaceRecognition } from '../hooks/useFaceRecognition';
import { getRecognitionStatusText } from '../lib/recognitionStatus';
import { supabaseRecognitionAdapter } from '../services/SupabaseRecognitionAdapter';
import { useCamera } from '@/features/faceRegistration/hooks/useCamera';
import type { EventType } from '@/types/domain.types';

interface LiveCameraFeedCardProps {
  className?: string;
}

export const LiveCameraFeedCard: React.FC<LiveCameraFeedCardProps> = ({ className }) => {
  const [selectedCamera, setSelectedCamera] = useState('cam-01');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamState, setStreamState] = useState<'standby' | 'connecting' | 'live' | 'error'>('standby');
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
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
  const useWebcam = import.meta.env.VITE_TURNSTILE_USE_WEBCAM === 'true';
  const { stream: webcamStream, start: startWebcam, stop: stopWebcam } = useCamera();
  const hasVideoSource = useWebcam ? Boolean(webcamStream) : Boolean(streamUrl || whepUrl);
  const { isFaceDetected, faceBox, detectorError } = useFaceDetection(videoRef, 'front', hasVideoSource && isVideoReady);
  const { isLoading: isRecognitionLoading, isReady: isRecognitionReady, matchedStudent, isLive, isAnalyzing } = useFaceRecognition(videoRef, hasVideoSource);

  useEffect(() => {
    setIsVideoReady(false);
  }, [selectedCamera, streamUrl, whepUrl, useWebcam]);

  useEffect(() => {
    if (!useWebcam) {
      stopWebcam();
      return;
    }

    setStreamState('connecting');
    startWebcam();
    return () => stopWebcam();
  }, [useWebcam, startWebcam, stopWebcam]);

  useEffect(() => {
    if (videoRef.current && webcamStream) {
      videoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream]);

  useEffect(() => {
    if (!matchedStudent || matchedStudent.confidence < 0.48) return;

    const lastLoggedAt = loggedMatchesRef.current.get(matchedStudent.id) || 0;
    if (Date.now() - lastLoggedAt < 30_000) return;

    loggedMatchesRef.current.set(matchedStudent.id, Date.now());
    supabaseRecognitionAdapter.logRecognitionEvent({
      student_id: matchedStudent.id,
      event_type: currentCam.eventType,
      camera_id: currentCam.id,
      gate_id: currentCam.id,
      room_name: currentCam.name,
      confidence_score: matchedStudent.confidence,
    }).catch(error => {
      loggedMatchesRef.current.delete(matchedStudent.id);
      console.warn('Could not log recognized turnstile entry:', error);
    });
  }, [matchedStudent, currentCam.name]);

  useEffect(() => {
    const controller = new AbortController();
    webRtcConnectionRef.current?.close();
    webRtcConnectionRef.current = null;

    if (useWebcam || !whepUrl || !videoRef.current) {
      setStreamState(streamUrl || useWebcam ? 'connecting' : 'standby');
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
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden transition-colors flex flex-col',
        className
      )}
    >
      {/* ── Card Header ─────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-900 text-white dark:bg-slate-800 shadow-card-sm border border-slate-700/50">
            <Video className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">Live Turnstile Camera Feed</h3>
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border',
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
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Real-time video ingestion for facial recognition edge turnstiles
            </p>
          </div>
        </div>

        {/* Camera Selector Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCamera}
            onChange={e => setSelectedCamera(e.target.value)}
            className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-card-sm focus:outline-none cursor-pointer"
          >
            {cameras.map(cam => (
              <option key={cam.id} value={cam.id} className="dark:bg-slate-900">
                {cam.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Viewfinder Video Canvas Area (Empty / Standby) ──────────────── */}
      <div className="p-6 flex-1 flex flex-col">
        <div className="relative w-full aspect-video sm:min-h-[280px] rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex flex-col justify-between p-4 shadow-inner group">
          
          {/* Subtle Grid / Scanline Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none" />

          {/* Viewfinder Target Framing Reticles */}
          <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-emerald-500/80 rounded-tl-sm pointer-events-none" />
          <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-emerald-500/80 rounded-tr-sm pointer-events-none" />
          <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-emerald-500/80 rounded-bl-sm pointer-events-none" />
          <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-emerald-500/80 rounded-br-sm pointer-events-none" />

          {/* Top HUD Overlay */}
          <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-emerald-400/90 drop-shadow">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-emerald-500/30">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>{currentCam.id.toUpperCase()} · {currentCam.node}</span>
            </div>
            <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-700/50 text-slate-300">
              {currentTime}
            </div>
          </div>

          {((useWebcam && webcamStream) || (!useWebcam && (streamUrl || whepUrl))) && (
            <video
              ref={videoRef}
              {...(!useWebcam && streamUrl ? { src: streamUrl } : {})}
              autoPlay
              muted
              playsInline
              onLoadStart={() => setStreamState('connecting')}
              onLoadedData={() => setIsVideoReady(true)}
              onPlaying={() => {
                setIsVideoReady(true);
                setStreamState('live');
              }}
              onError={() => {
                // Don't set error state for webcam mode (no src attribute to fail)
                if (!useWebcam) setStreamState('error');
              }}
              className="absolute inset-0 z-0 w-full h-full object-cover"
            />
          )}

          {faceBox && (() => {
            const isHighConfidence = Boolean(matchedStudent && matchedStudent.confidence >= 0.70);
            const isRecognized = Boolean(matchedStudent);
            const isDetecting = !isRecognized && (isAnalyzing || !isRecognitionReady);

            return (
              <div
                className={cn(
                  'absolute z-10 border-2 rounded-lg pointer-events-none transition-all duration-150',
                  isHighConfidence
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                    : isRecognized
                    ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                    : isDetecting
                    ? 'border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                    : 'border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                )}
                style={{
                  left: `${(faceBox.x / faceBox.videoWidth) * 100}%`,
                  top: `${(faceBox.y / faceBox.videoHeight) * 100}%`,
                  width: `${(faceBox.width / faceBox.videoWidth) * 100}%`,
                  height: `${(faceBox.height / faceBox.videoHeight) * 100}%`,
                }}
              >
                <span
                  className={cn(
                    'absolute -top-7 left-0 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-lg flex items-center gap-1.5',
                    isHighConfidence
                      ? 'bg-emerald-500 text-slate-950'
                      : isRecognized
                      ? 'bg-emerald-500 text-slate-950'
                      : isDetecting
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-rose-500 text-white'
                  )}
                >
                  {isRecognized ? (
                    `✓ ${matchedStudent!.name} · ${Math.round(matchedStudent!.confidence * 100)}%`
                  ) : isDetecting ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                      Detecting Face…
                    </>
                  ) : (
                    'Unregistered Face'
                  )}
                </span>
              </div>
            );
          })()}



          {/* Center Standby Viewfinder Placeholder */}
          {!hasVideoSource && <div className="relative z-10 my-auto text-center space-y-3 py-6">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="w-14 h-14 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-center mx-auto shadow-card text-emerald-400"
            >
              <Camera className="w-6 h-6" />
            </motion.div>

            <div className="space-y-1 max-w-sm mx-auto">
              <div className="text-sm font-black text-slate-100 tracking-wide">
                Camera Stream Ingestion Standby
              </div>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Connect RTSP / WebRTC / IP Camera endpoint to start live turnstile stream and bounding-box overlay.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>rtsp://camera01.srnhs.local:554/live/ch0</span>
            </div>
          </div>}

          {/* Bottom HUD Overlay */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-400 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-3">
              <span>RES: <strong className="text-slate-200">1080p @ 30 FPS</strong></span>
              <span className="hidden sm:inline">BITRATE: <strong className="text-slate-200">-- kbps</strong></span>
              <span>LATENCY: <strong className="text-emerald-400">&lt;50ms</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className={cn('w-3 h-3', isLive ? 'text-emerald-400' : 'text-amber-400')} />
              <span>
                {detectorError
                  ? `Face Detection Error: ${detectorError}`
                  : getRecognitionStatusText({
                  matchedStudent,
                  isLoading: isRecognitionLoading,
                  isReady: isRecognitionReady,
                  isFaceDetected,
                  isAnalyzing,
                })}
              </span>
              {isFaceDetected && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase',
                  isLive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                )}>
                  {isLive ? 'LIVE' : 'CHECKING…'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Stream Status & Action Bar ───────────────────────────────── */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-medium">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>Face detection bounding boxes and LRN matches will render on stream live.</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled
              title="Stream configuration"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs font-bold opacity-60 cursor-not-allowed"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configure Stream</span>
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-card-sm"
              title="Toggle view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

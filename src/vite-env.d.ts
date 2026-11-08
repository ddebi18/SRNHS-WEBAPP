/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_FACE_KEYPOINT_ALIGNMENT?: string;
  readonly VITE_FACE_LANDMARK_ALIGNMENT?: string;
  readonly VITE_FACE_FAST_CONFIRM?: string;
  readonly VITE_FACE_QUALITY_GATE?: string;
  readonly VITE_FACE_STARTUP_OPTIMIZATIONS?: string;
  readonly VITE_FACE_MOBILE_OPTIMIZATIONS?: string;
  readonly VITE_FACE_SELF_HOSTED_MODELS?: string;
  readonly VITE_FACE_DIAGNOSTICS?: string;
  readonly VITE_FACE_ONNX_WASM_THREADS?: string;
  readonly VITE_FACE_SCRFD_INPUT_SIZE?: string;
  readonly VITE_FACE_CROP_RETRY_DIAGNOSTICS?: string;
  readonly VITE_FACE_CROP_PADDING_COMPARISON?: string;
  readonly VITE_FACE_CROP_ADAPTIVE_RETRY?: string;
  readonly VITE_FACE_ATTEMPT_LOGS?: string;
  readonly VITE_FACE_CROP_DETECTOR_INPUT_SIZE?: string;
  readonly VITE_FACE_MOTION_OPTIMIZATIONS?: string;
  readonly VITE_FACE_REGISTRATION_POSE_CHECK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace JSX {
  interface IntrinsicElements {
    'lord-icon': {
      src?: string;
      trigger?: string;
      colors?: string;
      delay?: string | number;
      stroke?: string;
      state?: string;
      style?: Record<string, string | number>;
    };
  }
}

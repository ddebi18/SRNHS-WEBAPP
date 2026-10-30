/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_FACE_KEYPOINT_ALIGNMENT?: string;
  readonly VITE_FACE_LANDMARK_ALIGNMENT?: string;
  readonly VITE_FACE_FAST_CONFIRM?: string;
  readonly VITE_FACE_QUALITY_GATE?: string;
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

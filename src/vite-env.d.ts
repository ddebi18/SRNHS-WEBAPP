/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
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

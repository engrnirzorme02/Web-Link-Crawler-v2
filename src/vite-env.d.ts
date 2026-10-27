/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_BLUEPRINT_ACCESS_PIN?: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

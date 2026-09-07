/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the detection engine, e.g. http://localhost:8000.
   * Unset means the app runs on the simulated feed.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

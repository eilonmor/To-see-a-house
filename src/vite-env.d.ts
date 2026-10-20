interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PROPERTY_SLUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Vite's "?raw" imports, used for the legal documents.
declare module '*.md?raw' {
  const content: string
  export default content
}

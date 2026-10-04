interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PROPERTY_SLUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

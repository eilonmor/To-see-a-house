import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** The current Supabase auth session: undefined while loading, then a session or null. */
export function useSession() {
  const [session, setSession] = useState(supabase ? undefined : null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  return session
}

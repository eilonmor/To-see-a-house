import { useEffect, useState } from 'react'

// Minimal path-based routing ("/p/<slug>", "/dashboard"). The host serves
// index.html for every path (see wrangler.jsonc); links call navigate() so the
// page doesn't reload.

const NAVIGATE_EVENT = 'app:navigate'

const current = () => window.location.pathname || '/'

/** Goes to an in-app path. `replace` swaps the current history entry instead of adding one. */
export function navigate(path: string, { replace = false } = {}) {
  if (path === current() && !replace) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  window.scrollTo(0, 0)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/** The current path, e.g. "/dashboard". */
export function useRoute(): string {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => setRoute(current())
    window.addEventListener('popstate', onChange)
    window.addEventListener(NAVIGATE_EVENT, onChange)
    return () => {
      window.removeEventListener('popstate', onChange)
      window.removeEventListener(NAVIGATE_EVENT, onChange)
    }
  }, [])
  return route
}

// Links from the hash-routing era ("/#/p/<slug>", "/#/admin") keep working.
// Supabase auth redirects ("#access_token=…") don't start with "#/" and are left alone.
export function upgradeHashRoute() {
  const { hash } = window.location
  if (!hash.startsWith('#/')) return
  const path = hash.slice(1) === '/admin' ? '/dashboard' : hash.slice(1)
  window.history.replaceState(null, '', path)
}

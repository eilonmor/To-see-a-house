import { useEffect, useState } from 'react'

// Minimal hash-based routing ("#/admin"). Hash routes work on any static host
// without extra rewrite rules.
const current = () => window.location.hash.replace(/^#/, '') || '/'

export function useHashRoute() {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => setRoute(current())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

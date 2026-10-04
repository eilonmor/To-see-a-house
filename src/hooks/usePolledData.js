import { useCallback, useEffect, useRef, useState } from 'react'
import { POLL_INTERVAL_MS } from '../config'

/**
 * Loads data with `load()` and keeps it fresh: polls while the tab is visible
 * and re-fetches immediately when the user returns to the tab. Pass a
 * memoized `load`; a new one restarts loading. With `load` null, nothing loads.
 */
export function usePolledData(load, initial) {
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(Boolean(load))
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (!load || inFlight.current) return
    inFlight.current = true
    try {
      setData(await load())
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [load])

  useEffect(() => {
    if (!load) return
    setLoading(true)
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_INTERVAL_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, refresh])

  return { data, setData, loading, error, lastUpdated, refresh }
}

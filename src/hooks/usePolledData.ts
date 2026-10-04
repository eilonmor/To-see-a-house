import { useCallback, useEffect, useRef, useState } from 'react'
import { POLL_INTERVAL_MS } from '../config'

/**
 * Loads data with `load()` and keeps it fresh: polls while the tab is visible
 * and re-fetches immediately when the user returns to the tab. Pass a
 * memoized `load`; a new one restarts loading. With `load` null, nothing loads.
 */
export function usePolledData<T>(load: (() => Promise<T>) | null, initial: T) {
  const [data, setData] = useState<T>(initial)
  const [loading, setLoading] = useState(Boolean(load))
  const [error, setError] = useState<unknown>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // The running load, and the one queued to start after it (if any).
  const inFlight = useRef<Promise<void> | null>(null)
  const queued = useRef<Promise<void> | null>(null)

  const loadOnce = useCallback(async () => {
    if (!load) return
    try {
      setData(await load())
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [load])

  // A refresh during a running load can't use that load's result, which may
  // predate the change the caller just made, so it queues one more load after
  // it. Further refreshes while that one waits share it.
  const refresh = useCallback((): Promise<void> => {
    if (!load) return Promise.resolve()
    if (queued.current) return queued.current
    const start = (): Promise<void> => {
      const p = loadOnce().finally(() => {
        if (inFlight.current === p) inFlight.current = null
      })
      inFlight.current = p
      return p
    }
    if (!inFlight.current) return start()
    const next = inFlight.current.then(() => {
      queued.current = null
      return start()
    })
    queued.current = next
    return next
  }, [load, loadOnce])

  useEffect(() => {
    if (!load) return
    setLoading(true)
    refresh()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, refresh])

  return { data, setData, loading, error, lastUpdated, refresh }
}

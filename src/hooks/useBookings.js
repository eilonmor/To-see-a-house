import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBookings } from '../lib/bookingStore'
import { POLL_INTERVAL_MS } from '../config'

/**
 * Loads bookings and keeps them fresh: polls while the tab is visible and
 * re-fetches immediately when the user returns to the tab.
 */
export function useBookings() {
  const [bookings, setBookings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      setBookings(await fetchBookings())
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err)
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
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
  }, [refresh])

  return { bookings, setBookings, loading, error, lastUpdated, refresh }
}

import { useRef, useEffect, useState, useCallback } from 'react'

/**
 * A hook that wraps AbortController + mountedRef for safe async API calls.
 *
 * Returns helpers to make cancellable requests that won't update state after
 * the component unmounts or retrigger stale responses when dependencies change.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { request, cancel, mountedRef } = useApiCall()
 *   const [data, setData] = useState(null)
 *
 *   useEffect(() => {
 *     request(async () => {
 *       const res = await axios.get('/api/foo')
 *       if (mountedRef.current) setData(res.data)
 *     })
 *     return () => cancel()
 *   }, [])
 * }
 * ```
 */
export function useApiCall() {
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  /** Cancel any in-flight API call */
  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /**
   * Wraps an async callback with auto-cancellation of previous calls
   * and signals a fresh AbortController.
   */
  const signal = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }, [])

  return { cancel, signal, mountedRef, abortRef }
}

/**
 * A lightweight alternative: just returns a fresh AbortController signal
 * and auto-cancels on unmount. Good for useEffect-based fetches.
 *
 * @example
 * ```tsx
 * useEffect(() => {
 *   (async () => {
 *     const res = await fetch(url, { signal: getSignal() })
 *     if (isMounted.current) setData(res.data)
 *   })()
 * }, [])
 * ```
 */
export function useAbortSignal() {
  const mountedRef = useRef(true)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  const getSignal = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }, [])

  return { getSignal, mountedRef }
}

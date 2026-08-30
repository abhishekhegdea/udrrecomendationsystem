import {
  useRef,
  useEffect,
  useCallback,
} from 'react'

/**
 * Generic helper for cancellable API calls.
 */
export function useApiCall() {
  const abortRef =
    useRef<AbortController | null>(
      null
    )

  const mountedRef =
    useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      abortRef.current?.abort()
    }
  }, [])

  const cancel = useCallback(
    () => {
      abortRef.current?.abort()

      abortRef.current = null
    },
    []
  )

  const signal = useCallback(
    () => {
      abortRef.current?.abort()

      const controller =
        new AbortController()

      abortRef.current =
        controller

      return controller.signal
    },
    []
  )

  return {
    cancel,
    signal,
    mountedRef,
    abortRef,
  }
}

/**
 * Returns a fresh AbortSignal whenever
 * getSignal() is called.
 *
 * Calling cancel() aborts the active request.
 */
export function useAbortSignal() {
  const mountedRef =
    useRef(true)

  const abortRef =
    useRef<AbortController | null>(
      null
    )

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      abortRef.current?.abort()

      abortRef.current = null
    }
  }, [])

  const getSignal =
    useCallback(() => {
      abortRef.current?.abort()

      const controller =
        new AbortController()

      abortRef.current =
        controller

      return controller.signal
    }, [])

  const cancel =
    useCallback(() => {
      abortRef.current?.abort()

      abortRef.current = null
    }, [])

  return {
    getSignal,
    cancel,
    mountedRef,
  }
}
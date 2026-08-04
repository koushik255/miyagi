import { useCallback, useEffect, useState } from 'react'

export type AsyncState<T> = { data: T | null; error: string | null; loading: boolean }

export function useAsync<T>(load: () => Promise<T>, dependencies: React.DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    let active = true
    load()
      .then((data) => active && setState({ data, error: null, loading: false }))
      .catch((error: unknown) => active && setState({ data: null, error: error instanceof Error ? error.message : 'Something went wrong', loading: false }))
    return () => { active = false }
    // Callers provide the values that define the request, matching useEffect semantics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, nonce])

  return { ...state, retry }
}

const CONFIGURED_API_BASE = import.meta.env.VITE_MIYAGI_API_BASE
const DEFAULT_API_BASE = CONFIGURED_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:3000' : '')

export function getApiBase(): string {
  const storedApiBase = localStorage.getItem('miyagi.apiBase')
  if (storedApiBase && (import.meta.env.DEV || CONFIGURED_API_BASE)) return storedApiBase
  return DEFAULT_API_BASE
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options?.headers },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `Request failed: ${response.status}`)
  return data as T
}

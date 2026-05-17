const DEFAULT_API_BASE = import.meta.env.VITE_MIYAGI_API_BASE ?? 'http://localhost:3000'

export function getApiBase(): string {
  return localStorage.getItem('miyagi.apiBase') || DEFAULT_API_BASE
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? `Request failed: ${response.status}`)
  return data as T
}

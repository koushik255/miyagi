export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? '').join('').toUpperCase() || '?'
}

export function relativeTime(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return iso

  const seconds = (Date.now() - time) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

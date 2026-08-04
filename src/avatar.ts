import type { CSSProperties } from 'react'

const DEFAULT_STUDENT_AVATAR_COLORS = ['#3b82f6', '#ef4444', '#facc15', '#f97316', '#22c55e', '#ec4899'] as const
const AVATAR_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function defaultStudentAvatarColor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return DEFAULT_STUDENT_AVATAR_COLORS[hash % DEFAULT_STUDENT_AVATAR_COLORS.length]
}

function normalizeAvatarColor(value: string | null | undefined, seed: string) {
  const color = value?.trim()
  return color && AVATAR_COLOR_PATTERN.test(color) ? color.toLowerCase() : defaultStudentAvatarColor(seed)
}

function avatarTextColor(backgroundColor: string) {
  const normalized = backgroundColor.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.68 ? '#111827' : '#ffffff'
}

export function studentAvatarStyle(input: { avatarColor?: string | null; userId?: string | null; username?: string | null; displayName?: string | null }): CSSProperties {
  const seed = input.userId ?? input.username ?? input.displayName ?? 'student'
  const backgroundColor = normalizeAvatarColor(input.avatarColor, seed)
  return {
    backgroundColor,
    color: avatarTextColor(backgroundColor),
  }
}

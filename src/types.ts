export type Role = 'professor' | 'student'
export type User = { id: string; displayName: string; deviceHash?: string }
export type Professor = { id: string; userId: string }
export type Course = { id: string; name: string; joinCode: string; professorId: string; joinedAt?: string; role?: string }
export type Assignment = { id: string; courseId: string; name: string; description: string; dueDate?: string | null; professorId: string; createdAt: string; updatedAt: string }
export type Group = { id: string; name: string; courseId: string | null; assignmentId: string | null; joinCode: string; workspacePath?: string | null; cloneUrl?: string | null }
export type WorkspaceFile = { path: string; name: string }
export type HistoryEntry = { hash: string; author: string; pushedBy?: string | null; when: string; message: string }
export type Member = { memberId: string; userId: string; displayName: string; role: string; joinedAt: string }

export type Session =
  | { role: 'student'; user: User }
  | { role: 'professor'; professor: Professor; displayName: string }

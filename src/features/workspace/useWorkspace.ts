import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { Assignment, Course, Repository, Session } from '../../types'

export function useWorkspace(session: Session) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({})
  const [repositories, setRepositories] = useState<Record<string, Repository[]>>({})
  const [error, setError] = useState<string | null>(null)

  const refreshCourses = useCallback(async () => {
    setError(null)
    try {
      const path = session.role === 'professor' ? `/courses/professor/${session.professor.id}` : `/courses/user/${session.user.id}`
      setCourses(await api<Course[]>(path))
    } catch (caught) { setCourses([]); setError(caught instanceof Error ? caught.message : 'Could not load courses') }
  }, [session])

  useEffect(() => { void refreshCourses() }, [refreshCourses])

  const loadAssignments = useCallback(async (courseId: string, force = false) => {
    if (!force && assignments[courseId]) return assignments[courseId]
    const data = await api<Assignment[]>(`/courses/${courseId}/assignments`)
    setAssignments((current) => ({ ...current, [courseId]: data }))
    return data
  }, [assignments])

  const loadRepositories = useCallback(async (assignmentId: string, force = false) => {
    if (!force && repositories[assignmentId]) return repositories[assignmentId]
    const data = await api<Repository[]>(`/assignments/${assignmentId}/repositories`)
    setRepositories((current) => ({ ...current, [assignmentId]: data }))
    return data
  }, [repositories])

  useEffect(() => { courses?.forEach((course) => void loadAssignments(course.id).catch(() => undefined)) }, [courses, loadAssignments])
  useEffect(() => { Object.values(assignments).flat().forEach((assignment) => void loadRepositories(assignment.id).catch(() => undefined)) }, [assignments, loadRepositories])

  return { courses, assignments, repositories, error, refreshCourses, loadAssignments, loadRepositories }
}

import { useState } from 'react'
import { AlertCircle, ArrowUpRight, CalendarDays, CheckCircle2, GitBranch, PlugZap } from 'lucide-react'
import type { Assignment, Course, Repository, Role } from '../../types'
import { Badge, Button, Card, EmptyState } from '../ui'

type Props = {
  role: Role
  courses: Course[] | null
  assignmentsByCourse: Record<string, Assignment[]>
  repositoriesByAssignment: Record<string, Repository[]>
  githubConnected: boolean
  onSelectCourse: (course: Course) => void
  onSelectAssignment: (course: Course, assignment: Assignment) => void
  onOpenGuide?: () => void
}

type AttentionItem = {
  id: string
  title: string
  detail: string
  tone: 'warning' | 'neutral'
  onOpen: () => void
}

const relativeDate = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const assignmentCountLabel = (count: number) => `${count} assignment${count === 1 ? '' : 's'}`

function dueLabel(value: string, now: number) {
  const days = Math.ceil((new Date(value).getTime() - now) / 86_400_000)
  return relativeDate.format(days, 'day')
}

export function HomeDashboard({
  role,
  courses,
  assignmentsByCourse,
  repositoriesByAssignment,
  githubConnected,
  onSelectCourse,
  onSelectAssignment,
  onOpenGuide,
}: Props) {
  const assignments = Object.values(assignmentsByCourse).flat()
  const [now] = useState(() => Date.now())
  const upcoming = assignments
    .filter((assignment) => assignment.dueDate && new Date(assignment.dueDate).getTime() >= now)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
  const items: AttentionItem[] = []

  for (const assignment of upcoming.slice(0, 3)) {
    const course = courses?.find((candidate) => candidate.id === assignment.courseId)
    if (!course) continue
    const repositories = repositoriesByAssignment[assignment.id] ?? []
    items.push({
      id: `due-${assignment.id}`,
      title: assignment.name,
      detail: `${course.name} · due ${dueLabel(assignment.dueDate!, now)}`,
      tone: 'neutral',
      onOpen: () => onSelectAssignment(course, assignment),
    })
    if (role === 'professor' && repositories.length === 0) {
      items.push({
        id: `repository-${assignment.id}`,
        title: `${assignment.name} needs a repository`,
        detail: `${course.name} · connect one before students begin`,
        tone: 'warning',
        onOpen: () => onSelectAssignment(course, assignment),
      })
    }
  }

  if (role === 'professor' && !githubConnected) {
    items.unshift({
      id: 'github',
      title: 'Connect GitHub',
      detail: 'Required to inspect repository activity and contribution signals.',
      tone: 'warning',
      onOpen: onOpenGuide ?? (() => undefined),
    })
  }

  return (
    <div className="home-dashboard">
      <section className="home-dashboard-heading">
        <h2>Action items</h2>
        {upcoming[0] && <Badge variant="muted"><CalendarDays size={12} /> Next due {dueLabel(upcoming[0].dueDate!, now)}</Badge>}
      </section>

      {courses === null ? (
        <Card className="attention-list" aria-busy="true" aria-label="Loading dashboard">
          <div className="attention-skeleton" />
          <div className="attention-skeleton short" />
        </Card>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={20} />}
          title={role === 'professor' ? 'Create your first course' : 'No courses yet'}
          description={role === 'professor' ? 'Create a course from the sidebar to start organizing assignments.' : 'Join a course with its code or wait for your professor to add you.'}
          action={onOpenGuide && <Button variant="secondary" onClick={onOpenGuide}>View setup guide</Button>}
        />
      ) : items.length === 0 ? (
        <Card className="dashboard-clear-state">
          <CheckCircle2 size={20} />
          <div><strong>You’re all caught up</strong><span>No upcoming deadlines or setup issues need attention.</span></div>
        </Card>
      ) : (
        <Card className="attention-list">
          {items.slice(0, 5).map((item) => (
            <button key={item.id} className="attention-row" onClick={item.onOpen}>
              <span className={`attention-icon ${item.tone}`}>
                {item.id === 'github' ? <PlugZap size={16} /> : item.tone === 'warning' ? <AlertCircle size={16} /> : <CalendarDays size={16} />}
              </span>
              <span className="attention-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          ))}
        </Card>
      )}

      <section className="recent-courses" aria-labelledby="recent-courses-title">
        <div className="section-heading"><h3 id="recent-courses-title">Courses</h3><span>{courses?.length ?? 0}</span></div>
        <div className="course-shortcuts">
          {(courses ?? []).slice(0, 4).map((course) => (
            <button key={course.id} onClick={() => onSelectCourse(course)}>
              <span><GitBranch size={14} aria-hidden="true" /><strong>{course.name}</strong></span>
              <small>{assignmentCountLabel((assignmentsByCourse[course.id] ?? []).length)}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

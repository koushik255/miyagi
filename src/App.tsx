import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toaster, toast } from 'sonner'
import {
  BookOpen, Users, ChevronRight, Plus, Search, LogOut, Copy, Check,
  PanelLeftClose, PanelLeft,
  Settings, KeyRound, GraduationCap, UserRound, Inbox, AlertCircle,
  ClipboardList, CalendarDays,
} from 'lucide-react'
import './App.css'
import { api, getApiBase } from './api'
import { initials } from './format'
import type { Assignment, Course, CourseCalendarItem, Group, Member, Professor, Role, Session, User } from './types'
import { GroupDetail } from './components/groups/GroupDetail'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
}
const calendarDateTimeFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const calendarDayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
const calendarMonthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const calendarTimeFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' })
const calendarWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function asCalendarDate(value: string | Date) {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value)
}

function formatCalendarDateTime(value: string | Date) {
  const date = asCalendarDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return calendarDateTimeFormatter.format(date)
}

function formatCalendarDay(value: string | Date) {
  const date = asCalendarDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return calendarDayFormatter.format(date)
}

function formatCalendarMonth(value: Date) {
  return calendarMonthFormatter.format(value)
}

function formatCalendarTime(value: string | Date) {
  const date = asCalendarDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return calendarTimeFormatter.format(date)
}

function formatDateTimeInput(value?: string | Date | null) {
  if (!value) return ''
  const date = asCalendarDate(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function compareCalendarDate(a: string, b: string) {
  const aTime = Date.parse(a)
  const bTime = Date.parse(b)
  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.localeCompare(b)
  if (Number.isNaN(aTime)) return 1
  if (Number.isNaN(bTime)) return -1
  return aTime - bTime
}

function calendarDayKey(value: string | Date) {
  const date = asCalendarDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateFromCalendarDayKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

function startOfCalendarMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function addCalendarMonths(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1)
}

function calendarMonthKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

function buildCalendarMonthRange(anchor: Date, entries: CalendarEntry[]) {
  let firstMonth = startOfCalendarMonth(anchor)
  let lastMonth = addCalendarMonths(firstMonth, 11)

  for (const entry of entries) {
    const month = startOfCalendarMonth(asCalendarDate(entry.dueAt))
    if (month.getTime() < firstMonth.getTime()) firstMonth = month
    if (month.getTime() > lastMonth.getTime()) lastMonth = month
  }

  const months: Date[] = []
  for (let cursor = firstMonth; cursor.getTime() <= lastMonth.getTime(); cursor = addCalendarMonths(cursor, 1)) {
    months.push(cursor)
  }
  return months
}

function buildCalendarMonthDays(month: Date) {
  const firstDay = startOfCalendarMonth(month)
  const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate()
  const visibleDays = Array.from({ length: daysInMonth }, (_, index) => (
    new Date(firstDay.getFullYear(), firstDay.getMonth(), index + 1)
  ))
  const leadingBlanks = Array.from<Date | null>({ length: firstDay.getDay() }).fill(null)
  const trailingBlanks = Array.from<Date | null>({
    length: (7 - ((leadingBlanks.length + visibleDays.length) % 7)) % 7,
  }).fill(null)

  return [...leadingBlanks, ...visibleDays, ...trailingBlanks]
}


function buildDateTimeInputForDay(day: Date, previous?: string | null) {
  const previousDate = previous ? new Date(previous) : null
  const nextDate = !previousDate || Number.isNaN(previousDate.getTime())
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0)
    : new Date(day.getFullYear(), day.getMonth(), day.getDate(), previousDate.getHours(), previousDate.getMinutes(), 0, 0)
  return formatDateTimeInput(nextDate)
}

type CourseCalendarTab = 'calendar' | 'assignments' | 'students'

type CalendarEntry = {
  id: string
  title: string
  description: string
  dueAt: string
  kind: 'event' | 'deadline'
  source: 'assignment' | 'custom'
  assignment?: Assignment
  linkedAssignment?: Assignment
  itemId?: string
}

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    try { return JSON.parse(localStorage.getItem('miyagi.session') ?? 'null') } catch { return null }
  })

  const saveSession = (next: Session | null) => {
    setSession(next)
    if (next) localStorage.setItem('miyagi.session', JSON.stringify(next))
    else localStorage.removeItem('miyagi.session')
  }

  return (
    <>
      <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: '#222', border: '1px solid #333', color: '#e4e4e4' } }} />
      {!session ? (
        <LoginScreen onLogin={saveSession} />
      ) : (
        <div className="app-shell">
          <header className="titlebar">
            <div className="brand">
              <span className="brand-mark" />
              <span>Miyagi</span>
            </div>
            <div className="titlebar-meta">
              <span className="role-pill">
                {session.role === 'professor' ? <GraduationCap size={12} /> : <UserRound size={12} />}
                {session.role === 'professor' ? session.displayName : session.user.displayName}
              </span>
              <button className="btn-icon" title="Log out" onClick={() => saveSession(null)}>
                <LogOut size={14} />
              </button>
            </div>
          </header>
          {session.role === 'professor'
            ? <Dashboard role="professor" professor={session.professor} displayName={session.displayName} />
            : <Dashboard role="student" user={session.user} onStudentUpdated={(user) => saveSession({ role: 'student', user })} />
          }
        </div>
      )}
    </>
  )
}

/* ============ Login ============ */

function LoginScreen({ onLogin }: { onLogin: (session: Session) => void }) {
  const [role, setRole] = useState<Role>('professor')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [apiBase, setApiBase] = useState(getApiBase())
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        try {
          const professor = await api<Professor>('/auth/professor/login', { method: 'POST', body: JSON.stringify({ username, password }) })
          onLogin({ role: 'professor', professor, displayName: username })
          return
        } catch {
          const user = await api<User>('/auth/student/login', { method: 'POST', body: JSON.stringify({ username, password }) })
          onLogin({ role: 'student', user })
          return
        }
      }

      if (role === 'student') {
        const user = await api<User>('/auth/student/register', { method: 'POST', body: JSON.stringify({ username, password, displayName }) })
        onLogin({ role: 'student', user })
      } else {
        const professor = await api<Professor>('/auth/professor/register', { method: 'POST', body: JSON.stringify({ username, password, displayName }) })
        onLogin({ role: 'professor', professor, displayName: displayName || username })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in')
    } finally {
      setSubmitting(false)
    }
  }

  const saveApiBase = () => {
    localStorage.setItem('miyagi.apiBase', apiBase)
    toast.success('Backend URL saved')
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-header">
          <h1><span className="brand-mark" /> Miyagi</h1>
          <p>{mode === 'login' ? 'Use your Miyagi account to continue.' : 'Create your account to get started.'}</p>
        </div>

        {mode === 'register' && (
          <div className="segmented" aria-label="Account type">
            <button type="button" className={role === 'professor' ? 'active' : ''} onClick={() => setRole('professor')}>
              <GraduationCap size={14} /> Professor
            </button>
            <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>
              <UserRound size={14} /> Student
            </button>
          </div>
        )}

        {mode === 'register' && (
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        )}
        <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus={mode === 'login'} />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="error"><AlertCircle size={14} /> {error}</div>}

        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ height: 36, justifyContent: 'center' }}>
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <button type="button" className="toggle-link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <strong>{mode === 'login' ? 'Sign up' : 'Sign in'}</strong>
        </button>

        <div className="expander">
          <button type="button" className="expander-toggle" onClick={() => setShowSettings(!showSettings)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Settings size={12} /> Backend settings</span>
            <ChevronRight size={14} style={{ transform: showSettings ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
          </button>
          {showSettings && (
            <div className="expander-body">
              <label>Backend URL</label>
              <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="http://localhost:3000" />
              <button type="button" className="btn btn-sm" onClick={saveApiBase} style={{ justifySelf: 'start' }}>Save</button>
            </div>
          )}
        </div>
      </form>
    </main>
  )
}

/* ============ Dashboard ============ */

type DashboardProps =
  | { role: 'professor'; professor: Professor; displayName: string }
  | { role: 'student'; user: User; onStudentUpdated: (user: User) => void }

function Dashboard(props: DashboardProps) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [assignmentsByCourse, setAssignmentsByCourse] = useState<Record<string, Assignment[]>>({})
  const [groupsByAssignment, setGroupsByAssignment] = useState<Record<string, Group[]>>({})
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set())
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarContent, setSidebarContent] = useState<ReactNode | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const currentStudentGithubUsername = props.role === 'student' ? props.user.githubUsername ?? '' : ''
  const [githubUsernameDialogOpen, setGithubUsernameDialogOpen] = useState(false)
  const [githubUsernameInput, setGithubUsernameInput] = useState(currentStudentGithubUsername)
  const [savingGithubUsername, setSavingGithubUsername] = useState(false)

  const refreshCourses = useCallback(async () => {
    try {
      const data = props.role === 'professor'
        ? await api<Course[]>(`/courses/professor/${props.professor.id}`)
        : await api<Course[]>(`/courses/user/${props.user.id}`)
      setCourses(data)
    } catch (err) {
      showError(err, 'Could not load courses')
      setCourses([])
    }
  }, [props])

  useEffect(() => {
    if (props.role !== 'student') return
    setGithubUsernameInput(currentStudentGithubUsername)
    setGithubUsernameDialogOpen(false)
    setSavingGithubUsername(false)
  }, [currentStudentGithubUsername, props.role])

  const saveGithubUsername = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (props.role !== 'student') return
    try {
      setSavingGithubUsername(true)
      const user = await api<User>(`/users/${props.user.id}/github`, {
        method: 'PATCH',
        body: JSON.stringify({ githubUsername: githubUsernameInput }),
      })
      props.onStudentUpdated(user)
      setGithubUsernameDialogOpen(false)
      toast.success('GitHub username saved')
    } catch (err) {
      showError(err, 'Could not save GitHub username')
    } finally {
      setSavingGithubUsername(false)
    }
  }, [githubUsernameInput, props])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCourses()
  }, [refreshCourses])

  const loadAssignments = useCallback(async (course: Course) => {
    try {
      const assignments = await api<Assignment[]>(`/courses/${course.id}/assignments`)
      setAssignmentsByCourse((prev) => ({ ...prev, [course.id]: assignments }))
    } catch (err) {
      showError(err, 'Could not load assignments')
    }
  }, [])

  const loadGroups = useCallback(async (assignment: Assignment) => {
    try {
      let groups: Group[]
      if (props.role === 'professor') {
        groups = await api<Group[]>(`/assignments/${assignment.id}/groups`)
      } else {
        const userGroups = await api<Group[]>(`/groups/user/${props.user.id}`)
        groups = userGroups.filter((g) => g.assignmentId === assignment.id)
      }
      setGroupsByAssignment((prev) => ({ ...prev, [assignment.id]: groups }))
    } catch (err) {
      showError(err, 'Could not load groups')
    }
  }, [props])

  useEffect(() => {
    if (!courses) return
    courses.forEach((c) => {
      if (!assignmentsByCourse[c.id]) loadAssignments(c)
    })
  }, [courses, assignmentsByCourse, loadAssignments])

  useEffect(() => {
    Object.values(assignmentsByCourse).flat().forEach((assignment) => {
      if (!groupsByAssignment[assignment.id]) loadGroups(assignment)
    })
  }, [assignmentsByCourse, groupsByAssignment, loadGroups])

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
  }

  const toggleAssignment = (assignmentId: string) => {
    setExpandedAssignments((prev) => {
      const next = new Set(prev)
      if (next.has(assignmentId)) next.delete(assignmentId)
      else next.add(assignmentId)
      return next
    })
  }

  const selectCourse = (course: Course) => {
    setSelectedCourseId(course.id)
    setSelectedAssignment(null)
    setSelectedGroup(null)
    setExpandedCourses((prev) => new Set(prev).add(course.id))
  }

  const selectAssignment = (course: Course, assignment: Assignment) => {
    setSelectedCourseId(course.id)
    setSelectedAssignment(assignment)
    setSelectedGroup(null)
    setExpandedCourses((prev) => new Set(prev).add(course.id))
    setExpandedAssignments((prev) => new Set(prev).add(assignment.id))
    if (!groupsByAssignment[assignment.id]) loadGroups(assignment)
  }

  const selectGroup = (course: Course, assignment: Assignment, group: Group) => {
    setSelectedCourseId(course.id)
    setSelectedAssignment(assignment)
    setSelectedGroup(group)
  }

  const handleGroupUpdated = useCallback((updatedGroup: Group) => {
    setSelectedGroup((current) => current?.id === updatedGroup.id ? updatedGroup : current)
    const assignmentId = updatedGroup.assignmentId
    if (!assignmentId) return
    setGroupsByAssignment((current) => ({
      ...current,
      [assignmentId]: (current[assignmentId] ?? []).map((group) => (
        group.id === updatedGroup.id ? updatedGroup : group
      )),
    }))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filteredCourses = useMemo(() => {
    if (!courses) return null
    const q = search.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => {
      if (c.name.toLowerCase().includes(q) || c.joinCode.toLowerCase().includes(q)) return true
      const assignments = assignmentsByCourse[c.id] ?? []
      return assignments.some((assignment) => {
        if (assignment.name.toLowerCase().includes(q)) return true
        const groups = groupsByAssignment[assignment.id] ?? []
        return groups.some((g) => g.name.toLowerCase().includes(q))
      })
    })
  }, [courses, search, assignmentsByCourse, groupsByAssignment])

  const selectedCourse = courses?.find((c) => c.id === selectedCourseId) ?? null

  const userDisplayName = props.role === 'professor' ? props.displayName : props.user.displayName
  const sidebarTitle = sidebarContent ? 'Commits' : props.role === 'professor' ? 'My Courses' : 'Enrolled Courses'

  return (
    <div className={`dashboard ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">{sidebarTitle}</span>
            <button className="btn-icon" title="Collapse sidebar" onClick={() => setCollapsed(true)}>
              <PanelLeftClose size={14} />
            </button>
          </div>
          {!sidebarContent && (
            <div className="sidebar-search">
              <Search size={13} className="search-icon" />
              <input
                ref={searchRef}
                placeholder="Search courses, assignments, groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="kbd-hint">⌘K</span>
            </div>
          )}
          <div className="sidebar-body">
            {sidebarContent ?? (
              <>
                {props.role === 'student' && (
                  <JoinCourseForm onJoined={refreshCourses} userId={props.user.id} />
                )}
                {props.role === 'professor' && (
                  <CreateCourseForm onCreated={refreshCourses} professorId={props.professor.id} />
                )}

                {courses === null ? (
                  <>
                    <div className="skeleton-row" />
                    <div className="skeleton-row" style={{ width: '70%' }} />
                    <div className="skeleton-row" style={{ width: '85%' }} />
                  </>
                ) : filteredCourses && filteredCourses.length === 0 ? (
                  <div className="sidebar-empty">
                    {search ? 'No matches.' : props.role === 'professor'
                      ? 'No courses yet. Create one above.'
                      : 'No courses yet. Use a join code above.'}
                  </div>
                ) : (
                  filteredCourses?.map((course) => (
                    <CourseNode
                      key={course.id}
                      role={props.role}
                      course={course}
                      assignments={assignmentsByCourse[course.id]}
                      groupsByAssignment={groupsByAssignment}
                      expanded={expandedCourses.has(course.id)}
                      expandedAssignments={expandedAssignments}
                      active={selectedCourseId === course.id && !selectedAssignment && !selectedGroup}
                      activeAssignmentId={selectedAssignment?.id ?? null}
                      activeGroupId={selectedGroup?.id ?? null}
                      onToggle={() => toggleCourse(course.id)}
                      onToggleAssignment={toggleAssignment}
                      onSelectCourse={() => selectCourse(course)}
                      onSelectAssignment={(assignment) => selectAssignment(course, assignment)}
                      onSelectGroup={(assignment, group) => selectGroup(course, assignment, group)}
                      onAssignmentCreated={() => loadAssignments(course)}
                      onGroupCreated={(assignment) => loadGroups(assignment)}
                      professorId={props.role === 'professor' ? props.professor.id : undefined}
                    />
                  ))
                )}
              </>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="avatar">{initials(userDisplayName)}</div>
              <div className="user-text">
                <span className="name">{userDisplayName}</span>
                {props.role === 'student' && props.user.githubUsername && (
                  <span className="meta">GitHub: {props.user.githubUsername}</span>
                )}
              </div>
            </div>
            {props.role === 'student' && (
              <button className="btn btn-sm btn-ghost sidebar-footer-btn" onClick={() => setGithubUsernameDialogOpen(true)}>
                GitHub
              </button>
            )}
          </div>
        </aside>
      )}

      {collapsed && (
        <aside style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: 6 }}>
          <button className="btn-icon" title="Expand sidebar" onClick={() => setCollapsed(false)}>
            <PanelLeft size={14} />
          </button>
        </aside>
      )}

      <section className="detail">
        {selectedGroup && selectedCourse && selectedAssignment ? (
          <GroupDetail
            key={selectedGroup.id}
            course={selectedCourse}
            assignment={selectedAssignment}
            group={selectedGroup}
            role={props.role}
            professorId={props.role === 'professor' ? props.professor.id : undefined}
            onSidebarContentChange={setSidebarContent}
            onGroupUpdated={handleGroupUpdated}
          />
        ) : selectedAssignment && selectedCourse ? (
          <AssignmentDetail
            assignment={selectedAssignment}
            course={selectedCourse}
            role={props.role}
            groups={groupsByAssignment[selectedAssignment.id] ?? []}
            onSelectGroup={(g) => setSelectedGroup(g)}
            onGroupCreated={() => loadGroups(selectedAssignment)}
            professorId={props.role === 'professor' ? props.professor.id : undefined}
          />
        ) : selectedCourse ? (
          <CourseDetail
            course={selectedCourse}
            role={props.role}
            assignments={assignmentsByCourse[selectedCourse.id]}
            groupsByAssignment={groupsByAssignment}
            onSelectAssignment={(assignment) => selectAssignment(selectedCourse, assignment)}
            onAssignmentCreated={() => loadAssignments(selectedCourse)}
            professorId={props.role === 'professor' ? props.professor.id : undefined}
          />
        ) : (
          <div className="detail-empty">
            <div className="icon-circle"><Inbox size={26} /></div>
            <h3>Nothing selected</h3>
            <p>Pick a course from the sidebar to view its assignments, groups, files, and history.</p>
          </div>
        )}
      </section>
      {props.role === 'student' && githubUsernameDialogOpen && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !savingGithubUsername) setGithubUsernameDialogOpen(false)
          }}
        >
          <form className="modal-card" onSubmit={saveGithubUsername}>
            <div className="modal-head">
              <div>
                <h3>GitHub username</h3>
                <p>Link your Miyagi account to your GitHub username.</p>
              </div>
            </div>
            <div className="modal-body">
              <label htmlFor="student-github-username">GitHub username</label>
              <input
                id="student-github-username"
                value={githubUsernameInput}
                onChange={(event) => setGithubUsernameInput(event.target.value)}
                placeholder="koushik255"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-sm" onClick={() => setGithubUsernameDialogOpen(false)} disabled={savingGithubUsername}>
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary" disabled={savingGithubUsername}>
                {savingGithubUsername ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

/* ============ Sidebar pieces ============ */

function CreateCourseForm({ professorId, onCreated }: { professorId: string; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await api<Course>('/courses', { method: 'POST', body: JSON.stringify({ professorId, name: name.trim() }) })
      setName('')
      setOpen(false)
      toast.success('Course created')
      onCreated()
    } catch (err) {
      showError(err)
    }
  }
  if (!open) {
    return (
      <button className="tree-row" onClick={() => setOpen(true)} style={{ color: 'var(--text-dim)', justifyContent: 'flex-start' }}>
        <Plus size={14} /> <span className="label">New course</span>
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create" style={{ paddingLeft: 8 }}>
      <input placeholder="Course name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <button type="submit" className="btn btn-sm btn-primary">Add</button>
    </form>
  )
}

function JoinCourseForm({ userId, onJoined }: { userId: string; onJoined: () => void }) {
  const [code, setCode] = useState('')
  const [open, setOpen] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    try {
      await api('/courses/join', { method: 'POST', body: JSON.stringify({ userId, joinCode: code.trim().toUpperCase() }) })
      setCode('')
      setOpen(false)
      toast.success('Joined course')
      onJoined()
    } catch (err) {
      showError(err)
    }
  }
  if (!open) {
    return (
      <button className="tree-row" onClick={() => setOpen(true)} style={{ color: 'var(--text-dim)', justifyContent: 'flex-start' }}>
        <KeyRound size={14} /> <span className="label">Join with code</span>
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create" style={{ paddingLeft: 8 }}>
      <input placeholder="Join code" autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onBlur={() => !code && setOpen(false)} />
      <button type="submit" className="btn btn-sm btn-primary">Join</button>
    </form>
  )
}

function CreateAssignmentForm({ professorId, courseId, onCreated }: { professorId: string; courseId: string; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [open, setOpen] = useState(false)

  const close = () => {
    setName('')
    setDueDate('')
    setOpen(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const nextDueDate = dueDate ? toIsoDateTime(dueDate) : null
    if (dueDate && !nextDueDate) {
      toast.error('Pick a valid due date')
      return
    }

    try {
      await api<Assignment>('/assignments', {
        method: 'POST',
        body: JSON.stringify({ professorId, courseId, name: name.trim(), dueDate: nextDueDate ?? undefined }),
      })
      close()
      toast.success('Assignment created')
      onCreated()
    } catch (err) {
      showError(err)
    }
  }
  if (!open) {
    return (
      <button className="assignment-row" onClick={() => setOpen(true)} style={{ color: 'var(--muted)' }}>
        <Plus size={12} className="icon" /> <span className="label">New assignment</span>
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create assignment-create">
      <input placeholder="Assignment name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <input type="datetime-local" aria-label="Assignment due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button type="submit" className="btn btn-sm btn-primary">Add</button>
      <button type="button" className="btn btn-sm" onClick={close}>Cancel</button>
    </form>
  )
}

function CreateGroupForm({ professorId, assignmentId, onCreated }: { professorId: string; assignmentId: string; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await api<Group>('/groups', { method: 'POST', body: JSON.stringify({ professorId, assignmentId, name: name.trim() }) })
      setName('')
      setOpen(false)
      toast.success('Group created')
      onCreated()
    } catch (err) {
      showError(err)
    }
  }
  if (!open) {
    return (
      <button className="group-row" onClick={() => setOpen(true)} style={{ color: 'var(--muted)' }}>
        <Plus size={12} className="icon" /> <span className="label">New group</span>
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create">
      <input placeholder="Group name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <button type="submit" className="btn btn-sm btn-primary">Add</button>
    </form>
  )
}

function CourseNode({
  role, course, assignments, groupsByAssignment, expanded, expandedAssignments, active, activeAssignmentId, activeGroupId,
  onToggle, onToggleAssignment, onSelectCourse, onSelectAssignment, onSelectGroup, onAssignmentCreated, onGroupCreated, professorId,
}: {
  role: Role
  course: Course
  assignments: Assignment[] | undefined
  groupsByAssignment: Record<string, Group[]>
  expanded: boolean
  expandedAssignments: Set<string>
  active: boolean
  activeAssignmentId: string | null
  activeGroupId: string | null
  onToggle: () => void
  onToggleAssignment: (assignmentId: string) => void
  onSelectCourse: () => void
  onSelectAssignment: (assignment: Assignment) => void
  onSelectGroup: (assignment: Assignment, group: Group) => void
  onAssignmentCreated: () => void
  onGroupCreated: (assignment: Assignment) => void
  professorId?: string
}) {
  return (
    <div className="course-group">
      <button
        className={`tree-row ${active ? 'active' : ''}`}
        onClick={() => { onSelectCourse(); if (!expanded) onToggle() }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          style={{ display: 'inline-flex' }}
        >
          <ChevronRight size={12} className={`chev ${expanded ? 'open' : ''}`} />
        </span>
        <BookOpen size={14} className="icon" />
        <span className="label">{course.name}</span>
        {assignments && <span className="count">{assignments.length}</span>}
      </button>
      {expanded && (
        <div className="assignment-list">
          {assignments === undefined ? (
            <div className="skeleton-row" style={{ marginLeft: 4 }} />
          ) : (
            <>
              {assignments.map((assignment) => (
                <div key={assignment.id} className="assignment-node">
                  <button
                    className={`assignment-row ${activeAssignmentId === assignment.id && !activeGroupId ? 'active' : ''}`}
                    onClick={() => onSelectAssignment(assignment)}
                  >
                    <span onClick={(e) => { e.stopPropagation(); onToggleAssignment(assignment.id) }} style={{ display: 'inline-flex' }}>
                      <ChevronRight size={11} className={`chev ${expandedAssignments.has(assignment.id) ? 'open' : ''}`} />
                    </span>
                    <ClipboardList size={12} className="icon" />
                    <span className="label">{assignment.name}</span>
                    {groupsByAssignment[assignment.id] && <span className="count">{groupsByAssignment[assignment.id].length}</span>}
                  </button>
                  {expandedAssignments.has(assignment.id) && (
                    <div className="group-list">
                      {groupsByAssignment[assignment.id] === undefined ? (
                        <div className="skeleton-row" style={{ marginLeft: 4 }} />
                      ) : (
                        <>
                          {groupsByAssignment[assignment.id].map((g) => (
                            <button
                              key={g.id}
                              className={`group-row ${activeGroupId === g.id ? 'active' : ''}`}
                              onClick={() => onSelectGroup(assignment, g)}
                            >
                              <Users size={12} className="icon" />
                              <span className="label">{g.name}</span>
                            </button>
                          ))}
                          {role === 'professor' && professorId && (
                            <CreateGroupForm professorId={professorId} assignmentId={assignment.id} onCreated={() => onGroupCreated(assignment)} />
                          )}
                          {groupsByAssignment[assignment.id].length === 0 && role === 'student' && (
                            <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--muted)' }}>No groups yet.</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {role === 'professor' && professorId && (
                <CreateAssignmentForm professorId={professorId} courseId={course.id} onCreated={onAssignmentCreated} />
              )}
              {assignments.length === 0 && role === 'student' && (
                <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--muted)' }}>No assignments yet.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ============ Course detail (when only a course is selected) ============ */

type CourseCalendarViewProps = {
  courseId: string
  role: Role
  assignments: Assignment[] | undefined
  professorId?: string
  onSelectAssignment: (assignment: Assignment) => void
}

function CourseCalendarView({ courseId, role, assignments, professorId, onSelectAssignment }: CourseCalendarViewProps) {
  const [calendarItems, setCalendarItems] = useState<CourseCalendarItem[]>([])
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formDueAt, setFormDueAt] = useState('')
  const [formKind, setFormKind] = useState<CourseCalendarItem['kind']>('deadline')
  const [formAssignmentId, setFormAssignmentId] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null)

  const resetForm = useCallback((day: Date) => {
    setEditingItemId(null)
    setFormTitle('')
    setFormDescription('')
    setFormKind('deadline')
    setFormAssignmentId('')
    setFormDueAt(role === 'professor' ? buildDateTimeInputForDay(day) : '')
  }, [role])

  const loadCalendarItems = useCallback(async () => {
    setCalendarLoading(true)
    try {
      const items = await api<CourseCalendarItem[]>(`/courses/${courseId}/calendar-items`)
      setCalendarItems(items)
    } catch (err) {
      showError(err, 'Could not load course calendar')
      setCalendarItems([])
    } finally {
      setCalendarLoading(false)
    }
  }, [courseId])

  useEffect(() => {
    const today = new Date()
    setSelectedDayKey(null)
    setEditorOpen(false)
    resetForm(today)
    setCalendarItems([])
    setCalendarLoading(true)
    void loadCalendarItems()
  }, [courseId, loadCalendarItems, role, resetForm])

  const assignmentMap = useMemo(() => (
    new Map((assignments ?? []).map((assignment) => [assignment.id, assignment]))
  ), [assignments])

  const assignmentEntries = useMemo<CalendarEntry[]>(() => (assignments ?? []).flatMap((assignment) => {
    if (!assignment.dueDate) return []
    return [{
      id: `assignment-${assignment.id}`,
      title: assignment.name,
      description: assignment.description,
      dueAt: assignment.dueDate,
      kind: 'deadline',
      source: 'assignment',
      assignment,
    }]
  }), [assignments])

  const calendarEntries = useMemo<CalendarEntry[]>(() => (
    [
      ...calendarItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        dueAt: item.dueAt,
        kind: item.kind,
        source: 'custom' as const,
        linkedAssignment: item.assignmentId ? assignmentMap.get(item.assignmentId) : undefined,
        itemId: item.id,
      })),
      ...assignmentEntries,
    ].sort((left, right) => compareCalendarDate(left.dueAt, right.dueAt) || left.title.localeCompare(right.title))
  ), [assignmentEntries, assignmentMap, calendarItems])

  const calendarItemMap = useMemo(() => (
    new Map(calendarItems.map((item) => [item.id, item]))
  ), [calendarItems])

  const entriesByDay = useMemo(() => {
    const next = new Map<string, CalendarEntry[]>()
    for (const entry of calendarEntries) {
      const key = calendarDayKey(entry.dueAt)
      const current = next.get(key)
      if (current) current.push(entry)
      else next.set(key, [entry])
    }
    next.forEach((entries) => entries.sort((left, right) => compareCalendarDate(left.dueAt, right.dueAt) || left.title.localeCompare(right.title)))
    return next
  }, [calendarEntries])

  const calendarMonths = useMemo(() => buildCalendarMonthRange(new Date(), calendarEntries), [calendarEntries])
  const selectedDayDate = useMemo(() => (selectedDayKey ? dateFromCalendarDayKey(selectedDayKey) : null), [selectedDayKey])
  const selectedDayEntries = selectedDayKey ? entriesByDay.get(selectedDayKey) ?? [] : []
  const todayKey = calendarDayKey(new Date())
  const monthSections = useMemo(() => calendarMonths.map((month) => {
    const days = buildCalendarMonthDays(month)
    const entryCount = days.reduce((count, day) => (
      day ? count + (entriesByDay.get(calendarDayKey(day))?.length ?? 0) : count
    ), 0)
    return { key: calendarMonthKey(month), month, days, entryCount }
  }), [calendarMonths, entriesByDay])

  const closeEditor = useCallback(() => {
    setEditorOpen(false)
    resetForm(selectedDayDate ?? new Date())
  }, [resetForm, selectedDayDate])

  const openDay = useCallback((day: Date) => {
    setSelectedDayKey(calendarDayKey(day))
    if (role === 'professor' && professorId) {
      resetForm(day)
      setEditorOpen(true)
    }
  }, [professorId, resetForm, role])

  const startEditingItem = (item: CourseCalendarItem) => {
    const itemDay = asCalendarDate(item.dueAt)
    setSelectedDayKey(calendarDayKey(itemDay))
    setEditorOpen(true)
    setEditingItemId(item.id)
    setFormTitle(item.title)
    setFormDescription(item.description)
    setFormDueAt(formatDateTimeInput(item.dueAt))
    setFormKind(item.kind)
    setFormAssignmentId(item.assignmentId ?? '')
  }

  const saveItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!professorId || !formTitle.trim()) return

    const dueAt = toIsoDateTime(formDueAt)
    if (!dueAt) {
      toast.error('Pick a valid date and time')
      return
    }

    try {
      setSavingItem(true)
      const payload = {
        professorId,
        assignmentId: formKind === 'deadline' && formAssignmentId ? formAssignmentId : null,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        dueAt,
        kind: formKind,
      }

      if (editingItemId) {
        await api<CourseCalendarItem>(`/courses/${courseId}/calendar-items/${editingItemId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await api<CourseCalendarItem>(`/courses/${courseId}/calendar-items`, {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      await loadCalendarItems()
      setSelectedDayKey(calendarDayKey(dueAt))
      closeEditor()
      toast.success(editingItemId ? 'Calendar item updated' : 'Calendar item created')
    } catch (err) {
      showError(err, editingItemId ? 'Could not update calendar item' : 'Could not create calendar item')
    } finally {
      setSavingItem(false)
    }
  }

  const deleteItem = async (itemId: string) => {
    if (!professorId || !window.confirm('Delete this calendar item?')) return

    try {
      setDeletingItemId(itemId)
      await api<{ ok: true }>(`/courses/${courseId}/calendar-items/${itemId}`, {
        method: 'DELETE',
        body: JSON.stringify({ professorId }),
      })
      await loadCalendarItems()
      closeEditor()
      toast.success('Calendar item deleted')
    } catch (err) {
      showError(err, 'Could not delete calendar item')
    } finally {
      setDeletingItemId(null)
    }
  }

  const showSkeleton = (calendarLoading || assignments === undefined) && calendarEntries.length === 0

  return (
    <>
      <div className="course-calendar-shell">
        <div className="course-calendar-main">
          <div className="calendar-summary">
            <div>
              <h3>Course calendar</h3>
              <p>
                {role === 'professor'
                  ? 'Scroll through the months, then click a day square to add something to that date.'
                  : 'Scroll through the months, then click a day square to see everything due on that date.'}
              </p>
            </div>
            {calendarLoading && <span className="calendar-status">Loading custom items…</span>}
          </div>

          {showSkeleton ? (
            <div className="calendar-skeleton">
              <div className="skeleton-row" />
              <div className="skeleton-row" style={{ width: '78%' }} />
              <div className="skeleton-row" style={{ width: '64%' }} />
            </div>
          ) : (
            <div className="calendar-month-list">
              {monthSections.map(({ key, month, days, entryCount }) => (
                <section key={key} className="calendar-month-section">
                  <div className="calendar-month-heading">
                    <h4>{formatCalendarMonth(month)}</h4>
                    <p>
                      {entryCount > 0
                        ? `${entryCount} ${entryCount === 1 ? 'item' : 'items'} this month.`
                        : 'No items on this month yet.'}
                    </p>
                  </div>

                  <div className="calendar-grid-shell">
                    <div className="calendar-weekdays">
                      {calendarWeekdayLabels.map((label) => (
                        <span key={label} className="calendar-weekday">{label}</span>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {days.map((day, index) => {
                        if (!day) {
                          return <div key={`${key}-blank-${index}`} className="calendar-day-cell empty-day" aria-hidden="true" />
                        }

                        const dayKey = calendarDayKey(day)
                        const dayEntries = entriesByDay.get(dayKey) ?? []
                        const isSelected = dayKey === selectedDayKey
                        const isToday = dayKey === todayKey

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            className={`calendar-day-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
                            onClick={() => openDay(day)}
                          >
                            <span className="calendar-day-number-row">
                              <span className="calendar-day-number">{day.getDate()}</span>
                              {isToday && <span className="calendar-today-pill">Today</span>}
                            </span>
                            <div className="calendar-day-items">
                              {dayEntries.slice(0, 3).map((entry) => (
                                <span key={entry.id} className={`calendar-cell-entry ${entry.kind}`}>
                                  <span className="calendar-cell-entry-label">{entry.linkedAssignment?.name ?? entry.title}</span>
                                </span>
                              ))}
                              {dayEntries.length > 3 && <span className="calendar-cell-more">+{dayEntries.length - 3} more</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}

          {selectedDayDate && (
            <section className="calendar-day-panel">
              <div className="calendar-day-panel-head">
                <div>
                  <h4>{formatCalendarDay(selectedDayDate)}</h4>
                  <p>
                    {selectedDayEntries.length > 0
                      ? `${selectedDayEntries.length} ${selectedDayEntries.length === 1 ? 'item' : 'items'} on this day.`
                      : 'No items for this day yet.'}
                  </p>
                </div>
              </div>

              {selectedDayEntries.length === 0 ? (
                <div className="calendar-day-empty">
                  <CalendarDays size={18} />
                  <span>No items for this day.</span>
                </div>
              ) : (
                <div className="calendar-entry-list">
                  {selectedDayEntries.map((entry) => {
                    const openAssignment = entry.assignment ?? entry.linkedAssignment
                    return (
                      <article key={entry.id} className="calendar-entry-card">
                        <div className="calendar-entry-topline">
                          <div className="calendar-entry-badges">
                            <span className={`calendar-kind-pill ${entry.kind}`}>{entry.kind === 'deadline' ? 'Deadline' : 'Event'}</span>
                            <span className={`calendar-source-pill ${entry.source}`}>{entry.source === 'assignment' ? 'Assignment' : 'Course item'}</span>
                          </div>
                          <time dateTime={entry.dueAt} className="calendar-entry-time">{formatCalendarTime(entry.dueAt)}</time>
                        </div>
                        <div className="calendar-entry-body">
                          <strong>{entry.title}</strong>
                          {entry.linkedAssignment && <p>Assignment due: {entry.linkedAssignment.name}</p>}
                          {entry.description && <p>{entry.description}</p>}
                        </div>
                        <div className="calendar-entry-footer">
                          <span>{formatCalendarDateTime(entry.dueAt)}</span>
                          <div className="calendar-entry-actions">
                            {openAssignment && (
                              <button type="button" className="btn btn-sm" onClick={() => onSelectAssignment(openAssignment)}>
                                Open assignment
                              </button>
                            )}
                            {entry.source === 'custom' && role === 'professor' && professorId && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => {
                                    const item = entry.itemId ? calendarItemMap.get(entry.itemId) : undefined
                                    if (item) startEditingItem(item)
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => entry.itemId && deleteItem(entry.itemId)}
                                  disabled={deletingItemId === entry.itemId}
                                >
                                  {deletingItemId === entry.itemId ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {role === 'professor' && professorId && editorOpen && selectedDayDate && (
        <div className="calendar-editor-backdrop" onClick={closeEditor}>
          <div className="calendar-editor-modal" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-editor-header">
              <span className="calendar-editor-selected">{formatCalendarDay(selectedDayDate)}</span>
              <div className="calendar-editor-title-row">
                <h3>{editingItemId ? 'Edit calendar item' : 'Add item to selected day'}</h3>
                <button type="button" className="btn btn-sm" onClick={closeEditor}>Close</button>
              </div>
              <p>Write what should appear on this day.</p>
            </div>
            <form className="calendar-item-form" onSubmit={saveItem}>
              <label>
                <span>Title</span>
                <input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder="Midterm review session" required />
              </label>
              <label>
                <span>Kind</span>
                <select
                  value={formKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as CourseCalendarItem['kind']
                    setFormKind(nextKind)
                    if (nextKind !== 'deadline') setFormAssignmentId('')
                  }}
                >
                  <option value="deadline">Deadline</option>
                  <option value="event">Event</option>
                </select>
              </label>
              {formKind === 'deadline' && (
                assignments && assignments.length > 0 ? (
                  <label>
                    <span>Assignment due</span>
                    <select value={formAssignmentId} onChange={(event) => setFormAssignmentId(event.target.value)}>
                      <option value="">General course deadline</option>
                      {assignments.map((assignment) => (
                        <option key={assignment.id} value={assignment.id}>{assignment.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label>
                    <span>Assignment due</span>
                    <select value="" disabled>
                      <option>No assignments in this course yet</option>
                    </select>
                  </label>
                )
              )}
              <label>
                <span>Date & time</span>
                <input type="datetime-local" value={formDueAt} onChange={(event) => setFormDueAt(event.target.value)} required />
              </label>
              <label>
                <span>Description</span>
                <textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder="Optional details for students" rows={4} />
              </label>
              <div className="calendar-form-actions">
                <button type="submit" className="btn btn-sm btn-primary" disabled={savingItem}>
                  {savingItem ? 'Saving…' : editingItemId ? 'Save changes' : 'Add item'}
                </button>
                <button type="button" className="btn btn-sm" onClick={closeEditor} disabled={savingItem}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function CourseDetail({
  course, role, assignments, groupsByAssignment, onSelectAssignment, onAssignmentCreated, professorId,
}: {
  course: Course
  role: Role
  assignments: Assignment[] | undefined
  groupsByAssignment: Record<string, Group[]>
  onSelectAssignment: (assignment: Assignment) => void
  onAssignmentCreated: () => void
  professorId?: string
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importingCsv, setImportingCsv] = useState(false)
  const [tab, setTab] = useState<CourseCalendarTab>('calendar')
  const [courseMembers, setCourseMembers] = useState<Member[] | null>(null)
  const [membersRefreshKey, setMembersRefreshKey] = useState(0)
  const assignmentCount = assignments?.length ?? 0

  useEffect(() => {
    setTab('calendar')
    setCourseMembers(null)
    setMembersRefreshKey(0)
  }, [course.id])

  useEffect(() => {
    if (role !== 'professor' || tab !== 'students') return

    let ignore = false
    setCourseMembers(null)

    api<Member[]>(`/courses/${course.id}/members`)
      .then((members) => {
        if (ignore) return
        setCourseMembers(members)
      })
      .catch((err) => {
        if (ignore) return
        showError(err, 'Could not load course students')
        setCourseMembers([])
      })

    return () => {
      ignore = true
    }
  }, [course.id, role, tab, membersRefreshKey])

  const importStudents = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !professorId) return

    try {
      setImportingCsv(true)
      const csv = await file.text()
      const result = await api<{ importedStudents: number }>(`/courses/${course.id}/import-students`, {
        method: 'POST',
        body: JSON.stringify({ professorId, csv }),
      })
      setMembersRefreshKey((value) => value + 1)
      toast.success(`Imported ${result.importedStudents} students`)
      setTab('students')
    } catch (err) {
      showError(err, 'Could not import student CSV')
    } finally {
      setImportingCsv(false)
    }
  }

  return (
    <>
      <div className="detail-header compact">
        <div className="detail-title-row">
          <div className="title-block">
            <h2>{course.name}</h2>
            <span className="meta-inline">
              <ClipboardList size={11} /> {assignments === undefined ? 'Loading assignments…' : `${assignmentCount} ${assignmentCount === 1 ? 'assignment' : 'assignments'}`}
              {role === 'professor' && tab === 'students' && courseMembers !== null && (
                <>
                  <span className="dot-sep" />
                  <Users size={11} /> {courseMembers.length} {courseMembers.length === 1 ? 'student' : 'students'}
                </>
              )}
            </span>
          </div>
          <div className="detail-actions">
            <div className="tabs" aria-label="Course detail tabs">
              <button type="button" className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
                <CalendarDays size={13} /> Calendar
              </button>
              <button type="button" className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
                <ClipboardList size={13} /> Assignments
              </button>
              {role === 'professor' && (
                <button type="button" className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
                  <Users size={13} /> Students
                </button>
              )}
            </div>
            {role === 'professor' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importStudents}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingCsv}
                >
                  {importingCsv ? 'Importing…' : 'Import CSV'}
                </button>
              </>
            )}
            <CopyChip label="Join code" value={course.joinCode} accent />
          </div>
        </div>
      </div>
      {role === 'professor' && tab === 'students' ? (
        <CourseStudentsView courseMembers={courseMembers} />
      ) : tab === 'calendar' ? (
        <div className="tab-body">
          <CourseCalendarView
            courseId={course.id}
            role={role}
            assignments={assignments}
            professorId={professorId}
            onSelectAssignment={onSelectAssignment}
          />
        </div>
      ) : (
        <div className="tab-body" style={{ padding: 20 }}>
          {assignments === undefined ? (
            <>
              <div className="skeleton-row" />
              <div className="skeleton-row" style={{ width: '76%' }} />
              <div className="skeleton-row" style={{ width: '88%' }} />
            </>
          ) : assignments.length === 0 ? (
            <div className="detail-empty" style={{ height: 'auto', padding: 40 }}>
              <div className="icon-circle"><ClipboardList size={22} /></div>
              <h3>No assignments yet</h3>
              <p>{role === 'professor' ? 'Create an assignment from the sidebar to get started.' : 'No assignments have been posted in this course yet.'}</p>
              {role === 'professor' && professorId && (
                <div style={{ marginTop: 16 }}>
                  <CreateAssignmentForm professorId={professorId} courseId={course.id} onCreated={onAssignmentCreated} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {assignments.map((assignment) => {
                const groupCount = groupsByAssignment[assignment.id]?.length ?? 0
                return (
                  <button
                    key={assignment.id}
                    onClick={() => onSelectAssignment(assignment)}
                    style={{
                      display: 'grid', gap: 8, padding: 14, textAlign: 'left',
                      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ClipboardList size={14} style={{ color: 'var(--accent)' }} />
                      <strong style={{ fontWeight: 600 }}>{assignment.name}</strong>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {groupCount} {groupCount === 1 ? 'group' : 'groups'}
                    </span>
                    {assignment.dueDate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12 }}>
                        <CalendarDays size={12} style={{ color: 'var(--accent-2)' }} /> {formatCalendarDateTime(assignment.dueDate)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function CourseStudentsView({ courseMembers }: { courseMembers: Member[] | null }) {
  if (courseMembers === null) {
    return (
      <div className="students-panel">
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }

  if (courseMembers.length === 0) {
    return (
      <div className="detail-empty">
        <div className="icon-circle"><Users size={22} /></div>
        <h3>No students in this course</h3>
        <p>Students will appear here after they join the course or you import a CSV.</p>
      </div>
    )
  }

  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Course students</h3>
          <span>{courseMembers.length}</span>
        </div>
        <div className="student-list compact">
          {courseMembers.map((student) => (
            <div className="student-row" key={student.userId}>
              <div className="student-avatar">{initials(student.username ?? student.displayName)}</div>
              <div className="student-main">
                <span className="student-name">{student.username ?? student.displayName}</span>
                <span className="student-meta">{student.displayName}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function AssignmentDetail({
  assignment, course, role, groups, onSelectGroup, onGroupCreated, professorId,
}: {
  assignment: Assignment
  course: Course
  role: Role
  groups: Group[]
  onSelectGroup: (g: Group) => void
  onGroupCreated: () => void
  professorId?: string
}) {
  return (
    <>
      <div className="detail-header compact">
        <div className="detail-title-row">
          <div className="title-block">
            <span className="course-tag" title={course.name}><BookOpen size={11} /> {course.name}</span>
            <h2>{assignment.name}</h2>
            <span className="meta-inline">
              <Users size={11} /> {groups.length} {groups.length === 1 ? 'group' : 'groups'}
              {assignment.dueDate && (
                <>
                  <span className="dot-sep" />
                  <CalendarDays size={11} /> {formatCalendarDateTime(assignment.dueDate)}
                </>
              )}
            </span>
          </div>
        </div>
      </div>
      <div style={{ overflow: 'auto', padding: 20 }}>
        {groups.length === 0 ? (
          <div className="detail-empty" style={{ height: 'auto', padding: 40 }}>
            <div className="icon-circle"><Users size={22} /></div>
            <h3>No groups yet</h3>
            <p>{role === 'professor' ? 'Create a group for this assignment from the sidebar.' : 'You have not joined a group for this assignment yet.'}</p>
            {role === 'professor' && professorId && (
              <div style={{ marginTop: 16 }}>
                <CreateGroupForm professorId={professorId} assignmentId={assignment.id} onCreated={onGroupCreated} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => onSelectGroup(g)}
                style={{
                  display: 'grid', gap: 8, padding: 14, textAlign: 'left',
                  background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={14} style={{ color: 'var(--accent)' }} />
                  <strong style={{ fontWeight: 600 }}>{g.name}</strong>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Open group dashboard, files & history</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ============ Copy helpers ============ */

function CopyChip({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label} copied`)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <span className={`chip ${accent ? 'accent' : ''} ${mono ? 'code' : ''}`}>
      <span>{label}:</span>
      <strong style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</strong>
      <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy} title="Copy">
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </button>
    </span>
  )
}


export default App

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toaster, toast } from 'sonner'
import {
  BookOpen, Users, ChevronRight, Plus, Search, LogOut, Copy, Check,
  Settings, KeyRound, GraduationCap, UserRound, AlertCircle,
  ClipboardList, CalendarDays, ArrowUpRight, Home, MoreVertical, PanelLeftClose,
} from 'lucide-react'
import { api, getApiBase } from './api'
import { studentAvatarStyle } from './avatar'
import { initials } from './format'
import type { Assignment, Course, CourseCalendarItem, Group, Member, Professor, ProfessorGithubConnection, Role, Session, User } from './types'
import { GroupDetail } from './components/groups/GroupDetail'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  DialogShell,
  EmptyState,
  Input,
  Select,
  Textarea,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  StatCard,
  Tabs,
  TabsList,
  TabsTrigger,
} from './components/ui'
import './App.css'

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

  useEffect(() => {
    const url = new URL(window.location.href)
    const oauthResult = url.searchParams.get('github_oauth')
    if (!oauthResult) return
    if (oauthResult === 'connected') toast.success('GitHub account connected')
    else if (oauthResult === 'missing_config') toast.error('GitHub OAuth is not configured yet')
    else toast.error('GitHub OAuth did not complete')
    url.searchParams.delete('github_oauth')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  return (
    <>
      <Toaster theme="light" position="bottom-right" toastOptions={{ style: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' } }} />
      {!session ? (
        <LoginScreen onLogin={saveSession} />
      ) : (
        <div className="app-shell app-shell-sidebar">
          {session.role === 'professor'
            ? <Dashboard role="professor" professor={session.professor} displayName={session.displayName} onProfessorUpdated={(professor) => saveSession({ role: 'professor', professor, displayName: professor.user?.displayName ?? session.displayName })} onLogout={() => saveSession(null)} />
            : <Dashboard role="student" user={session.user} onStudentUpdated={(user) => saveSession({ role: 'student', user })} onLogout={() => saveSession(null)} />
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
      const accountName = username.trim()
      if (mode === 'login') {
        try {
          const professor = await api<Professor>('/auth/professor/login', { method: 'POST', body: JSON.stringify({ username: accountName, password }) })
          onLogin({ role: 'professor', professor, displayName: professor.user?.displayName ?? accountName })
          return
        } catch {
          try {
            const user = await api<User>('/auth/student/login', { method: 'POST', body: JSON.stringify({ username: accountName, password }) })
            onLogin({ role: 'student', user })
            return
          } catch {
            throw new Error('Invalid username or password')
          }
        }
      }

      if (role === 'student') {
        const user = await api<User>('/auth/student/register', { method: 'POST', body: JSON.stringify({ username: accountName, password, displayName }) })
        onLogin({ role: 'student', user })
      } else {
        const professor = await api<Professor>('/auth/professor/register', { method: 'POST', body: JSON.stringify({ username: accountName, password, displayName }) })
        onLogin({ role: 'professor', professor, displayName: professor.user?.displayName ?? (displayName || accountName) })
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
    <main className="login-shell login-shell-remake">
      <section className="login-hero login-hero-remake" aria-labelledby="login-title">
        <Badge variant="accent" className="site-kicker"><span className="brand-mark" /> Miyagi</Badge>
        <h1 id="login-title">A calm command center for courses, teams, and code review.</h1>
        <p>Publish assignments, organize groups, inspect repository work, and keep the semester moving without dashboard clutter.</p>
        <div className="hero-points" aria-label="Miyagi features">
          <span><Users size={14} /> Group workspaces</span>
          <span><ClipboardList size={14} /> Assignment tracking</span>
          <span><CalendarDays size={14} /> Course calendar</span>
        </div>
      </section>

      <form className="login-card ui-card login-card-remake" onSubmit={submit}>
        <div className="login-header">
          <Badge variant="muted" className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create your account'}</Badge>
          <h2>{mode === 'login' ? 'Sign in to Miyagi' : 'Start using Miyagi'}</h2>
          <p>{mode === 'login' ? 'Use your account to continue to your dashboard.' : 'Choose your role and create a browser-based workspace.'}</p>
        </div>

        {mode === 'register' && (
          <Tabs aria-label="Account type">
            <TabsList className="segmented segmented-remake">
              <TabsTrigger active={role === 'professor'} onClick={() => setRole('professor')}>
                <GraduationCap size={14} /> Professor
              </TabsTrigger>
              <TabsTrigger active={role === 'student'} onClick={() => setRole('student')}>
                <UserRound size={14} /> Student
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {mode === 'register' && (
          <Input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus />
        )}
        <Input placeholder="Email or username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus={mode === 'login'} />
        <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

        {error && <div className="error"><AlertCircle size={14} /> {error}</div>}

        <Button type="submit" variant="primary" size="lg" disabled={submitting} className="login-submit">
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>

        <Button type="button" variant="ghost" className="toggle-link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          <strong>{mode === 'login' ? 'Sign up' : 'Sign in'}</strong>
        </Button>

        <div className="expander">
          <Button type="button" variant="ghost" className="expander-toggle" onClick={() => setShowSettings(!showSettings)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Settings size={12} /> Backend settings</span>
            <ChevronRight size={14} style={{ transform: showSettings ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />
          </Button>
          {showSettings && (
            <div className="expander-body">
              <label>Backend URL</label>
              <Input value={apiBase} onChange={(e) => setApiBase(e.target.value)} placeholder="http://localhost:3000" />
              <Button type="button" variant="secondary" size="sm" onClick={saveApiBase} style={{ justifySelf: 'start' }}>Save</Button>
            </div>
          )}
        </div>
      </form>
    </main>
  )
}

/* ============ Dashboard ============ */

type DashboardProps =
  | { role: 'professor'; professor: Professor; displayName: string; onProfessorUpdated: (professor: Professor) => void; onLogout: () => void }
  | { role: 'student'; user: User; onStudentUpdated: (user: User) => void; onLogout: () => void }

function Dashboard(props: DashboardProps) {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [assignmentsByCourse, setAssignmentsByCourse] = useState<Record<string, Assignment[]>>({})
  const [groupsByAssignment, setGroupsByAssignment] = useState<Record<string, Group[]>>({})
  const [studentGroups, setStudentGroups] = useState<Group[] | null>(props.role === 'student' ? null : [])
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const [expandedAssignments, setExpandedAssignments] = useState<Set<string>>(new Set())
  const [expandedMyGroups, setExpandedMyGroups] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarContent, setSidebarContent] = useState<ReactNode | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [professorGithubConnection, setProfessorGithubConnection] = useState<ProfessorGithubConnection | null>(null)
  const accountUserId = props.role === 'professor' ? props.professor.userId : props.user.id
  const accountDisplayName = props.role === 'professor' ? props.displayName : props.user.displayName
  const accountGithubUsername = props.role === 'student' ? props.user.githubUsername ?? '' : professorGithubConnection?.githubUsername ?? props.professor.user?.githubUsername ?? ''
  const accountAvatarColor = props.role === 'student' ? props.user.avatarColor ?? null : null

  const handleAccountUpdated = useCallback((user: User) => {
    if (props.role === 'student') props.onStudentUpdated(user)
    else props.onProfessorUpdated({ ...props.professor, user })
  }, [props.role, props])

  useEffect(() => {
    if (props.role !== 'professor') return
    let ignore = false
    api<ProfessorGithubConnection>(`/professors/${props.professor.id}/github`)
      .then((connection) => {
        if (!ignore) setProfessorGithubConnection(connection)
      })
      .catch(() => {
        if (!ignore) setProfessorGithubConnection({ connected: false, githubUsername: null, scope: null })
      })
    return () => {
      ignore = true
    }
  }, [props.role, props.role === 'professor' ? props.professor.id : null])

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshCourses()
  }, [refreshCourses])

  const refreshStudentGroups = useCallback(async () => {
    if (props.role !== 'student') {
      setStudentGroups([])
      return
    }
    try {
      const groups = await api<Group[]>(`/groups/user/${props.user.id}`)
      setStudentGroups(groups)
    } catch (err) {
      showError(err, 'Could not load your groups')
      setStudentGroups([])
    }
  }, [props])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStudentGroups()
  }, [refreshStudentGroups])

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

  const selectStudentGroup = async (group: Group) => {
    if (!group.courseId || !group.assignmentId) return
    const course = courses?.find((candidate) => candidate.id === group.courseId)
    if (!course) return

    let assignments = assignmentsByCourse[course.id]
    if (!assignments) {
      try {
        assignments = await api<Assignment[]>(`/courses/${course.id}/assignments`)
        setAssignmentsByCourse((prev) => ({ ...prev, [course.id]: assignments ?? [] }))
      } catch (err) {
        showError(err, 'Could not load assignments')
        return
      }
    }

    const assignment = assignments.find((candidate) => candidate.id === group.assignmentId)
    if (!assignment) return
    setSelectedCourseId(course.id)
    setSelectedAssignment(assignment)
    setSelectedGroup(group)
    setExpandedCourses((prev) => new Set(prev).add(course.id))
    setExpandedAssignments((prev) => new Set(prev).add(assignment.id))
  }

  const handleGroupUpdated = useCallback((updatedGroup: Group) => {
    setSelectedGroup((current) => current?.id === updatedGroup.id ? updatedGroup : current)
    setStudentGroups((current) => current?.map((group) => (
      group.id === updatedGroup.id ? updatedGroup : group
    )) ?? current)
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
      if (c.name.toLowerCase().includes(q) || (props.role === 'professor' && c.joinCode?.toLowerCase().includes(q))) return true
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
  const courseCount = courses?.length ?? 0
  const assignmentCount = Object.values(assignmentsByCourse).reduce((total, assignments) => total + assignments.length, 0)
  const groupCount = Object.values(groupsByAssignment).reduce((total, groups) => total + groups.length, 0)
  const primaryEmptyTitle = props.role === 'professor' ? 'Account home' : 'Student home'
  const primaryEmptyCopy = props.role === 'professor'
    ? 'Create a course, import students, publish assignments, and review group work from the sidebar.'
    : 'Join courses, find assignments, and keep your group work organized from the sidebar.'
  const pageTitle = selectedGroup?.name ?? selectedAssignment?.name ?? selectedCourse?.name ?? primaryEmptyTitle
  const pageSubtitle = selectedGroup && selectedCourse && selectedAssignment
    ? `${selectedCourse.name} / ${selectedAssignment.name}`
    : selectedAssignment && selectedCourse
      ? selectedCourse.name
      : selectedCourse
        ? `${assignmentCount} ${assignmentCount === 1 ? 'assignment' : 'assignments'}`
        : primaryEmptyCopy

  return (
    <SidebarProvider
      className="miyagi-sidebar-provider"
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
    >
      <Sidebar variant="sidebar" collapsible="icon" className="miyagi-sidebar">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="sidebar-brand-button">
                <span className="brand-mark" />
                <span className="sidebar-brand-copy">
                  <strong>Miyagi</strong>
                  <small>{props.role === 'professor' ? 'Professor workspace' : 'Student workspace'}</small>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {!sidebarContent && (
            <div className="sidebar-search ui-sidebar-search">
              <Search size={13} className="search-icon" />
              <Input
                ref={searchRef}
                placeholder="Quick search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="kbd-hint">⌘K</span>
            </div>
          )}

          {sidebarContent ? (
            <SidebarGroup>
              <SidebarGroupLabel>{sidebarTitle}</SidebarGroupLabel>
              <SidebarGroupContent>{sidebarContent}</SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <>
              <SidebarGroup>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={!selectedCourse && !selectedAssignment && !selectedGroup} onClick={() => {
                      setSelectedCourseId(null)
                      setSelectedAssignment(null)
                      setSelectedGroup(null)
                    }}>
                      <Home />
                      <span>Account home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>

              {props.role === 'student' && (
                <SidebarGroup>
                  <SidebarGroupLabel>Student</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setExpandedMyGroups((open) => !open)}>
                          <ChevronRight className={`chev ${expandedMyGroups ? 'open' : ''}`} />
                          <Users />
                          <span>My groups</span>
                          {studentGroups && <span className="sidebar-count">{studentGroups.length}</span>}
                        </SidebarMenuButton>
                        {expandedMyGroups && (
                          <SidebarMenuSub>
                            {studentGroups === null ? (
                              <SidebarMenuSubItem><div className="skeleton-row" /></SidebarMenuSubItem>
                            ) : studentGroups.length === 0 ? (
                              <SidebarMenuSubItem><div className="sidebar-empty compact">No groups yet.</div></SidebarMenuSubItem>
                            ) : (
                              studentGroups.map((group) => (
                                <SidebarMenuSubItem key={group.id}>
                                  <SidebarMenuSubButton
                                    isActive={selectedGroup?.id === group.id}
                                    onClick={() => void selectStudentGroup(group)}
                                  >
                                    <Users />
                                    <span>{group.name}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))
                            )}
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              )}

              <SidebarGroup>
                <SidebarGroupLabel>{props.role === 'professor' ? 'Courses' : 'Enrolled'}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      {props.role === 'student' ? (
                        <JoinCourseForm onJoined={refreshCourses} userId={props.user.id} />
                      ) : (
                        <CreateCourseForm onCreated={refreshCourses} professorId={props.professor.id} />
                      )}
                    </SidebarMenuItem>
                    {courses === null ? (
                      <>
                        <SidebarMenuItem><div className="skeleton-row" /></SidebarMenuItem>
                        <SidebarMenuItem><div className="skeleton-row" style={{ width: '70%' }} /></SidebarMenuItem>
                        <SidebarMenuItem><div className="skeleton-row" style={{ width: '85%' }} /></SidebarMenuItem>
                      </>
                    ) : filteredCourses && filteredCourses.length === 0 ? (
                      <SidebarMenuItem>
                        <div className="sidebar-empty">
                          {search ? 'No matches.' : props.role === 'professor'
                            ? 'No courses yet. Create one above.'
                            : 'No courses yet. Use a join code above.'}
                        </div>
                      </SidebarMenuItem>
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" onClick={() => setAccountDialogOpen(true)}>
                <Avatar fallback={initials(userDisplayName)} style={props.role === 'student' ? studentAvatarStyle({ avatarColor: props.user.avatarColor, userId: props.user.id, username: props.user.deviceHash, displayName: props.user.displayName }) : undefined} />
                <span className="user-text">
                  <span className="name">{userDisplayName}</span>
                  <span className="meta">{props.role === 'student' && props.user.githubUsername ? props.user.githubUsername : props.role === 'professor' && accountGithubUsername ? `GitHub: ${accountGithubUsername}` : 'Account settings'}</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail aria-label="Toggle sidebar" />
      </Sidebar>

      <SidebarInset className="miyagi-sidebar-inset">
        <header className="workspace-topbar">
          <div className="workspace-title">
            <SidebarTrigger className="workspace-sidebar-trigger"><PanelLeftClose size={14} /></SidebarTrigger>
            <div>
              <span>{selectedCourse ? 'Course workspace' : 'Account home'}</span>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
          </div>
          <div className="workspace-actions">
            <Button variant="ghost" size="icon" title="More actions"><MoreVertical size={15} /></Button>
            <Button variant="ghost" size="sm" title="Log out" onClick={props.onLogout}>
              <LogOut size={14} /> Log out
            </Button>
          </div>
        </header>

        <section className="workspace-content">
          {selectedGroup && selectedCourse && selectedAssignment ? (
            <div className="workspace-panel">
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
            </div>
          ) : selectedAssignment && selectedCourse ? (
            <div className="workspace-panel">
              <AssignmentDetail
                assignment={selectedAssignment}
                course={selectedCourse}
                role={props.role}
                groups={groupsByAssignment[selectedAssignment.id] ?? []}
                onSelectGroup={(g) => setSelectedGroup(g)}
                onGroupCreated={() => loadGroups(selectedAssignment)}
                professorId={props.role === 'professor' ? props.professor.id : undefined}
              />
            </div>
          ) : selectedCourse ? (
            <div className="workspace-panel">
              <CourseDetail
                course={selectedCourse}
                role={props.role}
                assignments={assignmentsByCourse[selectedCourse.id]}
                groupsByAssignment={groupsByAssignment}
                onSelectAssignment={(assignment) => selectAssignment(selectedCourse, assignment)}
                onAssignmentCreated={() => loadAssignments(selectedCourse)}
                professorId={props.role === 'professor' ? props.professor.id : undefined}
              />
            </div>
          ) : (
            <div className="account-home">
              <div className="account-metrics">
                <StatCard icon={<BookOpen size={16} />} value={courseCount} title={courseCount === 1 ? 'Course' : 'Courses'} />
                <StatCard icon={<ClipboardList size={16} />} value={assignmentCount} title={assignmentCount === 1 ? 'Assignment' : 'Assignments'} />
                <StatCard icon={<Users size={16} />} value={groupCount} title={groupCount === 1 ? 'Group' : 'Groups'} />
              </div>
              <div className="account-home-grid">
                <Card className="account-home-card">
                  <div className="account-home-card-head">
                    <h3>{props.role === 'professor' ? 'Courses' : 'Enrolled courses'}</h3>
                    <Badge variant="muted">{courseCount}</Badge>
                  </div>
                  <div className="account-home-list">
                    {(courses ?? []).slice(0, 5).map((course) => (
                      <button key={course.id} onClick={() => selectCourse(course)}>
                        <BookOpen size={14} />
                        <span>{course.name}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                    {courses !== null && courses.length === 0 && <p>{primaryEmptyCopy}</p>}
                  </div>
                </Card>
                <Card className="account-home-card">
                  <div className="account-home-card-head">
                    <h3>Next steps</h3>
                    <Badge variant="accent">Ready</Badge>
                  </div>
                  <div className="onboarding-grid sidebar-onboarding-grid" aria-label="Getting started">
                    <article>
                      <BookOpen size={16} />
                      <strong>{props.role === 'professor' ? 'Create a course' : 'Join a course'}</strong>
                      <span>{props.role === 'professor' ? 'Use the sidebar course action to start a course.' : 'Use a join code from your professor.'}</span>
                    </article>
                    <article>
                      <ClipboardList size={16} />
                      <strong>Track assignments</strong>
                      <span>Assignments, due dates, groups, files, and review history stay in one place.</span>
                    </article>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </section>
        {accountDialogOpen && (
          <AccountSettingsDialog
            role={props.role}
            userId={accountUserId}
            displayName={accountDisplayName}
            githubUsername={accountGithubUsername}
            avatarColor={accountAvatarColor}
            professorId={props.role === 'professor' ? props.professor.id : undefined}
            githubConnection={props.role === 'professor' ? professorGithubConnection : null}
            onClose={() => setAccountDialogOpen(false)}
            onSaved={handleAccountUpdated}
            onGithubConnectionChanged={setProfessorGithubConnection}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}

function AccountSettingsDialog({
  role,
  userId,
  displayName,
  githubUsername,
  avatarColor,
  professorId,
  githubConnection,
  onClose,
  onSaved,
  onGithubConnectionChanged,
}: {
  role: Role
  userId: string
  displayName: string
  githubUsername: string
  avatarColor: string | null
  professorId?: string
  githubConnection?: ProfessorGithubConnection | null
  onClose: () => void
  onSaved: (user: User) => void
  onGithubConnectionChanged?: (connection: ProfessorGithubConnection) => void
}) {
  const [nameInput, setNameInput] = useState(displayName)
  const [avatarColorInput, setAvatarColorInput] = useState(studentAvatarStyle({ avatarColor, userId }).backgroundColor as string)
  const [githubInput, setGithubInput] = useState(githubUsername)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [githubBusy, setGithubBusy] = useState(false)

  const connectProfessorGithub = () => {
    if (!professorId) return
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.href = `${getApiBase()}/auth/professor/github/start?professorId=${encodeURIComponent(professorId)}&returnTo=${encodeURIComponent(returnTo)}`
  }

  const disconnectProfessorGithub = async () => {
    if (!professorId) return
    try {
      setGithubBusy(true)
      const connection = await api<ProfessorGithubConnection>(`/professors/${professorId}/github`, { method: 'DELETE' })
      onGithubConnectionChanged?.(connection)
      toast.success('GitHub account disconnected')
    } catch (err) {
      showError(err, 'Could not disconnect GitHub')
    } finally {
      setGithubBusy(false)
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const user = await api<User>(`/users/${userId}/account`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: nameInput,
          ...(role === 'student' ? { githubUsername: githubInput, avatarColor: avatarColorInput } : {}),
        }),
      })

      if (currentPassword || newPassword) {
        await api<{ ok: true }>(`/users/${userId}/password`, {
          method: 'PATCH',
          body: JSON.stringify({ currentPassword, newPassword }),
        })
      }

      onSaved(user)
      toast.success('Account updated')
      onClose()
    } catch (err) {
      showError(err, 'Could not update account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogShell
      className="account-dialog"
      title="Account settings"
      description="Manage your public profile and password."
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form className="account-form" onSubmit={submit}>
        <div className="form-section">
          <label htmlFor="account-display-name">Display name</label>
          <Input id="account-display-name" value={nameInput} onChange={(event) => setNameInput(event.target.value)} autoFocus />
        </div>

        {role === 'student' && (
          <div className="form-section">
            <label htmlFor="account-github-username">GitHub username</label>
            <Input id="account-github-username" value={githubInput} onChange={(event) => setGithubInput(event.target.value)} placeholder="koushik255" />
          </div>
        )}

        {role === 'student' && (
          <div className="form-section">
            <label htmlFor="account-avatar-color">Avatar color</label>
            <div className="avatar-color-control">
              <Avatar fallback={initials(nameInput || displayName)} style={studentAvatarStyle({ avatarColor: avatarColorInput, userId, displayName: nameInput || displayName })} />
              <Input id="account-avatar-color" type="color" value={avatarColorInput} onChange={(event) => setAvatarColorInput(event.target.value)} aria-label="Avatar color" />
            </div>
          </div>
        )}

        {role === 'professor' && (
          <div className="form-section github-oauth-section">
            <div className="github-oauth-copy">
              <label>GitHub OAuth</label>
              <p>
                {githubConnection?.connected && githubConnection.githubUsername
                  ? `Connected as ${githubConnection.githubUsername}. Miyagi can use this token for professor-owned GitHub repositories.`
                  : 'Connect a GitHub account. Add GitHub OAuth credentials later with GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, and GITHUB_OAUTH_REDIRECT_URI.'}
              </p>
            </div>
            <div className="github-oauth-actions">
              <Button type="button" variant="primary" size="sm" onClick={connectProfessorGithub} disabled={saving || githubBusy}>
                <UserRound size={13} /> {githubConnection?.connected ? 'Reconnect GitHub' : 'Connect GitHub'}
              </Button>
              {githubConnection?.connected && (
                <Button type="button" variant="secondary" size="sm" onClick={disconnectProfessorGithub} disabled={saving || githubBusy}>
                  Disconnect
                </Button>
              )}
            </div>
            {githubConnection?.scope && <span className="github-oauth-scope">Scopes: {githubConnection.scope}</span>}
          </div>
        )}

        <div className="form-section password-section">
          <div>
            <label htmlFor="account-current-password">Change password</label>
            <p>Leave both password fields blank to keep your current password.</p>
          </div>
          <Input id="account-current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password, at least 8 characters" />
        </div>

        <div className="modal-actions">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save account'}
          </Button>
        </div>
      </form>
    </DialogShell>
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
      <SidebarMenuButton onClick={() => setOpen(true)}>
        <Plus /> <span>New course</span>
      </SidebarMenuButton>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create sidebar-inline-create">
      <Input placeholder="Course name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <Button type="submit" variant="primary" size="sm">Add</Button>
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
      <SidebarMenuButton onClick={() => setOpen(true)}>
        <KeyRound /> <span>Join with code</span>
      </SidebarMenuButton>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create sidebar-inline-create">
      <Input placeholder="Join code" autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onBlur={() => !code && setOpen(false)} />
      <Button type="submit" variant="primary" size="sm">Join</Button>
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
      <SidebarMenuSubButton onClick={() => setOpen(true)}>
        <Plus /> <span>New assignment</span>
      </SidebarMenuSubButton>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create assignment-create sidebar-inline-create">
      <Input placeholder="Assignment name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      <Input type="datetime-local" aria-label="Assignment due date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <Button type="submit" variant="primary" size="sm">Add</Button>
      <Button type="button" variant="secondary" size="sm" onClick={close}>Cancel</Button>
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
      <SidebarMenuSubButton onClick={() => setOpen(true)}>
        <Plus /> <span>New group</span>
      </SidebarMenuSubButton>
    )
  }
  return (
    <form onSubmit={submit} className="inline-create sidebar-inline-create">
      <Input placeholder="Group name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <Button type="submit" variant="primary" size="sm">Add</Button>
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
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => { onSelectCourse(); if (!expanded) onToggle() }}
      >
        <ChevronRight
          className={`chev ${expanded ? 'open' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle() }}
        />
        <BookOpen />
        <span>{course.name}</span>
        {assignments && <span className="sidebar-count">{assignments.length}</span>}
      </SidebarMenuButton>
      {expanded && (
        <SidebarMenuSub>
          {assignments === undefined ? (
            <SidebarMenuSubItem><div className="skeleton-row" /></SidebarMenuSubItem>
          ) : (
            <>
              {assignments.map((assignment) => (
                <SidebarMenuSubItem key={assignment.id}>
                  <SidebarMenuSubButton
                    isActive={activeAssignmentId === assignment.id && !activeGroupId}
                    onClick={() => onSelectAssignment(assignment)}
                  >
                    <ChevronRight
                      className={`chev ${expandedAssignments.has(assignment.id) ? 'open' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onToggleAssignment(assignment.id) }}
                    />
                    <ClipboardList />
                    <span>{assignment.name}</span>
                    {groupsByAssignment[assignment.id] && <span className="sidebar-count">{groupsByAssignment[assignment.id].length}</span>}
                  </SidebarMenuSubButton>
                  {expandedAssignments.has(assignment.id) && (
                    <SidebarMenuSub>
                      {groupsByAssignment[assignment.id] === undefined ? (
                        <SidebarMenuSubItem><div className="skeleton-row" /></SidebarMenuSubItem>
                      ) : (
                        <>
                          {groupsByAssignment[assignment.id].map((g) => (
                            <SidebarMenuSubItem key={g.id}>
                              <SidebarMenuSubButton
                                isActive={activeGroupId === g.id}
                                onClick={() => onSelectGroup(assignment, g)}
                              >
                                <Users />
                                <span>{g.name}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                          {role === 'professor' && professorId && (
                            <SidebarMenuSubItem>
                              <CreateGroupForm professorId={professorId} assignmentId={assignment.id} onCreated={() => onGroupCreated(assignment)} />
                            </SidebarMenuSubItem>
                          )}
                          {groupsByAssignment[assignment.id].length === 0 && role === 'student' && (
                            <SidebarMenuSubItem><div className="sidebar-empty compact">No groups yet.</div></SidebarMenuSubItem>
                          )}
                        </>
                      )}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuSubItem>
              ))}
              {role === 'professor' && professorId && (
                <SidebarMenuSubItem>
                  <CreateAssignmentForm professorId={professorId} courseId={course.id} onCreated={onAssignmentCreated} />
                </SidebarMenuSubItem>
              )}
              {assignments.length === 0 && role === 'student' && (
                <SidebarMenuSubItem><div className="sidebar-empty compact">No assignments yet.</div></SidebarMenuSubItem>
              )}
            </>
          )}
        </SidebarMenuSub>
      )}
    </SidebarMenuItem>
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
                            <Badge variant={entry.kind === 'deadline' ? 'accent' : 'success'} className={`calendar-kind-pill ${entry.kind}`}>{entry.kind === 'deadline' ? 'Deadline' : 'Event'}</Badge>
                            <Badge variant="muted" className={`calendar-source-pill ${entry.source}`}>{entry.source === 'assignment' ? 'Assignment' : 'Course item'}</Badge>
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
                              <Button type="button" variant="secondary" size="sm" onClick={() => onSelectAssignment(openAssignment)}>
                                Open assignment
                              </Button>
                            )}
                            {entry.source === 'custom' && role === 'professor' && professorId && (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    const item = entry.itemId ? calendarItemMap.get(entry.itemId) : undefined
                                    if (item) startEditingItem(item)
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => entry.itemId && deleteItem(entry.itemId)}
                                  disabled={deletingItemId === entry.itemId}
                                >
                                  {deletingItemId === entry.itemId ? 'Deleting…' : 'Delete'}
                                </Button>
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
                <Button type="button" variant="secondary" size="sm" onClick={closeEditor}>Close</Button>
              </div>
              <p>Write what should appear on this day.</p>
            </div>
            <form className="calendar-item-form" onSubmit={saveItem}>
              <label>
                <span>Title</span>
                <Input value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder="Midterm review session" required />
              </label>
              <label>
                <span>Kind</span>
                <Select
                  value={formKind}
                  onChange={(event) => {
                    const nextKind = event.target.value as CourseCalendarItem['kind']
                    setFormKind(nextKind)
                    if (nextKind !== 'deadline') setFormAssignmentId('')
                  }}
                >
                  <option value="deadline">Deadline</option>
                  <option value="event">Event</option>
                </Select>
              </label>
              {formKind === 'deadline' && (
                assignments && assignments.length > 0 ? (
                  <label>
                    <span>Assignment due</span>
                    <Select value={formAssignmentId} onChange={(event) => setFormAssignmentId(event.target.value)}>
                      <option value="">General course deadline</option>
                      {assignments.map((assignment) => (
                        <option key={assignment.id} value={assignment.id}>{assignment.name}</option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <label>
                    <span>Assignment due</span>
                    <Select value="" disabled>
                      <option>No assignments in this course yet</option>
                    </Select>
                  </label>
                )
              )}
              <label>
                <span>Date & time</span>
                <Input type="datetime-local" value={formDueAt} onChange={(event) => setFormDueAt(event.target.value)} required />
              </label>
              <label>
                <span>Description</span>
                <Textarea value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder="Optional details for students" rows={4} />
              </label>
              <div className="calendar-form-actions">
                <Button type="submit" variant="primary" size="sm" disabled={savingItem}>
                  {savingItem ? 'Saving…' : editingItemId ? 'Save changes' : 'Add item'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={closeEditor} disabled={savingItem}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

type ImportedStudentCredential = User & { temporaryPassword?: string; studentId?: string | null; email?: string | null }

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
  const [importedCredentials, setImportedCredentials] = useState<ImportedStudentCredential[]>([])
  const [tab, setTab] = useState<CourseCalendarTab>('calendar')
  const [courseMembers, setCourseMembers] = useState<Member[] | null>(null)
  const [membersRefreshKey, setMembersRefreshKey] = useState(0)
  const assignmentCount = assignments?.length ?? 0

  useEffect(() => {
    setTab('calendar')
    setImportedCredentials([])
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
      const result = await api<{ importedStudents: number; students: ImportedStudentCredential[] }>(`/courses/${course.id}/import-students`, {
        method: 'POST',
        body: JSON.stringify({ professorId, csv }),
      })
      const credentials = result.students.filter((student) => student.temporaryPassword)
      setImportedCredentials(credentials)
      setMembersRefreshKey((value) => value + 1)
      toast.success(credentials.length > 0
        ? `Imported ${result.importedStudents} students. ${credentials.length} temporary passwords generated.`
        : `Imported ${result.importedStudents} students`)
      setTab('students')
    } catch (err) {
      showError(err, 'Could not import student CSV')
    } finally {
      setImportingCsv(false)
    }
  }

  return (
    <>
      <div className="detail-header compact course-hero">
        <div className="detail-title-row">
          <div className="title-block">
            {role === 'professor' && course.joinCode && (
              <Badge variant="accent" className="course-tag" title={course.joinCode}>
                <BookOpen size={11} /> Join code {course.joinCode}
              </Badge>
            )}
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
            <Tabs aria-label="Course detail tabs">
              <TabsList>
                <TabsTrigger active={tab === 'calendar'} onClick={() => setTab('calendar')}>
                  <CalendarDays size={13} /> Calendar
                </TabsTrigger>
                <TabsTrigger active={tab === 'assignments'} onClick={() => setTab('assignments')}>
                  <ClipboardList size={13} /> Assignments
                </TabsTrigger>
                {role === 'professor' && (
                  <TabsTrigger active={tab === 'students'} onClick={() => setTab('students')}>
                    <Users size={13} /> Students
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            {role === 'professor' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importStudents}
                  style={{ display: 'none' }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importingCsv}
                >
                  {importingCsv ? 'Importing…' : 'Import CSV'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => window.open('/students.example.csv', '_blank', 'noopener,noreferrer')}>
                  Example CSV
                </Button>
                {course.joinCode && <CopyChip label="Join code" value={course.joinCode} accent />}
              </>
            )}
          </div>
        </div>
      </div>
      {role === 'professor' && tab === 'students' ? (
        <CourseStudentsView courseMembers={courseMembers} importedCredentials={importedCredentials} />
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
        <div className="tab-body course-resource-panel">
          {assignments === undefined ? (
            <>
              <div className="skeleton-row" />
              <div className="skeleton-row" style={{ width: '76%' }} />
              <div className="skeleton-row" style={{ width: '88%' }} />
            </>
          ) : assignments.length === 0 ? (
            <CardContent className="detail-empty compact-empty">
              <EmptyState
                icon={<ClipboardList size={24} />}
                title="No assignments yet"
                description={role === 'professor' ? 'Create an assignment from the sidebar to get started.' : 'No assignments have been posted in this course yet.'}
              />
              {role === 'professor' && professorId && (
                <div className="empty-action">
                  <CreateAssignmentForm professorId={professorId} courseId={course.id} onCreated={onAssignmentCreated} />
                </div>
              )}
            </CardContent>
          ) : (
            <div className="resource-grid">
              {assignments.map((assignment) => {
                const groupCount = groupsByAssignment[assignment.id]?.length ?? 0
                return (
                  <button
                    key={assignment.id}
                    className="resource-card assignment-card"
                    onClick={() => onSelectAssignment(assignment)}
                  >
                    <span className="resource-card-icon"><ClipboardList size={15} /></span>
                    <span className="resource-card-main">
                      <strong>{assignment.name}</strong>
                      <small>{groupCount} {groupCount === 1 ? 'group' : 'groups'}</small>
                    </span>
                    {assignment.dueDate && (
                      <Badge variant="muted" className="resource-card-date">
                        <CalendarDays size={12} /> {formatCalendarDateTime(assignment.dueDate)}
                      </Badge>
                    )}
                    <ArrowUpRight size={14} className="resource-card-arrow" />
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
function CourseStudentsView({ courseMembers, importedCredentials }: { courseMembers: Member[] | null; importedCredentials: ImportedStudentCredential[] }) {
  const credentialsPanel = importedCredentials.length > 0 && (
    <section className="student-temp-passwords">
      <div className="student-temp-passwords-head">
        <div>
          <h3>Student usernames and temporary passwords</h3>
          <p>Share these once. The username and starting password are the same.</p>
        </div>
        <Badge variant="accent">{importedCredentials.length}</Badge>
      </div>
      <div className="student-temp-password-list">
        {importedCredentials.map((student) => (
          <div key={student.id} className="student-temp-password-row">
            <span>{student.displayName}</span>
            <code>{student.temporaryPassword}</code>
          </div>
        ))}
      </div>
    </section>
  )

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
      <CardContent className="detail-empty students-empty-with-credentials">
        <EmptyState
          icon={<Users size={24} />}
          title="No students in this course"
          description="Students will appear here after they join the course or you import a CSV."
        />
        {credentialsPanel}
      </CardContent>
    )
  }

  return (
    <div className="students-panel">
      {credentialsPanel}
      <section className="student-section">
        <div className="student-section-header">
          <div>
            <h3>Course students</h3>
            <p>{courseMembers.length} enrolled {courseMembers.length === 1 ? 'student' : 'students'}</p>
          </div>
          <Badge variant="muted">{courseMembers.length}</Badge>
        </div>
        <div className="student-list compact">
          {courseMembers.map((student) => (
            <div className="student-row" key={student.userId}>
              <Avatar className="student-avatar" fallback={initials(student.username ?? student.displayName)} style={studentAvatarStyle(student)} />
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
  const groupCsvInputRef = useRef<HTMLInputElement | null>(null)
  const [importingGroups, setImportingGroups] = useState(false)

  const importGroups = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !professorId) return

    try {
      setImportingGroups(true)
      const csv = await file.text()
      const result = await api<{ importedGroups: number }>(`/assignments/${assignment.id}/import-groups`, {
        method: 'POST',
        body: JSON.stringify({ professorId, csv }),
      })
      toast.success(`Imported ${result.importedGroups} ${result.importedGroups === 1 ? 'group' : 'groups'}`)
      onGroupCreated()
    } catch (err) {
      showError(err, 'Could not import group CSV')
    } finally {
      setImportingGroups(false)
    }
  }

  return (
    <>
      <div className="detail-header compact course-hero">
        <div className="detail-title-row">
          <div className="title-block">
            <Badge variant="accent" className="course-tag" title={course.name}><BookOpen size={11} /> {course.name}</Badge>
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
          {role === 'professor' && professorId && (
            <div className="detail-actions">
              <input
                ref={groupCsvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={importGroups}
                style={{ display: 'none' }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => groupCsvInputRef.current?.click()}
                disabled={importingGroups}
              >
                {importingGroups ? 'Importing…' : 'Import Groups CSV'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => window.open('/groups.example.csv', '_blank', 'noopener,noreferrer')}>
                Example CSV
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="tab-body course-resource-panel">
        {groups.length === 0 ? (
          <CardContent className="detail-empty compact-empty">
            <EmptyState
              icon={<Users size={24} />}
              title="No groups yet"
              description={role === 'professor' ? 'Create a group for this assignment from the sidebar or import a group CSV.' : 'You have not joined a group for this assignment yet.'}
            />
            {role === 'professor' && professorId && (
              <div className="empty-action">
                <CreateGroupForm professorId={professorId} assignmentId={assignment.id} onCreated={onGroupCreated} />
              </div>
            )}
          </CardContent>
        ) : (
          <div className="resource-grid">
            {groups.map((g) => (
              <button
                key={g.id}
                className="resource-card group-resource-card"
                onClick={() => onSelectGroup(g)}
              >
                <span className="resource-card-icon"><Users size={15} /></span>
                <span className="resource-card-main">
                  <strong>{g.name}</strong>
                  <small>Open group dashboard, files, and history</small>
                </span>
                <ArrowUpRight size={14} className="resource-card-arrow" />
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
      <Button className={`copy-btn ${copied ? 'copied' : ''}`} variant="ghost" size="sm" onClick={copy} title="Copy">
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </Button>
    </span>
  )
}


export default App

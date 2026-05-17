import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import {
  BookOpen, Users, ChevronRight, Plus, Search, LogOut, Copy, Check,
  FileText, GitCommit, FileCode, PanelLeftClose, PanelLeft,
  Settings, KeyRound, GraduationCap, UserRound, Inbox, AlertCircle,
  ClipboardList, CalendarDays,
} from 'lucide-react'
import './App.css'
import { api, getApiBase } from './api'
import { initials, relativeTime } from './format'
import { detectLanguage, highlight } from './highlight'
import type { Assignment, Course, Group, HistoryEntry, Member, Professor, Role, Session, User, WorkspaceFile } from './types'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
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
            : <Dashboard role="student" user={session.user} />
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
      if (role === 'student') {
        const user = await api<User>(`/auth/student/${mode}`, { method: 'POST', body: JSON.stringify({ username, password, displayName }) })
        onLogin({ role: 'student', user })
      } else {
        const professor = await api<Professor>(`/auth/professor/${mode}`, { method: 'POST', body: JSON.stringify({ username, password, displayName }) })
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
          <p>{mode === 'login' ? 'Welcome back. Sign in to continue.' : 'Create your account to get started.'}</p>
        </div>

        <div className="segmented">
          <button type="button" className={role === 'professor' ? 'active' : ''} onClick={() => setRole('professor')}>
            <GraduationCap size={14} /> Professor
          </button>
          <button type="button" className={role === 'student' ? 'active' : ''} onClick={() => setRole('student')}>
            <UserRound size={14} /> Student
          </button>
        </div>

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
  | { role: 'student'; user: User }

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
  const searchRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className={`dashboard ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <span className="sidebar-title">{props.role === 'professor' ? 'My Courses' : 'Enrolled Courses'}</span>
            <button className="btn-icon" title="Collapse sidebar" onClick={() => setCollapsed(true)}>
              <PanelLeftClose size={14} />
            </button>
          </div>
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
          <div className="sidebar-body">
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
          </div>
          <div className="sidebar-footer">
            <div className="user-info">
              <div className="avatar">{initials(userDisplayName)}</div>
              <span className="name">{userDisplayName}</span>
            </div>
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
          <GroupDetail key={selectedGroup.id} course={selectedCourse} assignment={selectedAssignment} group={selectedGroup} />
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
            assignments={assignmentsByCourse[selectedCourse.id] ?? []}
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
  const [open, setOpen] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await api<Assignment>('/assignments', { method: 'POST', body: JSON.stringify({ professorId, courseId, name: name.trim() }) })
      setName('')
      setOpen(false)
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
    <form onSubmit={submit} className="inline-create">
      <input placeholder="Assignment name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <button type="submit" className="btn btn-sm btn-primary">Add</button>
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

function CourseDetail({
  course, role, assignments, groupsByAssignment, onSelectAssignment, onAssignmentCreated, professorId,
}: {
  course: Course
  role: Role
  assignments: Assignment[]
  groupsByAssignment: Record<string, Group[]>
  onSelectAssignment: (assignment: Assignment) => void
  onAssignmentCreated: () => void
  professorId?: string
}) {
  return (
    <>
      <div className="detail-header compact">
        <div className="detail-title-row">
          <div className="title-block">
            <h2>{course.name}</h2>
            <span className="meta-inline">
              <ClipboardList size={11} /> {assignments.length} {assignments.length === 1 ? 'assignment' : 'assignments'}
            </span>
          </div>
          {role === 'professor' && <CopyChip label="Join code" value={course.joinCode} accent />}
        </div>
      </div>
      <div style={{ overflow: 'auto', padding: 20 }}>
        {assignments.length === 0 ? (
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
            {assignments.map((assignment) => (
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
                  {(groupsByAssignment[assignment.id]?.length ?? 0)} {(groupsByAssignment[assignment.id]?.length ?? 0) === 1 ? 'group' : 'groups'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
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
                  <CalendarDays size={11} /> {assignment.dueDate}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
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
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>Open to view files & history</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ============ Group detail (files + history) ============ */

function GroupDetail({ course, assignment, group }: { course: Course; assignment: Assignment; group: Group }) {
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null)
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null)
  const [content, setContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [tab, setTab] = useState<'files' | 'history'>('files')
  const [filesCollapsed, setFilesCollapsed] = useState(false)

  const openFile = useCallback(async (file: WorkspaceFile) => {
    setActiveFile(file)
    setLoadingContent(true)
    try {
      const result = await api<{ content: string }>(`/groups/${group.id}/files/content?path=${encodeURIComponent(file.path)}`)
      setContent(result.content)
    } catch (err) {
      showError(err)
      setContent('')
    } finally {
      setLoadingContent(false)
    }
  }, [group.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles(null); setHistory(null); setActiveFile(null); setContent('')
    api<WorkspaceFile[]>(`/groups/${group.id}/files`).then((fs) => {
      setFiles(fs)
      if (fs.length > 0) openFile(fs[0])
    }).catch((e) => { showError(e); setFiles([]) })
    api<HistoryEntry[]>(`/groups/${group.id}/history`).then(setHistory).catch(() => setHistory([]))
    api<Member[]>(`/groups/${group.id}/members`).then(setMembers).catch(() => setMembers([]))
  }, [group.id, openFile])

  const lastCommit = history && history.length > 0 ? history[0] : null

  return (
    <>
      <div className="detail-header compact">
        <div className="detail-title-row">
          <div className="title-block">
            <span className="course-tag" title={course.name}><BookOpen size={11} /> {course.name}</span>
            <span className="course-tag" title={assignment.name}><ClipboardList size={11} /> {assignment.name}</span>
            <h2>{group.name}</h2>
            <span className="meta-inline">
              <Users size={11} /> {members.length}
              {lastCommit && (
                <>
                  <span className="dot-sep" />
                  <GitCommit size={11} /> {relativeTime(lastCommit.when)}
                </>
              )}
            </span>
          </div>
          {group.cloneUrl && <CloneUrlButton url={group.cloneUrl} />}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        <div className="tabs">
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
            <FileText size={13} /> Files
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <GitCommit size={13} /> History
            {history && history.length > 0 && (
              <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted)' }}>{history.length}</span>
            )}
          </button>
        </div>

        <div className="tab-body">
          {tab === 'files' ? (
            <div className={`file-layout ${filesCollapsed ? 'files-collapsed' : ''}`}>
              <div className="file-list-pane">
                <button
                  className="file-collapse-button"
                  onClick={() => setFilesCollapsed((collapsed) => !collapsed)}
                  title={filesCollapsed ? 'Show files' : 'Collapse files'}
                  aria-label={filesCollapsed ? 'Show files' : 'Collapse files'}
                >
                  {filesCollapsed ? <FileText size={15} /> : <PanelLeftClose size={15} />}
                </button>
                <div className="file-list">
                  {files === null ? (
                    <>
                      <div className="skeleton-row" />
                      <div className="skeleton-row" style={{ width: '60%' }} />
                      <div className="skeleton-row" style={{ width: '80%' }} />
                    </>
                  ) : files.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
                      No files yet.
                    </div>
                  ) : (
                    files.map((file) => (
                      <button
                        key={file.path}
                        className={`file-row ${activeFile?.path === file.path ? 'active' : ''}`}
                        onClick={() => openFile(file)}
                        title={file.path}
                      >
                        <FileIcon name={file.name} active={activeFile?.path === file.path} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <CodePane file={activeFile} content={content} loading={loadingContent} />
            </div>
          ) : (
            <HistoryView entries={history} />
          )}
        </div>
      </div>
    </>
  )
}

function FileIcon({ name, active }: { name: string; active: boolean }) {
  const isCode = /\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|cs|rb|php|html|css|json|yaml|yml|sh|md)$/i.test(name)
  const Icon = active ? (isCode ? FileCode : FileText) : (isCode ? FileCode : FileText)
  return <Icon size={12} className="icon" />
}

/* ============ Code pane ============ */

function CodePane({ file, content, loading }: { file: WorkspaceFile | null; content: string; loading: boolean }) {
  const [html, setHtml] = useState<string>('')
  const lang = file ? detectLanguage(file.name) : 'plaintext'
  const isBinary = content.startsWith('Binary file') || content === 'File is too large to preview.'
  const lineCount = content ? content.split('\n').length : 0

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file || !content || isBinary) { setHtml(''); return }
    highlight(content, lang).then((h) => { if (!cancelled) setHtml(h) }).catch(() => { if (!cancelled) setHtml('') })
    return () => { cancelled = true }
  }, [file, content, lang, isBinary])

  if (!file) {
    return (
      <div className="code-pane">
        <div className="code-header"><span className="file-info"><FileText size={13} /> <span style={{ color: 'var(--muted)' }}>No file selected</span></span></div>
        <div className="code-empty">
          <div className="icon-circle"><FileCode size={20} /></div>
          <div>Select a file from the list to preview it.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="code-pane">
      <div className="code-header">
        <div className="file-info">
          <FileCode size={13} className="icon" />
          <span className="name">{file.name}</span>
          <span className="meta">· {file.path}</span>
        </div>
        <div className="meta">
          {!isBinary && lineCount > 0 && <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>}
          <span className="lang-badge">{lang}</span>
          <CopyButton text={content} disabled={isBinary || !content} />
        </div>
      </div>
      <div className={`code-body ${isBinary ? '' : 'with-gutter'}`}>
        {loading ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>Loading…</div>
        ) : isBinary || !content ? (
          <div className="code-empty">
            <div className="icon-circle"><FileText size={20} /></div>
            <div>{isBinary ? content : 'Empty file.'}</div>
          </div>
        ) : html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre style={{ margin: 0, padding: 14 }}><code>{content}</code></pre>
        )}
      </div>
    </div>
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

function CloneUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Clone URL copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button className={`clone-url ${copied ? 'copied' : ''}`} onClick={copy} title={url}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Clone URL'}</span>
    </button>
  )
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy} disabled={disabled} title="Copy contents">
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ============ History ============ */

function HistoryView({ entries }: { entries: HistoryEntry[] | null }) {
  if (entries === null) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="detail-empty">
        <div className="icon-circle"><GitCommit size={22} /></div>
        <h3>No commits yet</h3>
        <p>Commits will appear here once team members push to the repository.</p>
      </div>
    )
  }
  return (
    <div className="history-list">
      {entries.map((entry) => (
        <div className="history-row" key={entry.hash} title={entry.message}>
          <span className="commit-dot" />
          <span className="message">{entry.message}</span>
          <span className="hash">{entry.hash.slice(0, 7)}</span>
          <span className="meta-line">
            {entry.pushedBy && <span>Pushed by: {entry.pushedBy}</span>}
            {entry.pushedBy && <span>·</span>}
            <span className="when" title={entry.when}>{relativeTime(entry.when)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export default App

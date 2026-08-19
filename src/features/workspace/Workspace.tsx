import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, CalendarClock, Check, ChevronDown, ChevronRight, CircleHelp, Eye, GitBranch, GraduationCap, Home, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Trash2, Trophy, Upload, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { initials } from '../../format'
import type { Assignment, AssignmentActivityDashboard, Course, CourseMembershipSuggestion, Member, ProfessorGithubConnection, Repository, RepositoryActivityDashboard, Session } from '../../types'
import { Avatar, Badge, Button, Input, Select } from '../../components/ui'
import { Field, Modal, PageState } from '../../components/system'
import { HomeDashboard } from '../../components/dashboard/HomeDashboard'
import { DocumentationSidebar, HelpDocs } from '../help/HelpDocs'
import { Insights } from './Insights'
import { useWorkspace } from './useWorkspace'
import { CourseCalendar } from '../calendar/CourseCalendar'
import { ImportRepositories } from '../repositories/ImportRepositories'
import { useAsync, type AsyncState } from '../../lib/useAsync'

type Selection = { type: 'home' } | { type: 'help' } | { type: 'course'; course: Course } | { type: 'assignment'; course: Course; assignment: Assignment } | { type: 'repository'; course: Course; assignment: Assignment; repository: Repository }
type CreateKind = 'course' | 'join' | 'assignment' | 'repository' | null
const SIDEBAR_COLLAPSED_KEY = 'miyagi.sidebar-collapsed'

export function Workspace({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const data = useWorkspace(session)
  const location = useLocation()
  const routeTo = useNavigate()
  const [selection, setSelection] = useState<Selection>({ type: 'home' })
  const [query, setQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const [create, setCreate] = useState<CreateKind>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [github, setGithub] = useState<ProfessorGithubConnection | null>(null)
  const [courseSuggestions, setCourseSuggestions] = useState<CourseMembershipSuggestion[]>([])
  const [suggestionBusy, setSuggestionBusy] = useState(false)
  const [studentPreview, setStudentPreview] = useState(false)
  const [docsSection, setDocsSection] = useState('introduction')
  const searchRef = useRef<HTMLInputElement>(null)
  const displayName = session.role === 'professor' ? session.displayName : session.user.displayName
  const viewRole = session.role === 'professor' && studentPreview ? 'student' : session.role
  const canManage = session.role === 'professor' && !studentPreview

  useEffect(() => {
    if (session.role !== 'professor') return
    api<ProfessorGithubConnection>(`/professors/${session.professor.id}/github`).then(setGithub).catch(() => setGithub({ connected: false, githubUsername: null }))
  }, [session])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); searchRef.current?.focus() } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [])
  useEffect(() => {
    if (session.role !== 'student') return
    api<CourseMembershipSuggestion[]>(`/users/${session.user.id}/course-suggestions`).then(setCourseSuggestions).catch(() => undefined)
  }, [session])
  useEffect(() => {
    const parts = location.pathname.split('/').filter(Boolean).map(decodePathPart)
    if (parts.length === 0) { setSelection({ type: 'home' }); return }
    if (parts[0] === 'help') {
      const section = parts[1] || 'introduction'
      setDocsSection(section)
      setSelection({ type: 'help' })
      return
    }
    if (parts.length !== 2) { routeTo('/', { replace: true }); return }
    if (!data.courses) return

    if (parts[0] === 'course') {
      const course = findByRouteId(data.courses, parts[1])
      if (course) setSelection({ type: 'course', course })
      else routeTo('/', { replace: true })
      return
    }

    const assignmentsReady = data.courses.every((course) => data.assignments[course.id])
    if (!assignmentsReady) return
    const assignmentEntries = data.courses.flatMap((course) => (data.assignments[course.id] ?? []).map((assignment) => ({ course, assignment })))
    if (parts[0] === 'assignment') {
      const entry = findByRouteId(assignmentEntries, parts[1], ({ assignment }) => assignment.id)
      if (entry) setSelection({ type: 'assignment', ...entry })
      else routeTo('/', { replace: true })
      return
    }

    if (parts[0] === 'project') {
      if (assignmentEntries.some(({ assignment }) => !data.repositories[assignment.id])) return
      const repositoryEntries = assignmentEntries.flatMap(({ course, assignment }) => (data.repositories[assignment.id] ?? []).map((repository) => ({ course, assignment, repository })))
      const entry = findByRouteId(repositoryEntries, parts[1], ({ repository }) => repository.id)
      if (entry) setSelection({ type: 'repository', ...entry })
      else routeTo('/', { replace: true })
      return
    }

    routeTo('/', { replace: true })
  }, [data.assignments, data.courses, data.repositories, location.pathname, routeTo])
  useEffect(() => {
    if (session.role !== 'student' || selection.type !== 'assignment') return
    const repositories = data.repositories[selection.assignment.id]
    if (!repositories?.length) return
    const repository = [...repositories].sort((a, b) => repositoryDisplayName(a).localeCompare(repositoryDisplayName(b)))[0]
    const next: Selection = { type: 'repository', course: selection.course, assignment: selection.assignment, repository }
    setSelection(next)
    routeTo(selectionPath(next), { replace: true })
  }, [data.repositories, routeTo, selection, session.role])

  async function respondToSuggestion(answer: 'accept' | 'reject') {
    if (session.role !== 'student' || !courseSuggestions[0]) return
    setSuggestionBusy(true)
    try {
      await api(`/course-suggestions/${courseSuggestions[0].id}/${answer}`, { method: 'POST' })
      setCourseSuggestions((current) => current.slice(1))
      if (answer === 'accept') { await data.refreshCourses(); toast.success('Course joined') }
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Could not update course') }
    finally { setSuggestionBusy(false) }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return data.courses ?? []
    return (data.courses ?? []).filter((course) => course.name.toLowerCase().includes(normalized) || (data.assignments[course.id] ?? []).some((assignment) => assignment.name.toLowerCase().includes(normalized)))
  }, [data.assignments, data.courses, query])

  function navigate(next: Selection) {
    setSelection(next)
    routeTo(selectionPath(next))
    setMobileOpen(false)
  }
  function setSidebar(next: boolean) {
    setSidebarCollapsed(next)
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* Preferences can remain session-only. */ }
  }
  const changeDocsSection = useCallback((section: string) => {
    setDocsSection(section)
    routeTo(`/help/${encodeURIComponent(section)}`, { replace: true })
  }, [routeTo])
  const sidebarHidden = sidebarCollapsed && selection.type !== 'help'
  return <div className={`l-app ${sidebarHidden ? 'sidebar-collapsed' : ''}`}>
    {selection.type === 'help' ? <DocumentationSidebar role={viewRole} activeSection={docsSection} mobileOpen={mobileOpen} onBack={() => navigate({ type: 'home' })} onClose={() => setMobileOpen(false)} onSectionChange={changeDocsSection} /> : <aside className={`l-sidebar ${mobileOpen ? 'open' : ''}`}>
      <header><button className="l-brand" onClick={() => navigate({ type: 'home' })}><strong>miyagi</strong></button><div><Button className="l-sidebar-collapse" variant="ghost" size="icon" onClick={() => setSidebar(true)} aria-label="Collapse sidebar" title="Collapse sidebar"><PanelLeftClose /></Button><Button className="l-mobile-close" variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></Button></div></header>
      <div className="l-search"><Search /><Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search courses and assignments" /><kbd>⌘K</kbd></div>
      <nav aria-label="Workspace navigation">
        <button className={selection.type === 'home' ? 'active' : ''} onClick={() => navigate({ type: 'home' })}><Home /><span>Overview</span></button>
        <div className="l-nav-label"><span>Courses</span>{viewRole === 'student' && session.role === 'student' ? <Button variant="ghost" size="icon" aria-label="Join course" onClick={() => setCreate('join')}><Plus /></Button> : canManage ? <Button variant="ghost" size="icon" aria-label="Create course" onClick={() => setCreate('course')}><Plus /></Button> : null}</div>
        <PageState loading={data.courses === null} error={data.error} onRetry={data.refreshCourses} empty={filtered.length === 0}>
          {filtered.map((course) => <CourseNav key={course.id} course={course} assignments={data.assignments[course.id]} selection={selection} canManage={canManage} onNavigate={navigate} onAddAssignment={() => { navigate({ type: 'course', course }); setCreate('assignment') }} />)}
        </PageState>
      </nav>
      <div className="l-sidebar-help">
        <button onClick={() => navigate({ type: 'help' })}><CircleHelp /><span>Help & guides</span></button>
      </div>
      <footer><button aria-label="Open account settings" onClick={() => { setSettingsOpen(true); setMobileOpen(false) }}><Avatar fallback={initials(displayName)} /><span><strong>{displayName}</strong><small>{session.role === 'professor' ? github?.githubUsername ?? session.professor.user?.githubUsername ?? 'Professor' : session.user.githubUsername ?? 'Student'}</small></span><span className={`l-role-dot ${viewRole}`}>{viewRole === 'professor' ? 'Professor' : 'Student'}</span><Settings /></button></footer>
    </aside>}
    {mobileOpen && <button className="l-sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <main className="l-main">
      <header className="l-topbar"><div className="l-topbar-location"><Button className="l-mobile-menu" variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></Button>{sidebarHidden && <Button className="l-sidebar-expand" variant="ghost" size="icon" onClick={() => setSidebar(false)} aria-label="Expand sidebar" title="Expand sidebar"><PanelLeftOpen /></Button>}<Breadcrumbs selection={selection} onNavigate={navigate} /></div><div><span className={`l-role-badge ${viewRole}`}>{viewRole === 'professor' ? <GraduationCap /> : <Users />}{studentPreview ? 'Student preview' : viewRole === 'professor' ? 'Professor' : 'Student'}</span><button className={`l-icon-link ${selection.type === 'help' ? 'active' : ''}`} onClick={() => navigate({ type: 'help' })} aria-label="Open help and guides"><CircleHelp /></button><Button variant="ghost" onClick={onLogout}><LogOut /> Sign out</Button></div></header>
      <div className={`l-content ${selection.type === 'help' ? 'l-content-docs' : ''}`}>
        {selection.type === 'home' && <HomeDashboard role={viewRole} courses={data.courses} assignmentsByCourse={data.assignments} repositoriesByAssignment={data.repositories} githubConnected={viewRole === 'student' || github?.connected === true} onSelectCourse={(course) => navigate({ type: 'course', course })} onSelectAssignment={(course, assignment) => navigate({ type: 'assignment', course, assignment })} onOpenGuide={() => navigate({ type: 'help' })} />}
        {selection.type === 'help' && <HelpDocs role={viewRole} activeSection={docsSection} onSectionChange={changeDocsSection} />}
        {selection.type === 'course' && <CourseView session={session} canManage={canManage} course={selection.course} assignments={data.assignments[selection.course.id]} onOpen={(assignment) => navigate({ type: 'assignment', course: selection.course, assignment })} onOpenRepository={(assignment, repository) => navigate({ type: 'repository', course: selection.course, assignment, repository })} onCreate={() => setCreate('assignment')} />}
        {selection.type === 'assignment' && <AssignmentView session={session} canManage={canManage} assignment={selection.assignment} repositories={data.repositories[selection.assignment.id]} onOpen={(repository) => navigate({ ...selection, type: 'repository', repository })} onCreate={() => setCreate('repository')} onImported={() => data.loadRepositories(selection.assignment.id, true).then(() => undefined)} />}
        {selection.type === 'repository' && <RepositoryView session={session} canManage={canManage} repository={selection.repository} repositories={data.repositories[selection.assignment.id] ?? []} onSelectRepository={(repository) => navigate({ ...selection, repository })} onDeleted={async () => { await data.loadRepositories(selection.assignment.id, true); navigate({ type: 'assignment', course: selection.course, assignment: selection.assignment }) }} />}
      </div>
    </main>
    {create && <CreateDialog kind={create} session={session} selection={selection} onClose={() => setCreate(null)} onDone={async () => { setCreate(null); if (create === 'course' || create === 'join') await data.refreshCourses(); else if (selection.type === 'course') await data.loadAssignments(selection.course.id, true); else if (selection.type === 'assignment') await data.loadRepositories(selection.assignment.id, true) }} />}
    {settingsOpen && <SettingsDialog session={session} github={github} studentPreview={studentPreview} onToggleStudentPreview={() => setStudentPreview((value) => !value)} onClose={() => setSettingsOpen(false)} onAccountDeleted={onLogout} />}
    {session.role === 'student' && courseSuggestions[0] && <Modal title="Is this your course?" description={`We found your GitHub activity in ${courseSuggestions[0].courseName}.`} onClose={() => undefined} actions={<><Button variant="secondary" disabled={suggestionBusy} onClick={() => respondToSuggestion('reject')}>Not my course</Button><Button variant="primary" disabled={suggestionBusy} onClick={() => respondToSuggestion('accept')}>{suggestionBusy ? 'Saving…' : 'Yes, join course'}</Button></>}><p className="l-confirm-copy">Commits from <strong>@{courseSuggestions[0].githubUsername}</strong> were found in a repository submitted for this course.</p></Modal>}
  </div>
}

function Breadcrumbs({ selection, onNavigate }: { selection: Selection; onNavigate: (selection: Selection) => void }) {
  if (selection.type === 'home') return <nav className="l-breadcrumb" aria-label="Breadcrumb"><span aria-current="page">Workspace</span></nav>
  if (selection.type === 'help') return <nav className="l-breadcrumb" aria-label="Breadcrumb"><button onClick={() => onNavigate({ type: 'home' })}>Workspace</button><ChevronRight /><span aria-current="page">Help</span></nav>
  const course = selection.course
  return <nav className="l-breadcrumb" aria-label="Breadcrumb">
    <button onClick={() => onNavigate({ type: 'home' })}>Courses</button><ChevronRight />
    {selection.type === 'course' ? <span aria-current="page">{course.name}</span> : <><button onClick={() => onNavigate({ type: 'course', course })}>{course.name}</button><ChevronRight />
      {selection.type === 'assignment' ? <span aria-current="page">{selection.assignment.name}</span> : <><button onClick={() => onNavigate({ type: 'assignment', course, assignment: selection.assignment })}>{selection.assignment.name}</button><ChevronRight /><span aria-current="page">{repositoryDisplayName(selection.repository)}</span></>}
    </>}
  </nav>
}

function SettingsDialog({ session, github, studentPreview, onToggleStudentPreview, onClose, onAccountDeleted }: { session: Session; github: ProfessorGithubConnection | null; studentPreview: boolean; onToggleStudentPreview: () => void; onClose: () => void; onAccountDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const githubUsername = session.role === 'professor'
    ? github?.githubUsername ?? session.professor.user?.githubUsername
    : session.user.githubUsername

  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault()
    if (session.role !== 'student' || !githubUsername) return
    setBusy(true); setError('')
    try {
      await api(`/users/${session.user.id}/account`, { method: 'DELETE', body: JSON.stringify({ confirmGithubUsername: confirmation }) })
      toast.success('Your account was deleted')
      onAccountDeleted()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete account'); setBusy(false) }
  }

  return <><Modal className="l-settings-modal" title="Settings" description="Your account and connections." onClose={onClose}>
    <div className="l-settings-section">
      {session.role === 'professor' && <><span className="l-settings-label">Viewing mode</span><div className="l-view-mode-card"><span className="l-connection-icon"><Eye /></span><span className="l-connection-copy"><strong>Student view</strong><small>Preview the workspace without professor controls.</small></span><Button variant={studentPreview ? 'primary' : 'secondary'} onClick={onToggleStudentPreview}>{studentPreview ? 'Exit student view' : 'View as student'}</Button></div></>}
      <span className="l-settings-label">Connections</span>
      <div className="l-connection-card">
        <span className="l-connection-icon"><GitBranch /></span>
        <span className="l-connection-copy"><strong>GitHub</strong><small>{githubUsername ? `@${githubUsername}` : 'Connected account'}</small></span>
        <Badge className="l-connected-badge" variant="success"><Check /> Connected</Badge>
      </div>
      <p className="l-settings-note">Used to sign in and access public course repositories. Miyagi does not request access to private repositories.</p>
      {session.role === 'student' && <div className="l-danger-zone"><span><strong>Delete account</strong><small>Remove your profile, course memberships, suggestions, and stored GitHub connection.</small></span><Button variant="danger" onClick={() => setDeleting(true)}><Trash2 /> Delete account</Button></div>}
    </div>
  </Modal>
  {deleting && githubUsername && <Modal title="Delete your account?" description="This action is permanent and cannot be undone." onClose={() => !busy && setDeleting(false)}><form className="l-form" onSubmit={deleteAccount}><p className="l-confirm-copy">Your Miyagi data and stored GitHub access token will be deleted. This does not delete your GitHub account or repositories.</p><Field label={`Type ${githubUsername} to confirm`} error={error}><Input autoFocus autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></Field><div className="l-form-actions"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>Cancel</Button><Button type="submit" variant="danger" disabled={busy || confirmation.trim().toLowerCase() !== githubUsername.toLowerCase()}>{busy ? 'Deleting…' : 'Delete account permanently'}</Button></div></form></Modal>}
  </>
}

function CourseNav({ course, assignments, selection, canManage, onNavigate, onAddAssignment }: { course: Course; assignments?: Assignment[]; selection: Selection; canManage: boolean; onNavigate: (selection: Selection) => void; onAddAssignment: () => void }) {
  const activeCourse = selection.type !== 'home' && selection.type !== 'help' && selection.course.id === course.id
  const [open, setOpen] = useState(activeCourse)
  return <div className="l-nav-tree"><button className={selection.type === 'course' && activeCourse ? 'active' : ''} onClick={() => { setOpen(true); onNavigate({ type: 'course', course }) }}><span className="l-tree-toggle" onClick={(event) => { event.stopPropagation(); setOpen(!open) }}>{open ? <ChevronDown /> : <ChevronRight />}</span><BookOpen /><span>{course.name}</span></button>{open && <div className="l-nav-children">{assignments?.map((assignment) => <button key={assignment.id} className={(selection.type === 'assignment' || selection.type === 'repository') && selection.assignment.id === assignment.id ? 'active' : ''} onClick={() => onNavigate({ type: 'assignment', course, assignment })}><CalendarClock /><span>{assignment.name}</span></button>)}{canManage && <button className="muted" onClick={onAddAssignment}><Plus /><span>New assignment</span></button>}</div>}</div>
}

function CourseView({ session, canManage, course, assignments, onOpen, onOpenRepository, onCreate }: { session: Session; canManage: boolean; course: Course; assignments?: Assignment[]; onOpen: (assignment: Assignment) => void; onOpenRepository: (assignment: Assignment, repository: Repository) => void; onCreate: () => void }) {
  const members = useAsyncMembers(course.id)
  const [tab, setTab] = useState<'overview' | 'calendar'>('overview')
  const [previewAssignment, setPreviewAssignment] = useState<Assignment | null>(null)
  const courseMeta = `${assignments ? countLabel(assignments.length, 'assignment') : 'Loading assignments…'} · ${members.loading ? 'Loading students…' : countLabel(members.data?.length ?? 0, 'student')}`
  return <div className="l-page"><header className="l-page-head"><div><h2>{course.name}</h2><p>{courseMeta}</p></div>{canManage && tab === 'overview' && <Button variant="primary" onClick={onCreate}><Plus /> New assignment</Button>}</header><div className="l-page-tabs" role="tablist" aria-label="Course views"><button role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}><BookOpen /> Overview</button><button role="tab" aria-selected={tab === 'calendar'} onClick={() => setTab('calendar')}><CalendarClock /> Calendar</button></div>{tab === 'calendar' ? <CourseCalendar session={session} readOnly={!canManage} course={course} assignments={assignments} /> : <div className="l-two-column" onMouseLeave={() => setPreviewAssignment(null)}><section><div className="l-section-head compact"><div><h3>Assignments</h3><p>Hover an assignment to preview its leaderboard.</p></div></div><PageState loading={!assignments} empty={assignments?.length === 0}>{assignments?.map((assignment) => <button className="l-list-row" key={assignment.id} onMouseEnter={() => setPreviewAssignment(assignment)} onFocus={() => setPreviewAssignment(assignment)} onClick={() => onOpen(assignment)}><span className="l-row-icon"><CalendarClock /></span><span><strong>{assignment.name}</strong><small>{assignment.dueDate ? `Due ${formatDate(assignment.dueDate)}` : 'No due date'}</small></span><ChevronRight /></button>)}</PageState></section><section className="l-course-side-panel">{previewAssignment ? <AssignmentLeaderboardPreview assignment={previewAssignment} canManage={canManage} onOpenRepository={(repository) => onOpenRepository(previewAssignment, repository)} /> : <><div className="l-section-head compact"><div><h3>People</h3><p>Current course members.</p></div></div><PageState loading={members.loading} error={members.error} onRetry={members.retry} empty={members.data?.length === 0}>{members.data?.slice(0, 8).map((member) => <div className="l-person" key={member.memberId}><Avatar fallback={initials(member.displayName)} /><span><strong>{member.displayName}</strong><small>{member.githubUsername ?? member.role} · Joined {relativeJoinDate(member.joinedAt)}</small></span></div>)}</PageState></>}</section></div>}</div>
}

function AssignmentLeaderboardPreview({ assignment, canManage, onOpenRepository }: { assignment: Assignment; canManage: boolean; onOpenRepository: (repository: Repository) => void }) {
  const state = useAsync(() => api<AssignmentActivityDashboard>(`/assignments/${assignment.id}/dashboard?period=weekly`), [assignment.id])
  const ranked = rankRepositories(state.data?.repositories ?? []).slice(0, 3)
  return <div className="l-assignment-preview"><div className="l-section-head compact"><div><h3>{assignment.name} leaderboard</h3><p>Top teams this week.</p></div><Trophy /></div><PageState loading={state.loading} error={state.error} onRetry={state.retry} empty={ranked.length === 0}><div className="l-mini-leaderboard">{ranked.map((item, index) => <button key={item.repository.id} className={`place-${index + 1}`} onClick={() => onOpenRepository(item.repository)} aria-label={`Open ${repositoryDisplayName(item.repository)} repository`}><span>{index + 1}</span><strong>{repositoryDisplayName(item.repository)}</strong><small>{commitLabel(item.totals.commits)}</small><ChevronRight /></button>)}</div></PageState>{canManage && ranked.length > 0 && <p className="l-preview-note">Select a team to open its repository.</p>}</div>
}

function AssignmentView({ session, canManage, assignment, repositories, onOpen, onCreate, onImported }: { session: Session; canManage: boolean; assignment: Assignment; repositories?: Repository[]; onOpen: (repository: Repository) => void; onCreate: () => void; onImported: () => Promise<void> }) {
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState<'repositories' | 'momentum'>('repositories')
  const dashboard = useAsync(() => api<AssignmentActivityDashboard>(`/assignments/${assignment.id}/dashboard?period=weekly`), [assignment.id])
  const professorId = session.role === 'professor' && canManage ? session.professor.id : null
  const summaries = new Map((dashboard.data?.repositories ?? []).map((item) => [item.repository.id, item]))
  const assignmentMeta = [assignment.dueDate ? `Due ${formatDate(assignment.dueDate)}` : 'No deadline', repositories ? countLabel(repositories.length, 'repository') : 'Loading repositories…', assignment.description].filter(Boolean).join(' · ')

  return <div className="l-page">
    <header className="l-page-head"><div><h2>{assignment.name}</h2><p>{assignmentMeta}</p></div>{professorId && <div className="l-actions"><Button variant="primary" onClick={() => setImporting(true)}><Upload /> Import repos</Button><Button variant="secondary" onClick={onCreate}><Plus /> Add one repo</Button></div>}</header>
    {session.role === 'student'
      ? <PageState loading={!repositories} empty={repositories?.length === 0}><div className="l-state" aria-live="polite">Opening project…</div></PageState>
      : <>{canManage && <div className="l-page-tabs" role="tablist" aria-label="Assignment views"><button role="tab" aria-selected={tab === 'repositories'} onClick={() => setTab('repositories')}><GitBranch /> Repositories <span>{repositories?.length ?? 0}</span></button><button role="tab" aria-selected={tab === 'momentum'} onClick={() => setTab('momentum')}><Trophy /> Leaderboard</button></div>}{!canManage || tab === 'repositories' ? <section><div className="l-section-head compact"><div><h3>{canManage ? 'Repositories' : 'Choose a student project'}</h3><p>{canManage ? 'Select a repository to inspect its activity and contributors.' : 'Select a project to preview the workspace as one of its contributors.'}</p></div></div><PageState loading={!repositories} empty={repositories?.length === 0}>{repositories?.map((repository) => <RepositorySummaryRow key={repository.id} repository={repository} summary={summaries.get(repository.id)} loading={dashboard.loading} onOpen={() => onOpen(repository)} />)}</PageState></section> : <TeamMomentum state={dashboard} showNeedsAttention onOpen={onOpen} />}</>}
    {importing && professorId && <ImportRepositories assignment={assignment} onClose={() => setImporting(false)} onImported={onImported} />}
  </div>
}

function RepositoryView({ session, canManage, repository, repositories, onSelectRepository, onDeleted }: { session: Session; canManage: boolean; repository: Repository; repositories: Repository[]; onSelectRepository: (repository: Repository) => void; onDeleted: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const professorId = session.role === 'professor' && canManage ? session.professor.id : undefined
  async function remove() { if (!professorId) return; await api(`/assignment-repositories/${repository.id}`, { method: 'DELETE' }); toast.success('Repository removed'); await onDeleted() }
  return <div className="l-page"><header className="l-page-head"><div><h2>{repositoryDisplayName(repository)}</h2><p>{repository.githubRepoUrl ?? 'Connected repository'}</p></div>{(repositories.length > 1 || professorId) && <div className="l-repository-actions">{repositories.length > 1 && <label className="l-repository-switcher"><span>View project</span><Select value={repository.id} onChange={(event) => { const selected = repositories.find((candidate) => candidate.id === event.target.value); if (selected) onSelectRepository(selected) }}>{[...repositories].sort((a, b) => repositoryDisplayName(a).localeCompare(repositoryDisplayName(b))).map((candidate) => <option key={candidate.id} value={candidate.id}>{repositoryDisplayName(candidate)}</option>)}</Select></label>}{professorId && <Button variant="danger" onClick={() => setConfirming(true)}>Remove</Button>}</div>}</header><Insights id={repository.id} />{confirming && <Modal title="Remove repository?" description="Miyagi will stop tracking this repository. The GitHub repository itself will not be deleted." onClose={() => setConfirming(false)} actions={<><Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Remove repository</Button></>}><p className="l-confirm-copy">This action removes its activity history from this assignment and cannot be undone.</p></Modal>}</div>
}

function RepositorySummaryRow({ repository, summary, loading, onOpen }: { repository: Repository; summary?: RepositoryActivityDashboard; loading: boolean; onOpen: () => void }) {
  const status = activityStatus(summary?.lastCommitAt)
  return <button className="l-list-row l-repository-row" onClick={onOpen}><span className="l-row-icon"><GitBranch /></span><span><strong>{repositoryDisplayName(repository)}</strong><small>{loading && !summary ? 'Loading contributors…' : contributorNames(summary?.members ?? [])}</small></span><span className="l-repository-meta"><span><Users /> {loading && !summary ? '…' : contributorLabel(summary?.members.length ?? 0)}</span><span className={`l-activity-age ${status.tone}`}><i />{status.label}</span></span><ChevronRight /></button>
}

function TeamMomentum({ state, showNeedsAttention, onOpen }: { state: AsyncState<AssignmentActivityDashboard> & { retry: () => void }; showNeedsAttention: boolean; onOpen: (repository: Repository) => void }) {
  const ranked = rankRepositories(state.data?.repositories ?? [])
  const topTeams = ranked.slice(0, 3).map((item, index) => ({ item, place: index + 1 }))
  const needsAttention = showNeedsAttention ? ranked.map((item, index) => ({ item, place: index + 1 })).filter(({ place }) => place > 3).slice(-5) : []
  return <section className="l-momentum"><header className="l-section-head"><div><span className="l-kicker">This week</span><h2>Team leaderboard</h2><p>{showNeedsAttention ? 'Top teams and groups that may benefit from support.' : 'The three most active teams this week.'}</p></div></header><PageState loading={state.loading} error={state.error} onRetry={state.retry} empty={ranked.length === 0}><div className="l-leaderboard-sections"><LeaderboardTable entries={topTeams} highlightTop onOpen={onOpen} />{showNeedsAttention && <section className="l-needs-attention"><div><h3>Needs attention</h3><p>Bottom five teams by commit activity this week.</p></div>{needsAttention.length > 0 ? <LeaderboardTable entries={needsAttention} onOpen={onOpen} /> : <div className="l-clear-attention"><Check /> No additional teams need attention.</div>}</section>}</div></PageState></section>
}

function LeaderboardTable({ entries, highlightTop = false, onOpen }: { entries: Array<{ item: RepositoryActivityDashboard; place: number }>; highlightTop?: boolean; onOpen: (repository: Repository) => void }) {
  return <div className="l-leaderboard"><div className="l-leaderboard-head" aria-hidden="true"><span>Rank</span><span>Team</span><span>Contributors</span><span>Commits</span><span>Last activity</span><span /></div>{entries.map(({ item, place }) => { const status = activityStatus(item.lastCommitAt); return <button key={item.repository.id} className={highlightTop && place <= 3 ? `place-${place}` : ''} onClick={() => onOpen(item.repository)} aria-label={`Rank ${place}, ${repositoryDisplayName(item.repository)}, ${commitLabel(item.totals.commits)}`}><span className="l-rank">{highlightTop && place <= 3 ? <Trophy /> : null}<strong>{place}</strong></span><span className="l-leaderboard-team"><span><GitBranch /></span><strong>{repositoryDisplayName(item.repository)}</strong></span><span className="l-leaderboard-stat"><small>Contributors</small><strong>{item.members.length}</strong></span><span className="l-leaderboard-stat"><small>Commits</small><strong>{item.totals.commits}</strong></span><span className={`l-activity-age ${status.tone}`}><i />{status.label}</span><ChevronRight /></button> })}</div>
}

function CreateDialog({ kind, session, selection, onClose, onDone }: { kind: Exclude<CreateKind, null>; session: Session; selection: Selection; onClose: () => void; onDone: () => Promise<void> }) {
  const [name, setName] = useState(''); const [due, setDue] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const titles = { course: 'Create course', join: 'Join course', assignment: 'Create assignment', repository: 'Add repository' }
  async function submit(event: React.FormEvent) { event.preventDefault(); const value = name.trim(); if (value.length < 2) { setError(kind === 'repository' ? 'Enter a complete GitHub repository URL.' : 'Enter at least 2 characters.'); return } setBusy(true); setError(''); try {
    if (kind === 'course' && session.role === 'professor') await api('/courses', { method: 'POST', body: JSON.stringify({ name: value }) })
    else if (kind === 'join' && session.role === 'student') await api('/courses/join', { method: 'POST', body: JSON.stringify({ joinCode: value.toUpperCase() }) })
    else if (kind === 'assignment' && session.role === 'professor' && selection.type === 'course') await api('/assignments', { method: 'POST', body: JSON.stringify({ courseId: selection.course.id, name: value, dueDate: due ? new Date(due).toISOString() : undefined }) })
    else if (kind === 'repository' && session.role === 'professor' && selection.type === 'assignment') { if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(value)) throw new Error('Use a URL like https://github.com/owner/repository'); await api('/assignment-repositories', { method: 'POST', body: JSON.stringify({ assignmentId: selection.assignment.id, githubRepoUrl: value }) }) }
    toast.success(`${titles[kind]} complete`); await onDone()
  } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save') } finally { setBusy(false) } }
  return <Modal title={titles[kind]} description={kind === 'repository' ? 'Connect a GitHub repository to this assignment.' : undefined} onClose={onClose}><form className="l-form" onSubmit={submit}><Field label={kind === 'course' ? 'Course name' : kind === 'join' ? 'Course code' : kind === 'assignment' ? 'Assignment name' : 'GitHub URL'} error={error}><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>{kind === 'assignment' && <Field label="Due date" hint="Optional"><Input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></Field>}<div className="l-form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></div></form></Modal>
}

function useAsyncMembers(courseId: string) {
  const [state, setState] = useState<{ data: Member[] | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null }); const [nonce, setNonce] = useState(0)
  useEffect(() => { let active = true; api<Member[]>(`/courses/${courseId}/members`).then((data) => active && setState({ data, loading: false, error: null })).catch((error: unknown) => active && setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Could not load people' })); return () => { active = false } }, [courseId, nonce])
  return { ...state, retry: () => { setState((current) => ({ ...current, loading: true })); setNonce((value) => value + 1) } }
}

function selectionPath(selection: Selection) {
  if (selection.type === 'home') return '/'
  if (selection.type === 'help') return '/help/introduction'
  if (selection.type === 'course') return `/course/${routeToken(selection.course.name, selection.course.id)}`
  if (selection.type === 'assignment') return `/assignment/${routeToken(selection.assignment.name, selection.assignment.id)}`
  return `/project/${routeToken(repositoryDisplayName(selection.repository), selection.repository.id)}`
}

function routeToken(name: string, id: string) {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item'
  return `${slug}-${id.slice(0, 8).toLowerCase()}`
}

function findByRouteId<T extends { id: string }>(items: T[], token: string): T | undefined
function findByRouteId<T>(items: T[], token: string, idOf: (item: T) => string): T | undefined
function findByRouteId<T>(items: T[], token: string, idOf: (item: T) => string = (item) => (item as { id: string }).id) {
  const prefix = token.slice(-8).toLowerCase()
  if (!/^[a-f0-9]{8}$/.test(prefix)) return undefined
  const matches = items.filter((item) => idOf(item).toLowerCase().startsWith(prefix))
  return matches.length === 1 ? matches[0] : undefined
}

function decodePathPart(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

function formatDate(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

function repositoryDisplayName(repository: Repository) {
  return repository.githubRepo || repository.name.split('/').filter(Boolean).at(-1) || repository.name
}

function countLabel(count: number, noun: string) { return `${count} ${noun}${count === 1 ? '' : 's'}` }
function contributorLabel(count: number) { return countLabel(count, 'contributor') }
function commitLabel(count: number) { return countLabel(count, 'commit') }
function contributorNames(people: RepositoryActivityDashboard['members']) {
  if (people.length === 0) return 'No contributors yet'
  return `by ${people.map((person) => person.githubUsername ?? person.username ?? person.displayName).join(', ')}`
}
function rankRepositories(repositories: RepositoryActivityDashboard[]) {
  return [...repositories].sort((a, b) => b.totals.commits - a.totals.commits || Date.parse(b.lastCommitAt ?? '') - Date.parse(a.lastCommitAt ?? ''))
}

function relativeJoinDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86_400_000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value))
}

function activityStatus(value: string | null | undefined): { tone: 'fresh' | 'steady' | 'stale'; label: string } {
  if (!value) return { tone: 'stale', label: 'No commits yet' }
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86_400_000))
  const label = days === 0 ? 'Committed today' : `${days} day${days === 1 ? '' : 's'} since last commit`
  if (days <= 2) return { tone: 'fresh', label }
  if (days <= 6) return { tone: 'steady', label }
  return { tone: 'stale', label }
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BookOpen, Users, ClipboardList, UserPlus, Copy, Check, BarChart3, GitBranch } from 'lucide-react'
import { studentAvatarStyle } from '../../avatar'
import { api } from '../../api'
import { initials, relativeTime } from '../../format'
import type { Assignment, Course, GithubRepository, GithubRepositoryAccess, GithubRepositoryAccessMember, Group, Member, Role, User, WorkItem } from '../../types'
import { PerformanceDashboard } from './PerformanceDashboard'
import { Avatar, Badge, Button, DialogShell, Input, Select, Tabs, TabsList, TabsTrigger } from '../ui'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
}

function studentDisplayLabel(student: Member) {
  const emailLocalPart = student.email?.split('@')[0]?.trim()
  return emailLocalPart || student.displayName
}

const INACTIVE_STUDENT_MS = 7 * 24 * 60 * 60 * 1000

function isInactiveStudent(student: Member) {
  return !student.lastSeenAt || Date.now() - new Date(student.lastSeenAt).getTime() > INACTIVE_STUDENT_MS
}

type GroupDetailTab = 'dashboard' | 'students' | 'group' | 'work'
type StudentRepositoryCreateResponse = {
  group: Group
  invited: string[]
  skipped: Array<{ userId: string; displayName: string; reason: string }>
}

function defaultRepositoryName(assignmentName: string, groupName: string) {
  return `${assignmentName}-${groupName}`.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}



export function GroupDetail({
  course,
  assignment,
  group,
  role,
  professorId,
  onSidebarContentChange,
  onGroupUpdated,
  studentUser,
}: {
  course: Course
  assignment: Assignment
  group: Group
  role: Role
  professorId?: string
  studentUser?: User
  onSidebarContentChange?: (content: ReactNode | null) => void
  onGroupUpdated?: (group: Group) => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [courseMembers, setCourseMembers] = useState<Member[] | null>(null)
  const [tab, setTab] = useState<GroupDetailTab>('dashboard')
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubRepoUrl, setGithubRepoUrl] = useState(group.githubRepoUrl ?? '')
  const [connectingGithub, setConnectingGithub] = useState(false)
  const [studentGithubDialogOpen, setStudentGithubDialogOpen] = useState(false)
  const [studentRepositories, setStudentRepositories] = useState<GithubRepository[] | null>(null)
  const [selectedRepositoryUrl, setSelectedRepositoryUrl] = useState(group.githubRepoUrl ?? '')
  const [loadingStudentRepositories, setLoadingStudentRepositories] = useState(false)
  const [connectingStudentGithub, setConnectingStudentGithub] = useState(false)
  const [newRepositoryName, setNewRepositoryName] = useState(defaultRepositoryName(assignment.name, group.name))
  const [creatingStudentRepository, setCreatingStudentRepository] = useState(false)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [workItems, setWorkItems] = useState<WorkItem[] | null>(null)
  const [workTitle, setWorkTitle] = useState('')
  const [workAssigneeId, setWorkAssigneeId] = useState('')
  const [savingWorkItem, setSavingWorkItem] = useState(false)
  const [repositoryAccess, setRepositoryAccess] = useState<GithubRepositoryAccess | null>(null)
  const isGithubConnected = group.repositoryProvider === 'github' && Boolean(group.githubRepoUrl)

  const refreshMembers = useCallback(() => {
    return api<Member[]>(`/groups/${group.id}/members`).then(setMembers).catch(() => setMembers([]))
  }, [group.id])


  const fetchLatestRepository = useCallback(async (notify = true) => {
    if (!isGithubConnected) return
    try {
      const updatedGroup = await api<Group>(`/groups/${group.id}/github/fetch`, { method: 'POST' })
      onGroupUpdated?.(updatedGroup)
      setDashboardRefreshKey((value) => value + 1)
      if (notify) toast.success('Repository updated')
    } catch (err) {
      if (notify) showError(err, 'Could not fetch latest repository changes')
    }
  }, [group.id, isGithubConnected, onGroupUpdated])

  const refreshWorkItems = useCallback(async () => {
    try {
      const actorQuery = role === 'professor' && professorId
        ? `professorId=${encodeURIComponent(professorId)}`
        : studentUser
          ? `userId=${encodeURIComponent(studentUser.id)}`
          : ''
      if (!actorQuery) {
        setWorkItems([])
        return
      }
      setWorkItems(await api<WorkItem[]>(`/groups/${group.id}/work-items?${actorQuery}`))
    } catch (err) {
      showError(err, 'Could not load work items')
      setWorkItems([])
    }
  }, [group.id, professorId, role, studentUser])

  const refreshRepositoryAccess = useCallback(async () => {
    if (!isGithubConnected) {
      setRepositoryAccess(null)
      return
    }
    try {
      setRepositoryAccess(await api<GithubRepositoryAccess>(`/groups/${group.id}/github/access`))
    } catch {
      setRepositoryAccess(null)
    }
  }, [group.id, isGithubConnected])

  useEffect(() => {
    if (tab === 'work') void refreshWorkItems()
  }, [refreshWorkItems, tab])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourseMembers(null)
    refreshMembers()
    if (role === 'professor') {
      api<Member[]>(`/courses/${course.id}/members`).then(setCourseMembers).catch(() => setCourseMembers([]))
    }
    if (isGithubConnected) {
      void fetchLatestRepository(false)
      void refreshRepositoryAccess()
    } else {
      setRepositoryAccess(null)
    }
  }, [course.id, fetchLatestRepository, group.id, isGithubConnected, refreshMembers, refreshRepositoryAccess, role])

  const assignedUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const availableStudents = useMemo(
    () => (courseMembers ?? []).filter((member) => !assignedUserIds.has(member.userId)),
    [assignedUserIds, courseMembers],
  )

  useEffect(() => {
    onSidebarContentChange?.(null)
    return () => onSidebarContentChange?.(null)
  }, [onSidebarContentChange])


  useEffect(() => {
    setGithubDialogOpen(false)
    setGithubRepoUrl(group.githubRepoUrl ?? '')
    setConnectingGithub(false)
    setSelectedRepositoryUrl(group.githubRepoUrl ?? '')
    setStudentRepositories(null)
    setStudentGithubDialogOpen(false)
    setConnectingStudentGithub(false)
    setNewRepositoryName(defaultRepositoryName(assignment.name, group.name))
    setCreatingStudentRepository(false)
  }, [group.githubRepoUrl, group.id])

  const connectGithub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!professorId) return
    const nextGithubRepoUrl = githubRepoUrl.trim()
    if (!nextGithubRepoUrl) return
    try {
      setConnectingGithub(true)
      const updatedGroup = await api<Group>(`/groups/${group.id}/github`, {
        method: 'PATCH',
        body: JSON.stringify({ professorId, githubRepoUrl: nextGithubRepoUrl }),
      })
      onGroupUpdated?.(updatedGroup)
      setDashboardRefreshKey((value) => value + 1)
      setGithubDialogOpen(false)
      setGithubRepoUrl(updatedGroup.githubRepoUrl ?? nextGithubRepoUrl)
      toast.success('GitHub repository connected.')
    } catch (err) {
      showError(err, 'Could not connect GitHub repository')
    } finally {
      setConnectingGithub(false)
    }
  }

  const openStudentGithubDialog = async () => {
    if (!studentUser) return
    setStudentGithubDialogOpen(true)
    setSelectedRepositoryUrl(group.githubRepoUrl ?? '')
    if (studentRepositories !== null) return
    try {
      setLoadingStudentRepositories(true)
      const repositories = await api<GithubRepository[]>(`/users/${studentUser.id}/github/repositories`)
      setStudentRepositories(repositories)
      if (!group.githubRepoUrl && repositories[0]) setSelectedRepositoryUrl(repositories[0].htmlUrl)
    } catch (err) {
      setStudentRepositories([])
      showError(err, 'Could not load GitHub repositories')
    } finally {
      setLoadingStudentRepositories(false)
    }
  }

  const connectStudentGithub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!studentUser) return
    const githubRepoUrl = selectedRepositoryUrl.trim()
    if (!githubRepoUrl) return
    try {
      setConnectingStudentGithub(true)
      const updatedGroup = await api<Group>(`/groups/${group.id}/github/student`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: studentUser.id, githubRepoUrl }),
      })
      onGroupUpdated?.(updatedGroup)
      setDashboardRefreshKey((value) => value + 1)
      setSelectedRepositoryUrl(updatedGroup.githubRepoUrl ?? githubRepoUrl)
      setStudentGithubDialogOpen(false)
      await refreshRepositoryAccess()
      toast.success('GitHub repository connected.')
    } catch (err) {
      showError(err, 'Could not connect GitHub repository')
    } finally {
      setConnectingStudentGithub(false)
    }
  }

  const createStudentGithubRepository = async () => {
    if (!studentUser) return
    const name = newRepositoryName.trim()
    if (!name) return
    try {
      setCreatingStudentRepository(true)
      const response = await api<StudentRepositoryCreateResponse>(`/groups/${group.id}/github/student/create`, {
        method: 'POST',
        body: JSON.stringify({ userId: studentUser.id, name, private: true }),
      })
      onGroupUpdated?.(response.group)
      setDashboardRefreshKey((value) => value + 1)
      setSelectedRepositoryUrl(response.group.githubRepoUrl ?? '')
      setStudentGithubDialogOpen(false)
      await refreshRepositoryAccess()
      const skippedCopy = response.skipped.length > 0 ? ` ${response.skipped.length} member${response.skipped.length === 1 ? '' : 's'} still need GitHub usernames.` : ''
      toast.success(`Repository created. Invited ${response.invited.length} group member${response.invited.length === 1 ? '' : 's'}.${skippedCopy}`)
    } catch (err) {
      showError(err, 'Could not create GitHub repository')
    } finally {
      setCreatingStudentRepository(false)
    }
  }

  const assignStudent = async (student: Member) => {
    if (!professorId) return
    setAssigningUserId(student.userId)
    try {
      await api<Member>(`/groups/${group.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ professorId, userId: student.userId }),
      })
      toast.success(`${studentDisplayLabel(student)} added to ${group.name}`)
      await refreshMembers()
    } catch (err) {
      showError(err, 'Could not add student')
    } finally {
      setAssigningUserId(null)
    }
  }

  const createWorkItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!studentUser || !workTitle.trim()) return
    try {
      setSavingWorkItem(true)
      await api<WorkItem>(`/groups/${group.id}/work-items`, {
        method: 'POST',
        body: JSON.stringify({ userId: studentUser.id, title: workTitle.trim(), assignedUserId: workAssigneeId || null }),
      })
      setWorkTitle('')
      setWorkAssigneeId('')
      toast.success('Work item added')
      await refreshWorkItems()
    } catch (err) {
      showError(err, 'Could not add work item')
    } finally {
      setSavingWorkItem(false)
    }
  }

  const updateWorkItemStatus = async (workItem: WorkItem, status: WorkItem['status']) => {
    if (!studentUser) return
    const completionComment = status === 'completed' ? window.prompt('Completion note for your group/professor?') ?? '' : undefined
    try {
      await api<WorkItem>(`/work-items/${workItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: studentUser.id, status, completionComment }),
      })
      toast.success('Work item updated')
      await refreshWorkItems()
    } catch (err) {
      showError(err, 'Could not update work item')
    }
  }

  const assignWorkItemToMe = async (workItem: WorkItem) => {
    if (!studentUser) return
    try {
      await api<WorkItem>(`/work-items/${workItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId: studentUser.id, assignedUserId: studentUser.id }),
      })
      toast.success('Work item assigned')
      await refreshWorkItems()
    } catch (err) {
      showError(err, 'Could not assign work item')
    }
  }

  return (
    <>
      <div className="detail-header compact course-hero">
        <div className="detail-title-row">
          <div className="title-block">
            <Badge variant="accent" className="course-tag" title={course.name}><BookOpen size={11} /> {course.name}</Badge>
            <Badge variant="muted" className="course-tag" title={assignment.name}><ClipboardList size={11} /> {assignment.name}</Badge>
            <h2>{group.name}</h2>
            <span className="meta-inline">
              <Users size={11} /> {members.length}
            </span>
          </div>
          <div className="detail-actions">
            <Tabs aria-label="Group workspace tabs">
              <TabsList>
                <TabsTrigger active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>
                  <BarChart3 size={13} /> Dashboard
                </TabsTrigger>
                {role === 'professor' && (
                  <TabsTrigger active={tab === 'students'} onClick={() => setTab('students')}>
                    <Users size={13} /> Students
                  </TabsTrigger>
                )}
                {role === 'student' && (
                  <TabsTrigger active={tab === 'group'} onClick={() => setTab('group')}>
                    <Users size={13} /> Students
                    <span className="tab-count">{members.length}</span>
                  </TabsTrigger>
                )}
                <TabsTrigger active={tab === 'work'} onClick={() => setTab('work')}>
                  <ClipboardList size={13} /> Work
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {role === 'professor' && (
              <Button variant={group.githubRepoUrl ? 'success' : 'secondary'} size="sm" onClick={() => setGithubDialogOpen(true)}>
                {group.githubRepoUrl ? 'GitHub Connected' : 'Connect GitHub'}
              </Button>
            )}
            {role === 'student' && studentUser && (
              <Button variant={group.githubRepoUrl ? 'success' : 'secondary'} size="sm" onClick={openStudentGithubDialog}>
                <GitBranch size={13} /> {group.githubRepoUrl ? 'Repository Connected' : 'Select Repository'}
              </Button>
            )}
            {group.cloneUrl && <CloneUrlButton url={group.cloneUrl} />}
          </div>
        </div>
      </div>

      <div className="group-workspace">
        <div className="tab-body">
          {tab === 'dashboard' ? (
            <PerformanceDashboard
              kind="group"
              id={group.id}
              refreshKey={dashboardRefreshKey}
              showFetchLatest={isGithubConnected}
              onFetchLatest={() => fetchLatestRepository(true)}
              canInspectStudents
            />
          ) : tab === 'work' ? (
            <GroupWorkView
              role={role}
              studentUser={studentUser}
              members={members}
              workItems={workItems}
              workTitle={workTitle}
              workAssigneeId={workAssigneeId}
              savingWorkItem={savingWorkItem}
              onTitleChange={setWorkTitle}
              onAssigneeChange={setWorkAssigneeId}
              onCreate={createWorkItem}
              onStatusChange={updateWorkItemStatus}
              onAssignToMe={assignWorkItemToMe}
            />
          ) : tab === 'group' ? (
            <GroupMembersView groupMembers={members} repositoryAccessMembers={repositoryAccess?.members} />
          ) : (
            <AddStudentsView
              courseMembers={courseMembers}
              groupMembers={members}
              availableStudents={availableStudents}
              assigningUserId={assigningUserId}
              onAssign={assignStudent}
            />
          )}
        </div>
      </div>
      {githubDialogOpen && (
        <DialogShell
          title="Connect GitHub repository"
          description="Paste the GitHub URL for this group’s project."
          onClick={(event) => {
            if (event.target === event.currentTarget && !connectingGithub) setGithubDialogOpen(false)
          }}
        >
          <form className="modal-body" onSubmit={connectGithub}>
            <label htmlFor="github-repo-url">GitHub repository URL</label>
            <Input
              id="github-repo-url"
              value={githubRepoUrl}
              onChange={(event) => setGithubRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repository"
              autoFocus
            />
            <div className="modal-actions">
              <Button type="button" variant="secondary" size="sm" onClick={() => setGithubDialogOpen(false)} disabled={connectingGithub}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={connectingGithub || githubRepoUrl.trim().length === 0}>
                {connectingGithub ? 'Connecting…' : 'Connect GitHub'}
              </Button>
            </div>
          </form>
        </DialogShell>
      )}
      {studentGithubDialogOpen && (
        <DialogShell
          title="Select GitHub repository"
          description="Choose the repository your group will use for this assignment."
          onClick={(event) => {
            if (event.target === event.currentTarget && !connectingStudentGithub) setStudentGithubDialogOpen(false)
          }}
        >
          <form className="modal-body" onSubmit={connectStudentGithub}>
            {!studentUser?.githubUsername && (
              <div className="student-empty">Connect GitHub in account settings before selecting repositories.</div>
            )}
            <label htmlFor="student-github-new-repo">Create a new private repository</label>
            <div className="inline-create">
              <Input
                id="student-github-new-repo"
                value={newRepositoryName}
                onChange={(event) => setNewRepositoryName(event.target.value)}
                placeholder="assignment-group-repo"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={createStudentGithubRepository}
                disabled={creatingStudentRepository || !studentUser?.githubUsername || newRepositoryName.trim().length === 0}
              >
                {creatingStudentRepository ? 'Creating…' : 'Create + Invite'}
              </Button>
            </div>
            <div className="student-empty">Miyagi creates the repo under your GitHub account, then sends GitHub collaborator invitations to group members with GitHub usernames.</div>
            <label htmlFor="student-github-repo">Repository</label>
            {loadingStudentRepositories ? (
              <div className="student-empty">Loading GitHub repositories…</div>
            ) : studentRepositories && studentRepositories.length > 0 ? (
              <Select
                id="student-github-repo"
                value={selectedRepositoryUrl}
                onChange={(event) => setSelectedRepositoryUrl(event.target.value)}
                autoFocus
              >
                {studentRepositories.map((repository) => (
                  <option key={repository.id} value={repository.htmlUrl}>
                    {repository.fullName}{repository.private ? ' · private' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="student-github-repo"
                value={selectedRepositoryUrl}
                onChange={(event) => setSelectedRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                autoFocus
              />
            )}
            {studentRepositories && studentRepositories.length === 0 && (
              <div className="student-empty">No repositories were returned. Paste a GitHub URL you can access, or reconnect GitHub with repository access.</div>
            )}
            <div className="modal-actions">
              <Button type="button" variant="secondary" size="sm" onClick={() => setStudentGithubDialogOpen(false)} disabled={connectingStudentGithub}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={connectingStudentGithub || selectedRepositoryUrl.trim().length === 0}>
                {connectingStudentGithub ? 'Connecting…' : 'Connect Repository'}
              </Button>
            </div>
          </form>
        </DialogShell>
      )}
    </>
  )
}


function GroupWorkView({
  role,
  studentUser,
  members,
  workItems,
  workTitle,
  workAssigneeId,
  savingWorkItem,
  onTitleChange,
  onAssigneeChange,
  onCreate,
  onStatusChange,
  onAssignToMe,
}: {
  role: Role
  studentUser?: User
  members: Member[]
  workItems: WorkItem[] | null
  workTitle: string
  workAssigneeId: string
  savingWorkItem: boolean
  onTitleChange: (value: string) => void
  onAssigneeChange: (value: string) => void
  onCreate: (event: React.FormEvent<HTMLFormElement>) => void
  onStatusChange: (workItem: WorkItem, status: WorkItem['status']) => void
  onAssignToMe: (workItem: WorkItem) => void
}) {
  const memberById = new Map(members.map((member) => [member.userId, member]))
  const presets = ['Proposal', 'Interaction', 'Methodology', 'Main contribution', 'Conclusion']
  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Group work</h3>
          <span>{workItems?.length ?? 0}</span>
        </div>
        {role === 'student' && studentUser && (
          <form className="inline-create work-create" onSubmit={onCreate}>
            <div className="work-presets" aria-label="Suggested part names">
              {presets.map((preset) => (
                <Button key={preset} type="button" variant="secondary" size="sm" onClick={() => onTitleChange(preset)}>
                  {preset}
                </Button>
              ))}
            </div>
            <Input placeholder="Part name, e.g. Methodology" value={workTitle} onChange={(event) => onTitleChange(event.target.value)} />
            <Select value={workAssigneeId} onChange={(event) => onAssigneeChange(event.target.value)} aria-label="Assign to">
              <option value="">Unassigned until someone takes it</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>{studentDisplayLabel(member)}</option>
              ))}
            </Select>
            <Button type="submit" variant="primary" size="sm" disabled={savingWorkItem || workTitle.trim().length === 0}>
              {savingWorkItem ? 'Adding…' : 'Add part'}
            </Button>
          </form>
        )}
        {workItems === null ? (
          <div className="student-empty">Loading work items…</div>
        ) : workItems.length === 0 ? (
          <div className="student-empty">No group work has been added yet.</div>
        ) : (
          <div className="student-list compact work-list">
            {workItems.map((workItem) => {
              const assignee = workItem.assignedUserId ? memberById.get(workItem.assignedUserId) : undefined
              const canTake = role === 'student' && Boolean(studentUser?.id) && workItem.status !== 'completed' && workItem.assignedUserId !== studentUser?.id
              return (
                <div className={`student-row work-item-row status-${workItem.status}`} key={workItem.id}>
                  <div className="student-main">
                    <span className="student-name">{workItem.title}</span>
                    <span className="student-meta">
                      {assignee ? `Assigned to ${studentDisplayLabel(assignee)}` : 'Unassigned'} · Created {relativeTime(workItem.createdAt)}
                    </span>
                    <div className="work-status-line">
                      <span className={`work-status-pill status-${workItem.status}`}>{workItem.status.replace('_', ' ')}</span>
                      {workItem.startedAt && <span>Started {relativeTime(workItem.startedAt)}</span>}
                      {workItem.completedAt && <span>Completed {relativeTime(workItem.completedAt)}</span>}
                    </div>
                    {workItem.completionComment && <span className="student-meta">Completion note: {workItem.completionComment}</span>}
                    {workItem.events && workItem.events.length > 0 && (
                      <div className="work-event-trail">
                        {workItem.events.map((event) => (
                          <span key={event.id}>
                            {event.actorDisplayName ?? 'Someone'} {event.action.replace('_', ' ')}
                            {event.toStatus ? ` → ${event.toStatus.replace('_', ' ')}` : ''}
                            {event.comment && event.action !== 'assigned' ? `: ${event.comment}` : ''}
                            {' · '}{relativeTime(event.occurredAt)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {role === 'student' && (
                    <div className="modal-actions">
                      {canTake && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => onAssignToMe(workItem)}>Take</Button>
                      )}
                      {workItem.status === 'assigned' && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => onStatusChange(workItem, 'in_progress')}>Start</Button>
                      )}
                      {workItem.status !== 'completed' && (
                        <Button type="button" variant="success" size="sm" onClick={() => onStatusChange(workItem, 'completed')}>Complete</Button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function GroupMembersView({ groupMembers, repositoryAccessMembers }: { groupMembers: Member[]; repositoryAccessMembers?: GithubRepositoryAccessMember[] }) {
  const accessByUserId = new Map((repositoryAccessMembers ?? []).map((member) => [member.userId, member]))
  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Group members</h3>
          <span>{groupMembers.length}</span>
        </div>
        {groupMembers.length === 0 ? (
          <div className="student-empty">No students have been added to this group yet.</div>
        ) : (
          <div className="student-list compact">
            {groupMembers.map((student) => {
              const access = accessByUserId.get(student.userId)
              const accessProblem = access?.hasRepositoryAccess === false
              const accessCopy = access?.repositoryAccessReason === 'missing_github_username'
                ? 'Missing GitHub username'
                : access?.repositoryAccessReason === 'not_collaborator'
                  ? 'Not in GitHub repo'
                  : access?.repositoryAccessReason === 'no_repository_token'
                    ? 'Repo access not checkable'
                    : access?.repositoryAccessReason === 'check_failed'
                      ? 'GitHub check failed'
                      : null
              return (
                <div className={`student-row${isInactiveStudent(student) ? ' inactive' : ''}${accessProblem ? ' repo-warning' : ''}`} key={student.userId}>
                  <Avatar className="student-avatar" fallback={initials(studentDisplayLabel(student))} style={studentAvatarStyle(student)} />
                  <div className="student-main">
                    <span className="student-name">{studentDisplayLabel(student)}{student.movedFromGroupId && <span className="student-moved-marker" title="Moved from another group">*</span>}</span>
                    <span className="student-meta">Added {relativeTime(student.joinedAt)} · Last active {student.lastSeenAt ? relativeTime(student.lastSeenAt) : 'never'}{student.githubUsername ? ` · @${student.githubUsername}` : ''}</span>
                    {accessCopy && <span className="student-meta repo-warning-text">{accessCopy}. They may need to reconnect GitHub or accept the repository invite.</span>}
                  </div>
                  {isInactiveStudent(student) && <span className="student-status">Inactive</span>}
                  {!isInactiveStudent(student) && accessProblem && <span className="student-status repo-warning-text">Repo warning</span>}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function AddStudentsView({
  courseMembers,
  groupMembers,
  availableStudents,
  assigningUserId,
  onAssign,
}: {
  courseMembers: Member[] | null
  groupMembers: Member[]
  availableStudents: Member[]
  assigningUserId: string | null
  onAssign: (student: Member) => void
}) {
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
        <p>Students will appear here after they join the course with the course code.</p>
      </div>
    )
  }

  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Available students</h3>
          <p>Add students here, or move them from another group in this assignment.</p>
          <span>{availableStudents.length}</span>
        </div>
        {availableStudents.length === 0 ? (
          <div className="student-empty">Every course student is already in this group.</div>
        ) : (
          <div className="student-list">
            {availableStudents.map((student) => (
              <div className={`student-row${isInactiveStudent(student) ? ' inactive' : ''}`} key={student.userId}>
                <Avatar className="student-avatar" fallback={initials(studentDisplayLabel(student))} style={studentAvatarStyle(student)} />
                <div className="student-main">
                  <span className="student-name">{studentDisplayLabel(student)}</span>
                  <span className="student-meta">Joined course {relativeTime(student.joinedAt)} · Last active {student.lastSeenAt ? relativeTime(student.lastSeenAt) : 'never'}</span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={assigningUserId === student.userId}
                  onClick={() => onAssign(student)}
                >
                  <UserPlus size={12} />
                  {assigningUserId === student.userId ? 'Moving' : 'Add / Move'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="student-section">
        <div className="student-section-header">
          <h3>Current group</h3>
          <span>{groupMembers.length}</span>
        </div>
        {groupMembers.length === 0 ? (
          <div className="student-empty">No students have been added to this group yet.</div>
        ) : (
          <div className="student-list compact">
            {groupMembers.map((student) => (
              <div className="student-row" key={student.userId}>
                <Avatar className="student-avatar" fallback={initials(studentDisplayLabel(student))} style={studentAvatarStyle(student)} />
                <div className="student-main">
                  <span className="student-name">{studentDisplayLabel(student)}{student.movedFromGroupId && <span className="student-moved-marker" title="Moved from another group">*</span>}</span>
                  <span className="student-meta">Added {relativeTime(student.joinedAt)}</span>
                </div>
                <span className="student-status">Assigned</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
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
    <Button className={`clone-url ${copied ? 'copied' : ''}`} variant="secondary" size="sm" onClick={copy} title={url}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Clone URL'}</span>
    </Button>
  )
}



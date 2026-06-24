import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BookOpen, Users, ClipboardList, UserPlus, Copy, Check, BarChart3 } from 'lucide-react'
import { studentAvatarStyle } from '../../avatar'
import { api } from '../../api'
import { initials, relativeTime } from '../../format'
import type { Assignment, Course, Group, Member, Role } from '../../types'
import { PerformanceDashboard } from './PerformanceDashboard'
import { Avatar, Badge, Button, DialogShell, Input, Tabs, TabsList, TabsTrigger } from '../ui'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
}

function studentDisplayLabel(student: Member) {
  const emailLocalPart = student.email?.split('@')[0]?.trim()
  return emailLocalPart || student.displayName
}

type GroupDetailTab = 'dashboard' | 'students' | 'group'


export function GroupDetail({
  course,
  assignment,
  group,
  role,
  professorId,
  onSidebarContentChange,
  onGroupUpdated,
}: {
  course: Course
  assignment: Assignment
  group: Group
  role: Role
  professorId?: string
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
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const isGithubConnected = Boolean(group.githubRepoUrl) || group.repositoryProvider === 'github'

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCourseMembers(null)
    refreshMembers()
    if (role === 'professor') {
      api<Member[]>(`/courses/${course.id}/members`).then(setCourseMembers).catch(() => setCourseMembers([]))
    }
    if (isGithubConnected) {
      void fetchLatestRepository(false)
    }
  }, [course.id, fetchLatestRepository, group.id, isGithubConnected, refreshMembers, role])

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
              </TabsList>
            </Tabs>
            {role === 'professor' && (
              <Button variant={group.githubRepoUrl ? 'success' : 'secondary'} size="sm" onClick={() => setGithubDialogOpen(true)}>
                {group.githubRepoUrl ? 'GitHub Connected' : 'Connect GitHub'}
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
          ) : tab === 'group' ? (
            <GroupMembersView groupMembers={members} />
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
    </>
  )
}

function GroupMembersView({ groupMembers }: { groupMembers: Member[] }) {
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
            {groupMembers.map((student) => (
              <div className="student-row" key={student.userId}>
                <Avatar className="student-avatar" fallback={initials(studentDisplayLabel(student))} style={studentAvatarStyle(student)} />
                <div className="student-main">
                  <span className="student-name">{studentDisplayLabel(student)}{student.movedFromGroupId && <span className="student-moved-marker" title="Moved from another group">*</span>}</span>
                  <span className="student-meta">Added {relativeTime(student.joinedAt)}</span>
                </div>
              </div>
            ))}
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
              <div className="student-row" key={student.userId}>
                <Avatar className="student-avatar" fallback={initials(studentDisplayLabel(student))} style={studentAvatarStyle(student)} />
                <div className="student-main">
                  <span className="student-name">{studentDisplayLabel(student)}</span>
                  <span className="student-meta">Joined course {relativeTime(student.joinedAt)}</span>
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



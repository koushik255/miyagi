import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BookOpen, Users, GitCommit, ClipboardList, UserPlus, Copy, Check, BarChart3 } from 'lucide-react'
import { api } from '../../api'
import { initials, relativeTime } from '../../format'
import { DiffViewer } from '../workspace/DiffViewer'
import type { Assignment, Course, Group, GroupDiff, HistoryEntry, Member, Role } from '../../types'
import { PerformanceDashboard } from './PerformanceDashboard'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
}

type GroupDetailTab = 'dashboard' | 'history' | 'students' | 'group'
function getRepositoryTabCopy(isGithubConnected: boolean) {
  if (isGithubConnected) {
    return {
      historyEmptyTitle: 'No repository history yet',
      historyEmptyDescription: 'Commits will appear here once this GitHub repository has activity.',
      historySidebarEmpty: 'No repository history yet.',
    }
  }
  return {
    historyEmptyTitle: 'No commits yet',
    historyEmptyDescription: 'Commits will appear here once team members push to the repository.',
    historySidebarEmpty: 'No commits yet.',
  }
}

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
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [activeHistoryEntry, setActiveHistoryEntry] = useState<HistoryEntry | null>(null)
  const [diffPatch, setDiffPatch] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [courseMembers, setCourseMembers] = useState<Member[] | null>(null)
  const [tab, setTab] = useState<GroupDetailTab>('dashboard')
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [githubDialogOpen, setGithubDialogOpen] = useState(false)
  const [githubRepoUrl, setGithubRepoUrl] = useState(group.githubRepoUrl ?? '')
  const [connectingGithub, setConnectingGithub] = useState(false)
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const isGithubConnected = Boolean(group.githubRepoUrl) || group.repositoryProvider === 'github'
  const repositoryTabCopy = getRepositoryTabCopy(isGithubConnected)

  const refreshMembers = useCallback(() => {
    return api<Member[]>(`/groups/${group.id}/members`).then(setMembers).catch(() => setMembers([]))
  }, [group.id])



  const openDiff = useCallback(async (entry: HistoryEntry) => {
    setActiveHistoryEntry(entry)
    setLoadingDiff(true)
    try {
      const result = await api<GroupDiff>(`/groups/${group.id}/diff?commit=${encodeURIComponent(entry.hash)}`)
      setDiffPatch(result.patch)
    } catch (err) {
      showError(err, 'Could not read diff')
      setDiffPatch('')
    } finally {
      setLoadingDiff(false)
    }
  }, [group.id])

  const loadHistory = useCallback(async () => {
    try {
      const entries = await api<HistoryEntry[]>(`/groups/${group.id}/history`)
      setHistory(entries)
      if (entries.length > 0) {
        void openDiff(entries[0])
      } else {
        setActiveHistoryEntry(null)
        setDiffPatch('')
      }
    } catch {
      setHistory([])
    }
  }, [group.id, openDiff])

  const fetchLatestRepository = useCallback(async (notify = true) => {
    if (!isGithubConnected) return
    try {
      const updatedGroup = await api<Group>(`/groups/${group.id}/github/fetch`, { method: 'POST' })
      onGroupUpdated?.(updatedGroup)
      setDashboardRefreshKey((value) => value + 1)
      await loadHistory()
      if (notify) toast.success('Repository updated')
    } catch (err) {
      if (notify) showError(err, 'Could not fetch latest repository changes')
    }
  }, [group.id, isGithubConnected, loadHistory, onGroupUpdated])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(null); setCourseMembers(null); setActiveHistoryEntry(null); setDiffPatch(''); setLoadingDiff(false)
    void loadHistory()
    refreshMembers()
    if (role === 'professor') {
      api<Member[]>(`/courses/${course.id}/members`).then(setCourseMembers).catch(() => setCourseMembers([]))
    }
    if (isGithubConnected) {
      void fetchLatestRepository(false)
    }
  }, [course.id, fetchLatestRepository, group.id, isGithubConnected, loadHistory, refreshMembers, role])

  const lastCommit = history && history.length > 0 ? history[0] : null
  const assignedUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const availableStudents = useMemo(
    () => (courseMembers ?? []).filter((member) => !assignedUserIds.has(member.userId)),
    [assignedUserIds, courseMembers],
  )

  const historySidebarContent = useMemo(() => {
    if (tab !== 'history') return null
    return (
      <HistoryCommitList
        entries={history}
        emptyMessage={repositoryTabCopy.historySidebarEmpty}
        selectedHash={activeHistoryEntry?.hash ?? null}
        onSelect={openDiff}
      />
    )
  }, [activeHistoryEntry?.hash, history, openDiff, repositoryTabCopy.historySidebarEmpty, tab])

  useEffect(() => {
    onSidebarContentChange?.(historySidebarContent)
    return () => onSidebarContentChange?.(null)
  }, [historySidebarContent, onSidebarContentChange])

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
      toast.success(`${student.displayName} added to ${group.name}`)
      await refreshMembers()
    } catch (err) {
      showError(err, 'Could not add student')
    } finally {
      setAssigningUserId(null)
    }
  }

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
          <div className="detail-actions">
            <div className="tabs" aria-label="Group workspace tabs">
              <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
                <BarChart3 size={13} /> Dashboard
              </button>
              {role === 'professor' && (
                <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
                  <Users size={13} /> Students
                </button>
              )}
              {role === 'student' && (
                <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>
                  <Users size={13} /> Students
                  <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted)' }}>{members.length}</span>
                </button>
              )}
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                <GitCommit size={13} /> History
                {history && history.length > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted)' }}>{history.length}</span>
                )}
              </button>
            </div>
            {role === 'professor' && (
              <button className={`btn btn-sm ${group.githubRepoUrl ? 'btn-success' : ''}`} onClick={() => setGithubDialogOpen(true)}>
                {group.githubRepoUrl ? 'GitHub Connected' : 'Connect GitHub'}
              </button>
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
              canInspectStudents={role === 'professor'}
            />
          ) : tab === 'history' ? (
            <HistoryView
              entries={history}
              emptyTitle={repositoryTabCopy.historyEmptyTitle}
              emptyDescription={repositoryTabCopy.historyEmptyDescription}
              diff={<DiffViewer entry={activeHistoryEntry} loading={loadingDiff} patch={diffPatch} />}
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
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !connectingGithub) setGithubDialogOpen(false)
          }}
        >
          <form className="modal-card" onSubmit={connectGithub}>
            <div className="modal-head">
              <div>
                <h3>Connect GitHub repository</h3>
                <p>Paste the GitHub URL for this group’s project.</p>
              </div>
            </div>
            <div className="modal-body">
              <label htmlFor="github-repo-url">GitHub repository URL</label>
              <input
                id="github-repo-url"
                value={githubRepoUrl}
                onChange={(event) => setGithubRepoUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-sm" onClick={() => setGithubDialogOpen(false)} disabled={connectingGithub}>
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary" disabled={connectingGithub || githubRepoUrl.trim().length === 0}>
                {connectingGithub ? 'Connecting…' : 'Connect GitHub'}
              </button>
            </div>
          </form>
        </div>
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
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
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
          <span>{availableStudents.length}</span>
        </div>
        {availableStudents.length === 0 ? (
          <div className="student-empty">Every course student is already in this group.</div>
        ) : (
          <div className="student-list">
            {availableStudents.map((student) => (
              <div className="student-row" key={student.userId}>
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
                  <span className="student-meta">Joined course {relativeTime(student.joinedAt)}</span>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={assigningUserId === student.userId}
                  onClick={() => onAssign(student)}
                >
                  <UserPlus size={12} />
                  {assigningUserId === student.userId ? 'Adding' : 'Add'}
                </button>
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
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
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
    <button className={`clone-url ${copied ? 'copied' : ''}`} onClick={copy} title={url}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Clone URL'}</span>
    </button>
  )
}


/* ============ History ============ */

function HistoryView({
  entries,
  diff,
  emptyTitle,
  emptyDescription,
}: {
  entries: HistoryEntry[] | null
  diff: ReactNode
  emptyTitle: string
  emptyDescription: string
}) {
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
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    )
  }
  return (
    <div className="history-layout">
      {diff}
    </div>
  )
}

function HistoryCommitList({
  entries,
  emptyMessage,
  selectedHash,
  onSelect,
}: {
  entries: HistoryEntry[] | null
  emptyMessage: string
  selectedHash: string | null
  onSelect: (entry: HistoryEntry) => void
}) {
  if (entries === null) {
    return (
      <div className="history-list">
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }

  if (entries.length === 0) {
    return <div className="sidebar-empty">{emptyMessage}</div>
  }

  return (
    <div className="history-list">
      {entries.map((entry) => (
        <button
          className={`history-row ${selectedHash === entry.hash ? 'active' : ''}`}
          key={entry.hash}
          title={entry.message}
          onClick={() => onSelect(entry)}
        >
          <span className="commit-dot" />
          <span className="message">{entry.message}</span>
          <span className="hash">{entry.hash.slice(0, 7)}</span>
          <span className="meta-line">
            {entry.pushedBy && <span>Pushed by: {entry.pushedBy}</span>}
            {entry.pushedBy && <span>·</span>}
            <span className="when" title={entry.when}>{relativeTime(entry.when)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

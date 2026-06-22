import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, GitCommit, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react'
import { api } from '../../api'
import { initials } from '../../format'
import type { ActivityCommit, ActivityDashboard, Period, StudentActivity } from '../../types'

export function PerformanceDashboard({
  kind,
  id,
  refreshKey = 0,
  showFetchLatest = false,
  onFetchLatest,
  canInspectStudents = false,
}: {
  kind: 'assignment' | 'group'
  id: string
  refreshKey?: number
  showFetchLatest?: boolean
  onFetchLatest?: (() => Promise<void>) | undefined
  canInspectStudents?: boolean
}) {
  const [period, setPeriod] = useState<Period>('weekly')
  const [data, setData] = useState<ActivityDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetchNonce, setFetchNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  const handleFetchLatest = async () => {
    if (!showFetchLatest) return
    if (onFetchLatest) {
      setRefreshing(true)
      try {
        await onFetchLatest()
      } finally {
        setRefreshing(false)
      }
    }
    setFetchNonce((value) => value + 1)
  }

  useEffect(() => {
    let ignore = false
    setRefreshing(true)

    api<ActivityDashboard>(`/${kind === 'assignment' ? 'assignments' : 'groups'}/${id}/dashboard?period=${period}`)
      .then((dashboard) => {
        if (ignore) return
        setData(dashboard)
        setError(null)
      })
      .catch((err) => {
        if (ignore) return
        setError(err instanceof Error ? err.message : 'Could not load dashboard')
      })
      .finally(() => {
        if (ignore) return
        setRefreshing(false)
      })

    return () => {
      ignore = true
    }
  }, [fetchNonce, id, kind, period, refreshKey])


  if (error) return <div className="dash-empty"><AlertTriangle size={18} /> {error}</div>
  if (!data) return <div className="analytics-grid"><div className="analytics-card span-2"><div className="skeleton-row" /><div className="skeleton-row" style={{ width: '60%' }} /></div></div>
  const periodLabel = describePeriod(period)
  const topPerformers = data.byStudent.filter((student) => student.commits > 0).slice(0, 3)
  const selectedStudent = data.byStudent.find((student) => student.userId === selectedStudentId) ?? null
  const selectedStudentCommits = selectedStudent ? commitsForStudent(data.commits, selectedStudent) : []
  const selectedStudentName = selectedStudent ? selectedStudent.username ?? selectedStudent.githubUsername ?? selectedStudent.displayName : ''



  if (selectedStudent && canInspectStudents) {
    return (
      <div className="analytics-page">
        <div className="analytics-toolbar student-commit-page-toolbar">
          <div className="student-commit-page-title">
            <button type="button" className="btn btn-sm" onClick={() => setSelectedStudentId(null)}>← All students</button>
            <div className="contributor-avatar">{initials(selectedStudentName)}</div>
            <div>
              <h3>{selectedStudentName}</h3>
              <p>{selectedStudentCommits.length} {selectedStudentCommits.length === 1 ? 'commit' : 'commits'} matched to this student's GitHub name {periodLabel}.</p>
            </div>
          </div>
          <div className="analytics-controls">
            {showFetchLatest && (
              <button className="btn btn-sm" onClick={handleFetchLatest} disabled={refreshing}>
                {refreshing ? 'Fetching…' : 'Fetch latest'}
              </button>
            )}
            <div className="period-tabs">
              {(['weekly', 'monthly', 'semester'] as Period[]).map((nextPeriod) => (
                <button key={nextPeriod} className={period === nextPeriod ? 'active' : ''} onClick={() => setPeriod(nextPeriod)}>
                  {nextPeriod}
                </button>
              ))}
            </div>
          </div>
        </div>
        <StudentCommitPage commits={selectedStudentCommits} periodLabel={periodLabel} />
      </div>
    )
  }

  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div>
          <h3>{kind === 'assignment' ? 'Student activity' : 'Group student activity'}</h3>
          <p>Clear per-student summaries for changes made {periodLabel}.</p>
        </div>
        <div className="analytics-controls">
          {showFetchLatest && (
            <button className="btn btn-sm" onClick={handleFetchLatest} disabled={refreshing}>
              {refreshing ? 'Fetching…' : 'Fetch latest'}
            </button>
          )}
          <div className="period-tabs">
            {(['weekly', 'monthly', 'semester'] as Period[]).map((nextPeriod) => (
              <button key={nextPeriod} className={period === nextPeriod ? 'active' : ''} onClick={() => setPeriod(nextPeriod)}>
                {nextPeriod}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<Users size={15} />} label="Students" value={data.totals.students} />
        {'groups' in data.totals && <Metric icon={<Users size={15} />} label="Groups" value={data.totals.groups ?? 0} />}
        <Metric icon={<GitCommit size={15} />} label="Commits" value={data.totals.commits} />
        <Metric icon={<TrendingUp size={15} />} label="Additions" value={data.totals.additions} tone="positive" prefix="+" />
        <Metric icon={<TrendingDown size={15} />} label="Deletions" value={data.totals.deletions} tone="negative" prefix="-" />
        <Metric icon={<FileText size={15} />} label="Files changed" value={data.totals.changedFiles} />
      </div>

      <div className="analytics-grid">
        <TopPerformersWidget students={topPerformers} periodLabel={periodLabel} />
        <section className="analytics-card span-2 student-activity-card">
          <div className="card-head">
            <div>
              <h4>Changes made {periodLabel}</h4>
              <span>{data.byStudent.length} {data.byStudent.length === 1 ? 'student' : 'students'} tracked individually. {canInspectStudents ? 'Click a student to inspect their commits.' : ''}</span>
            </div>
          </div>
          {data.byStudent.length === 0 ? (
            <div className="dash-empty">No students yet.</div>
          ) : (
            <>
              <div className="contributor-grid">
                {data.byStudent.map((student, index) => (
                  <ContributorCard
                    key={student.userId}
                    student={student}
                    rank={index + 1}
                    period={period}
                    inspectable={canInspectStudents}
                    selected={selectedStudentId === student.userId}
                    onInspect={() => setSelectedStudentId(student.userId)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="analytics-card span-2">
          <div className="card-head"><h4>Recent activity</h4><span>{data.recentActivity.length}</span></div>
          <div className="activity-feed">
            {data.recentActivity.length === 0 ? <div className="dash-empty">No recent activity in this period.</div> : data.recentActivity.map((commit) => {
              const contributorName = commit.matchedStudent?.username ?? commit.matchedStudent?.displayName ?? commit.githubUsername ?? commit.authorName
              const contributorTitle = commit.matchedStudent?.githubUsername ? `GitHub: ${commit.matchedStudent.githubUsername}` : undefined
              return (
                <div className="activity-row" key={commit.hash}>
                  <GitCommit size={14} />
                  <div>
                    <strong>{commit.message.split('\n')[0]}</strong>
                    <span title={contributorTitle}>{contributorName} · {commit.groupName ?? 'repo'} · {formatActivityTime(commit.when)}</span>
                  </div>
                  <span className="code-chip diff-chip"><span className="diff-positive">+{commit.additions}</span><span className="diff-negative">-{commit.deletions}</span></span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({
  icon,
  label,
  value,
  tone = 'neutral',
  prefix = '',
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'negative'
  prefix?: string
}) {
  return <div className={`metric-card ${tone !== 'neutral' ? `metric-${tone}` : ''}`}><span>{icon}</span><strong>{prefix}{value}</strong><small>{label}</small></div>
}

function TopPerformersWidget({ students, periodLabel }: { students: StudentActivity[]; periodLabel: string }) {
  return (
    <section className="analytics-card span-2 top-performers-card">
      <div className="card-head">
        <div>
          <h4><Trophy size={14} /> Top performers</h4>
          <span>Highest committers in this group {periodLabel}.</span>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="dash-empty">No commit activity yet.</div>
      ) : (
        <div className="top-performer-list">
          {students.map((student, index) => {
            const name = student.username ?? student.githubUsername ?? student.displayName
            const secondaryName = name === student.displayName ? null : student.displayName

            return (
              <article className="top-performer-row" key={student.userId}>
                <span className={`top-performer-rank rank-${index + 1}`}>#{index + 1}</span>
                <div className="contributor-avatar">{initials(name)}</div>
                <div className="top-performer-main">
                  <strong>{name}</strong>
                  {secondaryName && <span>{secondaryName}</span>}
                </div>
                <div className="top-performer-score">
                  <strong>{student.commits}</strong>
                  <span>{student.commits === 1 ? 'commit' : 'commits'}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}



function ContributorCard({
  student,
  rank,
  period,
  inspectable,
  selected,
  onInspect,
}: {
  student: StudentActivity
  rank: number
  period: Period
  inspectable: boolean
  selected: boolean
  onInspect: () => void
}) {
  const primaryName = student.username ?? student.githubUsername ?? student.displayName
  const secondaryName = primaryName === student.displayName ? null : student.displayName
  const contributorTitle = student.githubUsername ? `GitHub: ${student.githubUsername}` : undefined
  const periodLabel = describePeriod(period)
  const latestActivity = latestActiveBucket(student)
  const hasActivity = student.commits > 0 || student.additions > 0 || student.deletions > 0 || student.changedFiles > 0

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!inspectable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onInspect()
  }

  return (
    <article
      className={`contributor-card student-summary-card${hasActivity ? '' : ' inactive'}${inspectable ? ' inspectable' : ''}${selected ? ' selected' : ''}`}
      role={inspectable ? 'button' : undefined}
      tabIndex={inspectable ? 0 : undefined}
      onClick={inspectable ? onInspect : undefined}
      onKeyDown={handleKeyDown}
      aria-pressed={inspectable ? selected : undefined}
    >
      <div className="contributor-head">
        <div className="contributor-identity" title={contributorTitle}>
          <div className="contributor-avatar">{initials(primaryName)}</div>
          <div>
            <strong>{primaryName}</strong>
            {secondaryName && <span>{secondaryName}</span>}
          </div>
        </div>
        <span className="contributor-rank">{inspectable ? (selected ? 'Open' : 'View commits') : `#${rank}`}</span>
      </div>

      <div className="student-change-callout">
        <strong>{student.commits}</strong>
        <div>
          <span>{pluralize(student.commits, 'change')} made {periodLabel}</span>
          <p>{latestActivity ? `Last activity ${latestActivity.shortLabel}` : `No activity recorded ${periodLabel}.`}</p>
        </div>
      </div>

      <div className="contributor-stats student-stat-chips">
        <span><GitCommit size={12} /> {pluralize(student.commits, 'commit')}</span>
        <span className="rank-stat-positive">{formatSignedStat(student.additions, '+')} additions</span>
        <span className="rank-stat-negative">{formatSignedStat(student.deletions, '-')} deletions</span>
        <span>{pluralize(student.changedFiles, 'file')} changed</span>
      </div>
    </article>
  )
}

function StudentCommitPage({ commits, periodLabel }: { commits: ActivityCommit[]; periodLabel: string }) {
  return (
    <section className="analytics-card span-2 student-commit-page">
      <div className="card-head">
        <div>
          <h4>Commits {periodLabel}</h4>
          <span>Only commits matched to the selected student's linked GitHub name are shown.</span>
        </div>
        <span>{commits.length}</span>
      </div>

      {commits.length === 0 ? (
        <div className="dash-empty">No commits matched this student {periodLabel}.</div>
      ) : (
        <div className="student-commit-list page-list">
          {commits.map((commit) => (
            <div className="student-commit-row" key={commit.hash}>
              <GitCommit size={15} />
              <div>
                <strong>{commit.message.split('\n')[0]}</strong>
                <span>{commit.githubUsername ?? commit.matchedStudent?.githubUsername ?? commit.authorName} · {commit.groupName ?? 'repo'} · {formatActivityTime(commit.when)}</span>
              </div>
              <span className="hash">{commit.hash.slice(0, 7)}</span>
              <span className="code-chip diff-chip"><span className="diff-positive">{formatSignedStat(commit.additions, '+')}</span><span className="diff-negative">{formatSignedStat(commit.deletions, '-')}</span></span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function describePeriod(period: Period) {
  if (period === 'weekly') return 'this week'
  if (period === 'monthly') return 'this month'
  return 'this semester'
}

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

function formatSignedStat(count: number, sign: '+' | '-') {
  return count === 0 ? '0' : `${sign}${count}`
}

function latestActiveBucket(student: StudentActivity) {
  for (let index = student.timeline.length - 1; index >= 0; index -= 1) {
    const bucket = student.timeline[index]
    if (bucket.commits > 0 || bucket.additions > 0 || bucket.deletions > 0 || bucket.changedFiles > 0) return bucket
  }
  return null
}

function commitsForStudent(commits: ActivityCommit[], student: StudentActivity) {
  const githubNames = [student.githubUsername, student.username]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase())

  return commits.filter((commit) => {
    if (commit.matchedStudent?.userId === student.userId) return true
    const commitGithubName = commit.matchedStudent?.githubUsername ?? commit.githubUsername
    return commitGithubName ? githubNames.includes(commitGithubName.toLowerCase()) : false
  })
}

function formatActivityTime(value: string | null) {
  if (!value) return 'unknown time'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

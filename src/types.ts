export type Role = 'professor' | 'student'
export type User = { id: string; displayName: string; githubUsername?: string | null; avatarColor?: string | null }
export type Professor = { id: string; userId: string; user?: User }
export type ProfessorGithubConnection = { connected: boolean; githubUsername: string | null; scope?: string | null }
export type Course = { id: string; name: string }
export type CourseMembershipSuggestion = { id: string; courseName: string; githubUsername: string }
export type Assignment = { id: string; courseId: string; name: string; description: string; dueDate?: string | null }
export type CourseCalendarItem = { id: string; assignmentId?: string | null; title: string; description: string; dueAt: string; kind: 'event' | 'deadline' }
export type Repository = { id: string; name: string; courseId: string; assignmentId: string; githubRepoUrl: string; githubRepo: string }
export type Member = { memberId: string; userId: string; avatarColor?: string | null; displayName: string; role: string; joinedAt: string; githubUsername?: string | null }
export type Period = 'weekly' | 'monthly' | 'semester'
type ContributionBucket = {
  label: string
  shortLabel: string
  start: string
  end: string
  commits: number
  additions: number
  deletions: number
  changedFiles: number
}
export type StudentActivity = {
  userId: string
  username?: string | null
  githubUsername?: string | null
  avatarColor?: string | null
  displayName: string
  commits: number
  additions: number
  deletions: number
  changedFiles: number
  timeline: ContributionBucket[]
}
export type ActivityCommit = { hash: string; message: string; authorName: string; githubUsername?: string | null; matchedStudent?: { userId: string; displayName: string; avatarColor?: string | null; githubUsername?: string | null } | null; when: string | null; additions: number; deletions: number; changedFiles: number; htmlUrl?: string | null }
export type ActivityDashboard = {
  period: Period
  totals: { repositories?: number; students: number; commits: number; additions: number; deletions: number; changedFiles: number }
  timeline: ContributionBucket[]
  timelineCadence: 'Daily' | 'Weekly'
  byStudent: StudentActivity[]
  topStudents: StudentActivity[]
  lowActivityStudents: StudentActivity[]
  highestPerformer: StudentActivity | null
  lowestCommitter: StudentActivity | null
  recentActivity: ActivityCommit[]
  commits: ActivityCommit[]
  lastCommitAt?: string | null
}

export type RepositoryActivityDashboard = ActivityDashboard & {
  repository: Repository
  members: StudentActivity[]
}

export type AssignmentActivityDashboard = ActivityDashboard & {
  repositories?: RepositoryActivityDashboard[]
}

export type Session =
  | { role: 'student'; user: User }
  | { role: 'professor'; professor: Professor; displayName: string; justRegistered?: boolean }

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  ChevronUp,
  CircleHelp,
  GitBranch,
  GraduationCap,
  Home,
  LockKeyhole,
  Mail,
  Users,
  X,
} from 'lucide-react'
import type { Role } from '../../types'
import {
  Badge,
  Button,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  Textarea,
} from '../../components/ui'

type Section = { id: string; label: string; icon: React.ReactNode }

const navigationGroups: Array<{ label: string; sections: Section[] }> = [
  {
    label: 'Getting started',
    sections: [
      { id: 'introduction', label: 'Introduction', icon: <BookOpen /> },
      { id: 'setup', label: 'Set up your workspace', icon: <CalendarClock /> },
    ],
  },
  {
    label: 'Using Miyagi',
    sections: [
      { id: 'navigate', label: 'Navigate the workspace', icon: <Home /> },
      { id: 'activity', label: 'Read activity', icon: <GitBranch /> },
    ],
  },
  {
    label: 'Account & help',
    sections: [
      { id: 'privacy', label: 'GitHub & privacy', icon: <LockKeyhole /> },
      { id: 'questions', label: 'Common questions', icon: <CircleHelp /> },
    ],
  },
]

function navigationForRole(role: Role) {
  if (role === 'professor') return navigationGroups
  return navigationGroups.map((group) => ({
    ...group,
    sections: group.sections.map((section) => section.id === 'setup'
      ? { ...section, label: 'Student workspace' }
      : section.id === 'navigate'
        ? { ...section, label: 'Courses & assignments' }
        : section),
  }))
}

type SidebarProps = {
  role: Role
  activeSection: string
  mobileOpen: boolean
  onBack: () => void
  onClose: () => void
  onSectionChange: (id: string) => void
}

export function DocumentationSidebar({ role, activeSection, mobileOpen, onBack, onClose, onSectionChange }: SidebarProps) {
  const groups = navigationForRole(role)

  function openSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    onSectionChange(id)
    onClose()
  }

  return (
    <Sidebar className={`docs-app-sidebar ${mobileOpen ? 'open' : ''}`} collapsible="none" aria-label="Documentation navigation">
      <SidebarHeader>
        <div className="docs-sidebar-header-row">
          <Button variant="ghost" onClick={onBack}><ArrowLeft /> Back to workspace</Button>
          <Button className="l-mobile-close" variant="ghost" size="icon" onClick={onClose} aria-label="Close navigation"><X /></Button>
        </div>
        <div className="docs-sidebar-title">
          <span>Documentation</span>
          <strong>Miyagi guide</strong>
          <Badge variant="muted">{role === 'professor' ? <GraduationCap /> : <Users />}{role === 'professor' ? 'Professor' : 'Student'}</Badge>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}<ChevronUp /></SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuSub>
                    {group.sections.map((section) => (
                      <SidebarMenuSubItem key={section.id}>
                        <SidebarMenuSubButton isActive={activeSection === section.id} onClick={() => openSection(section.id)}>
                          {section.icon}<span>{section.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}

type DocsProps = {
  role: Role
  activeSection: string
  onSectionChange: (id: string) => void
}

export function HelpDocs({ role, activeSection, onSectionChange }: DocsProps) {
  const isProfessor = role === 'professor'
  const initialSection = useRef(activeSection)
  const [enquiry, setEnquiry] = useState('')

  function sendEnquiry(event: React.FormEvent) {
    event.preventDefault()
    const message = enquiry.trim()
    if (!message) return
    const subject = encodeURIComponent('Miyagi support enquiry')
    const body = encodeURIComponent(message)
    window.location.href = `mailto:support@miyagi.app?subject=${subject}&body=${body}`
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => document.getElementById(initialSection.current)?.scrollIntoView({ block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const sections = navigationForRole(role).flatMap((group) => group.sections)
      .map(({ id }) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element))
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) onSectionChange(visible[0].target.id)
    }, { rootMargin: '-12% 0px -70% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [onSectionChange, role])

  return (
    <main className="docs-reading-area">
      <article className="docs-markdown">
        <header id="introduction">
          <h1>Getting started with Miyagi</h1>
          <p>
            {isProfessor
              ? 'Miyagi gives you one place to organize courses, connect public GitHub repositories, and understand which teams may need your attention.'
              : 'Miyagi gives you one place to find courses, deadlines, and the public GitHub activity connected to your assignments.'}
          </p>
          <p>You do not need to learn every part of the workspace at once. This guide covers the core workflow and explains what the activity signals mean.</p>
        </header>

        <section id="setup">
          <h2>{isProfessor ? 'Set up your first course' : 'Understand the student workspace'}</h2>
          <p>{isProfessor
            ? 'Start with the course itself, then add the work students will complete. Repository activity becomes available after public GitHub repositories are connected to an assignment.'
            : 'The student workspace is read-focused. It brings together deadlines, assignments, and the public GitHub activity connected to your team.'}</p>
          {!isProfessor && <>
            <h3>Student setup: just share your repository</h3>
            <p>Students do not need to configure anything inside Miyagi. Keep your GitHub repository public, send its URL to your professor, and make sure you commit with the same GitHub account you use to sign in to Miyagi.</p>
            <blockquote><strong>That’s all.</strong> Your professor connects the repository to the assignment. Miyagi then reads its public activity and can suggest the course when it recognizes you as a contributor—there is nothing to install, upload, or connect yourself.</blockquote>
          </>}
          <div className="docs-visual-guide">
            {isProfessor ? (
              <>
                <VisualStep number={1} title="Create a course" image="/docs/professor-create-course.webp" alt="Miyagi professor overview with the add course button circled">
                  Select the + beside Courses, name the course, and share its join code with your class.
                </VisualStep>
                <VisualStep number={2} title="Add an assignment" image="/docs/professor-add-assignment.webp" alt="Cp164 course page with the New assignment button circled">
                  Open the course, select New assignment, and add an optional due date.
                </VisualStep>
                <VisualStep number={3} title="Connect repositories" image="/docs/professor-import-repositories.webp" alt="Final project assignment page with the Import repos button circled">
                  Open the assignment and paste public GitHub repository URLs, one per line, or add one repository URL at a time.
                </VisualStep>
              </>
            ) : (
              <>
                <VisualStep number={1} title="Confirm how you joined the course" image="/docs/student-course-suggestion.webp" alt="Miyagi asking a student to confirm a course after finding their public GitHub activity">
                  When a professor connects a public GitHub repository, Miyagi checks its public contributors. If the GitHub account you used to sign in has commits in that repository and you are not already enrolled, Miyagi suggests the course. You are not joined automatically: choose Yes, join course to accept or Not my course to decline.
                </VisualStep>
                <VisualStep number={2} title="See what needs attention" image="/docs/student-overview.webp" alt="Miyagi student overview with an upcoming Final project deadline circled">
                  The overview surfaces upcoming deadlines and links back to your courses. It does not include professor setup controls.
                </VisualStep>
                <VisualStep number={3} title="Find courses and assignments" image="/docs/student-assignments.webp" alt="Cp164 student course page with the Final project assignment circled">
                  Open a course to see its assignments and due dates. Select an assignment to find the repositories connected by your professor.
                </VisualStep>
                <VisualStep number={4} title="Understand repository activity" image="/docs/student-activity.webp" alt="Student repository page with recent public GitHub activity circled">
                  A repository page explains who contributed, how recently the team worked, and which public commits were recorded.
                </VisualStep>
              </>
            )}
          </div>
        </section>

        <section id="navigate">
          <h2>Navigate the workspace</h2>
          <p>The main sidebar follows the same structure as your coursework. Courses contain assignments, and assignments contain connected repositories.</p>
          <ul>
            <li><strong>Overview:</strong> deadlines and setup issues that currently need action.</li>
            <li><strong>Courses:</strong> assignments, the course calendar, and current members.</li>
            <li><strong>Assignments:</strong> connected repositories and a weekly activity leaderboard.</li>
            <li><strong>Repositories:</strong> contributors, commit totals, and recent public activity.</li>
          </ul>
          <blockquote><strong>Tip:</strong> Press <kbd>⌘</kbd> <kbd>K</kbd> and type a course or assignment name to find it quickly.</blockquote>
        </section>

        <section id="activity">
          <h2>Read activity in context</h2>
          <p>Miyagi summarizes public commit activity so patterns are easier to spot. The weekly leaderboard is a starting point; open a repository to understand the work behind its position.</p>
          <table>
            <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td>Recent</td><td>Last commit was within 2 days</td></tr>
              <tr><td>Steady</td><td>Last commit was 3–6 days ago</td></tr>
              <tr><td>Needs a look</td><td>7+ days since a commit, or no commits yet</td></tr>
            </tbody>
          </table>
          <blockquote><strong>A signal is not a grade.</strong> Commit counts do not measure difficulty, quality, planning, pair work, or work completed outside GitHub.</blockquote>
        </section>

        <section id="privacy">
          <h2>GitHub access and privacy</h2>
          <p>Miyagi uses your public GitHub profile and public repository activity. Private repositories are not supported, and Miyagi does not request access to them.</p>
          <p>Your GitHub password is never stored by Miyagi. Authentication is handled through GitHub.</p>
          <p><a href="/privacy.html" target="_blank" rel="noreferrer">Read the privacy notice <ArrowRight /></a></p>
        </section>

        <section id="questions">
          <h2>Common questions</h2>
          {isProfessor ? (
            <>
              <h3>What do I enter when I add repositories?</h3>
              <p>Enter the complete URL of each public GitHub repository, such as <code>https://github.com/student/project</code>. Miyagi reads one repository URL at a time in the single-repository form, or one URL per line when you import a list. Private repositories and incomplete URLs are not supported.</p>
              <h3>Why is a student missing from the activity?</h3>
              <p>Confirm the student committed with the expected GitHub account and that the correct public repository is connected.</p>
              <h3>Can I preview the student workspace?</h3>
              <p>Yes. Open account settings and choose <strong>View as student</strong>. Exit the preview from the same place.</p>
            </>
          ) : (
            <>
              <h3>Where do I enter a course code?</h3>
              <p>Select the + beside <strong>Courses</strong> in the main sidebar, then enter the code from your professor.</p>
              <h3>Why can’t I see my repository?</h3>
              <p>Your professor connects repositories to assignments. Check that you opened the correct assignment, then ask them to verify the URL.</p>
              <h3>Why was I asked to confirm a course?</h3>
              <p>Miyagi may recognize your public GitHub activity in a submitted repository. You can accept or decline the suggestion.</p>
            </>
          )}
          <h3>Can one GitHub account have both roles?</h3>
          <p>No. A GitHub account is associated with one Miyagi role: professor or student.</p>
          <div className="docs-contact-support">
            <h2>Contact support</h2>
            <p>Send an enquiry to <a href="mailto:support@miyagi.app">support@miyagi.app</a>.</p>
            <form onSubmit={sendEnquiry}>
              <label htmlFor="support-enquiry">How can we help?</label>
              <Textarea
                id="support-enquiry"
                value={enquiry}
                onChange={(event) => setEnquiry(event.target.value)}
                placeholder="Describe what you were trying to do and where you got stuck…"
                rows={6}
                required
              />
              <div>
                <small>This opens a pre-filled message in your email app.</small>
                <Button type="submit" variant="primary" disabled={!enquiry.trim()}><Mail /> Send enquiry</Button>
              </div>
            </form>
          </div>
        </section>
      </article>

    </main>
  )
}

function VisualStep({ number, title, image, alt, children }: { number: number; title: string; image: string; alt: string; children: React.ReactNode }) {
  return (
    <div className="docs-visual-step">
      <h3>{number}. {title}</h3>
      <p>{children}</p>
      <figure><img src={image} alt={alt} loading="lazy" /></figure>
    </div>
  )
}

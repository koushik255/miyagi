import { ArrowRight, BookOpen, GitBranch, GraduationCap, ShieldCheck } from 'lucide-react'
import { getApiBase } from '../../api'
import { Button } from '../../components/ui'

export function AuthScreen({ admin = false }: { admin?: boolean }) {
  function continueWithGithub(role: 'professor' | 'student') {
    const returnTo = `${window.location.pathname}${window.location.search}`
    window.location.href = `${getApiBase()}/auth/${role}/github/start?returnTo=${encodeURIComponent(returnTo)}`
  }

  return <main className="l-auth">
    <section className="l-auth-story">
      <a className="l-brand" href="/">miyagi</a>
      <div><span className="l-kicker">Course operations, simplified</span><h1>See what matters.<br />Skip what doesn’t.</h1><p>A quiet workspace for assignments, public repositories, and the signals that need your attention.</p></div>
      <ul><li><GitBranch /> Public repository activity</li><li><ShieldCheck /> Public-profile access only</li><li><BookOpen /> Courses kept clear and focused</li></ul>
    </section>
    <section className="l-auth-panel l-role-auth">
      <div className="l-role-picker">
        <header><span className="l-kicker">Continue with GitHub</span><h2>{admin ? 'Professor login' : 'Welcome to Miyagi'}</h2><p>{admin ? 'Sign in with an authorized professor GitHub account.' : 'Sign in to join your course and view the projects connected to your work.'}</p></header>
        <div className="l-role-options">
          {admin
            ? <article><span className="l-role-icon"><ShieldCheck /></span><div><h3>Professor</h3><p>Manage courses with an account approved by the Miyagi owner.</p></div><Button variant="primary" size="lg" onClick={() => continueWithGithub('professor')}>Continue with GitHub <ArrowRight /></Button></article>
            : <article className="l-student-option"><span className="l-role-icon"><GraduationCap /></span><div><h3>Student</h3><p>Join a course and see the public repositories connected to your work.</p></div><Button variant="primary" size="lg" onClick={() => continueWithGithub('student')}>Continue as student <ArrowRight /></Button></article>}
        </div>
        <p className="l-auth-note"><GitBranch /> Miyagi requests public GitHub profile access only. Private repositories are not supported.</p>
      </div>
      <footer><span>{admin ? <a href="/">Student login</a> : 'One GitHub account can have one Miyagi role.'}</span><nav><a href="/privacy.html">Privacy</a><a href="mailto:support@miyagi.app">Support</a></nav></footer>
    </section>
  </main>
}

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button, Card } from './ui'

type State = { failed: boolean }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Miyagi]', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="fatal-error" role="alert">
        <Card>
          <AlertCircle size={22} />
          <h1>Something went wrong</h1>
          <p>Your data is safe. Reload Miyagi to try again. If this continues, contact support.</p>
          <div><Button variant="primary" onClick={() => window.location.reload()}>Reload</Button><a href="mailto:support@miyagi.app">Contact support</a></div>
        </Card>
      </main>
    )
  }
}

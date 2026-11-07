// Signed-out screen: app name and one "Sign in with Google" button.
interface Props {
  onSignIn: () => void
  busy: boolean
  /** e.g. "This account isn't authorized." or a sign-in error. */
  message: string | null
}

export default function SignIn({ onSignIn, busy, message }: Props) {
  return (
    <main className="center stack signin">
      <h1>Workouts</h1>
      <button className="btn primary" onClick={onSignIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
    </main>
  )
}

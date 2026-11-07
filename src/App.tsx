import AuthGate, { useAuth } from './state/AuthGate'

// Step 3–4 placeholder for the signed-in app. The store, tab bar and screens
// replace this in step 5; sign-out then moves to the Plan tab as the spec says.
function SignedIn() {
  const { user, signOut } = useAuth()
  return (
    <main className="app stack">
      <h1>Workouts</h1>
      <p>Signed in as {user.email}.</p>
      <p className="muted">Sign-in works. The app screens come in the next steps.</p>
      <button className="btn" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}

export default function App() {
  return (
    <AuthGate>
      <SignedIn />
    </AuthGate>
  )
}

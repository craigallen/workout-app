// Sign-in screen vs app. Access is decided by firestore.rules (the single
// source of truth for the allowed email): after Google sign-in, the gate reads
// users/{uid} from the server. "permission-denied" means this account isn't
// allowed, so it is signed out and told so.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { FirebaseError } from 'firebase/app'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDocFromServer } from 'firebase/firestore'
import { auth, db, googleProvider } from '../lib/firebase'
import SignIn from '../screens/SignIn'

/** Remembers the last account the server allowed, so the app can open offline. */
const AUTHORIZED_KEY = 'workouts.authorizedUid'

function readAuthorized(): string | null {
  try {
    return localStorage.getItem(AUTHORIZED_KEY)
  } catch {
    return null
  }
}

function writeAuthorized(uid: string | null) {
  try {
    if (uid) localStorage.setItem(AUTHORIZED_KEY, uid)
    else localStorage.removeItem(AUTHORIZED_KEY)
  } catch {
    // Storage unavailable (private mode): the app still works online.
  }
}

type GateState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'checking'; user: User }
  | { status: 'offlineUnknown'; user: User }
  | { status: 'authorized'; user: User }

interface AuthValue {
  user: User
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** The signed-in, authorized user. Only usable inside AuthGate's children. */
export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthGate>')
  return value
}

function signInMessage(err: unknown): string | null {
  const code = err instanceof FirebaseError ? err.code : ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null // the user closed the popup, or tapped twice
    case 'auth/popup-blocked':
      return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/unauthorized-domain':
      return "This site's domain isn't in Firebase's authorized domains yet (Authentication > Settings > Authorized domains)."
    case 'auth/network-request-failed':
      return 'No connection. Sign-in needs a signal the first time.'
    default:
      return `Sign-in failed${code ? ` (${code})` : ''}. Please try again.`
  }
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checkRun = useRef(0)

  const check = useCallback(async (user: User) => {
    const run = ++checkRun.current
    const knownGood = readAuthorized() === user.uid
    // A previously allowed account opens straight away (works offline);
    // the server check below still runs and can revoke access.
    setState(knownGood ? { status: 'authorized', user } : { status: 'checking', user })
    try {
      await getDocFromServer(doc(db, 'users', user.uid))
      if (run !== checkRun.current) return
      writeAuthorized(user.uid)
      setState({ status: 'authorized', user })
    } catch (err) {
      if (run !== checkRun.current) return
      if (err instanceof FirebaseError && err.code === 'permission-denied') {
        writeAuthorized(null)
        setNotice(`This account${user.email ? ` (${user.email})` : ''} isn't authorized.`)
        await signOut(auth)
        return
      }
      // Offline or server unreachable: keep a known account in, otherwise ask to retry.
      if (!knownGood) setState({ status: 'offlineUnknown', user })
    }
  }, [])

  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) void check(user)
        else {
          checkRun.current++
          setState({ status: 'signedOut' })
        }
      }),
    [check],
  )

  // Called straight from the button's click handler, with no await before
  // signInWithPopup, so mobile browsers treat the popup as user-initiated.
  const handleSignIn = () => {
    setNotice(null)
    setBusy(true)
    signInWithPopup(auth, googleProvider)
      .catch((err: unknown) => setNotice(signInMessage(err)))
      .finally(() => setBusy(false))
  }

  const handleSignOut = useCallback(async () => {
    writeAuthorized(null)
    await signOut(auth)
  }, [])

  switch (state.status) {
    case 'loading':
    case 'checking':
      return <div className="center muted">Loading…</div>
    case 'signedOut':
      return <SignIn onSignIn={handleSignIn} busy={busy} message={notice} />
    case 'offlineUnknown':
      return (
        <div className="center stack">
          <p>Can't reach the server to check this account. Check your connection.</p>
          <button className="btn primary" onClick={() => void check(state.user)}>
            Try again
          </button>
          <button className="btn" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      )
    case 'authorized':
      return <AuthContext.Provider value={{ user: state.user, signOut: handleSignOut }}>{children}</AuthContext.Provider>
  }
}

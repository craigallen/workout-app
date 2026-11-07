// Firebase web config from VITE_FIREBASE_* env vars. Kept apart from
// firebase.ts so a missing config can be reported without initializing Firebase.
const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const REQUIRED = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const

/** Required env vars that are missing, so the app can say what to fix. */
export const missingConfig: string[] = REQUIRED.filter((k) => !env[k])

/**
 * Redirect sign-in works on phones without workarounds only when the app is
 * served from the auth domain (PROJECT_ID.firebaseapp.com on Firebase Hosting).
 * Elsewhere (localhost) the popup is used.
 */
export function shouldUseRedirect(hostname: string = location.hostname): boolean {
  return !!firebaseConfig.authDomain && hostname === firebaseConfig.authDomain
}

/**
 * Hosting also serves PROJECT_ID.web.app; send that to the auth domain so
 * sign-in always runs same-origin. Returns the URL to go to, or null.
 */
export function authDomainRedirect(loc: Pick<Location, 'hostname' | 'pathname' | 'search' | 'hash'> = location): string | null {
  const { projectId, authDomain } = firebaseConfig
  if (!projectId || !authDomain?.endsWith('.firebaseapp.com')) return null
  if (loc.hostname !== `${projectId}.web.app`) return null
  return `https://${authDomain}${loc.pathname}${loc.search}${loc.hash}`
}

// Firebase setup: app, Auth (Google) and Firestore with the persistent offline cache.
// Checked against the installed firebase@13.2.0 type definitions and the Firebase
// docs pages "Access data offline" and "Best practices for using signInWithRedirect"
// (both last updated 2026-11-05).
import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

export const googleProvider = new GoogleAuthProvider()
// Always show the account chooser, so a second Google account can be picked.
googleProvider.setCustomParameters({ prompt: 'select_account' })

// Offline persistence is off by default on the web. Turn on the IndexedDB
// cache with multi-tab support, so the app loads and saves with no signal.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})

import { afterEach, describe, expect, it, vi } from 'vitest'

async function load(env: Record<string, string>) {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('./firebaseConfig')
}

const hosted = { VITE_FIREBASE_PROJECT_ID: 'my-workouts', VITE_FIREBASE_AUTH_DOMAIN: 'my-workouts.firebaseapp.com' }
const loc = (hostname: string) => ({ hostname, pathname: '/', search: '?x=1', hash: '#h' })

afterEach(() => vi.unstubAllEnvs())

describe('hosting domain handling', () => {
  it('uses redirect sign-in only on the auth domain', async () => {
    const { shouldUseRedirect } = await load(hosted)
    expect(shouldUseRedirect('my-workouts.firebaseapp.com')).toBe(true)
    expect(shouldUseRedirect('localhost')).toBe(false)
    expect(shouldUseRedirect('my-workouts.web.app')).toBe(false)
  })

  it('sends web.app visitors to the firebaseapp.com address, keeping the path', async () => {
    const { authDomainRedirect } = await load(hosted)
    expect(authDomainRedirect(loc('my-workouts.web.app'))).toBe('https://my-workouts.firebaseapp.com/?x=1#h')
    expect(authDomainRedirect(loc('my-workouts.firebaseapp.com'))).toBeNull()
    expect(authDomainRedirect(loc('localhost'))).toBeNull()
  })

  it('reports missing config', async () => {
    const { missingConfig } = await load({ VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: '' })
    expect(missingConfig).toEqual(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_APP_ID'])
  })
})

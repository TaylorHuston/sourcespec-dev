export type User = { id: string; username: string }

async function authRequest(path: string, options?: RequestInit): Promise<{ user: User | null }> {
  const response = await fetch(`/api/auth${path}`, { credentials: 'same-origin', cache: 'no-store', ...options })
  const body = await response.json() as { user?: User | null; error?: string }
  if (!response.ok) throw new Error(body.error ?? 'Could not sign in. Try again.')
  return { user: body.user ?? null }
}

export function currentUser(): Promise<User | null> {
  return authRequest('/session').then((body) => body.user)
}

export function signIn(username: string, password: string, register: boolean): Promise<User> {
  return authRequest(register ? '/register' : '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(({ user }) => {
    if (!user) throw new Error('Could not sign in. Try again.')
    return user
  })
}

export async function signOut(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Could not sign out. Try again.')
}

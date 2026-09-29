import type { IncomingMessage, ServerResponse } from 'node:http'
import { TLSSocket } from 'node:tls'
import { RequestError, checkOrigin, readJson, sendError, sendJson, sessionToken } from './todo-api.ts'
import type { TodoStore } from './todo-store.ts'

function credentials(body: unknown): { username: string; password: string } {
  if (!body || typeof body !== 'object' || !('username' in body) || !('password' in body) ||
      typeof body.username !== 'string' || typeof body.password !== 'string') {
    throw new RequestError(400, 'Username and password are required')
  }
  if (Object.keys(body).some((key) => key !== 'username' && key !== 'password')) {
    throw new RequestError(400, 'Unexpected credential field')
  }
  const username = body.username.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_-]{2,31}$/.test(username) || body.password.length < 8 || body.password.length > 128) {
    throw new RequestError(400, 'Use a 3–32 character username and a password of 8–128 characters')
  }
  return { username, password: body.password }
}

function setSessionCookie(response: ServerResponse, token: string, secure: boolean): void {
  response.setHeader('Set-Cookie', `ss_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? '; Secure' : ''}`)
}

export function createAuthHandler(store: TodoStore) {
  return async function handleAuthRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname === '/session' && request.method === 'GET') {
        const token = sessionToken(request)
        sendJson(response, 200, { user: token ? store.sessionUser(token) : null })
        return
      }
      if (request.method === 'POST' && (pathname === '/register' || pathname === '/login')) {
        checkOrigin(request)
        const { username, password } = credentials(await readJson(request))
        const user = pathname === '/register' ? store.register(username, password) : store.authenticate(username, password)
        if (!user) throw new RequestError(pathname === '/register' ? 409 : 401,
          pathname === '/register' ? 'Username already taken' : 'Invalid username or password')
        setSessionCookie(response, store.createSession(user.id), request.socket instanceof TLSSocket)
        sendJson(response, pathname === '/register' ? 201 : 200, { user })
        return
      }
      if (pathname === '/logout' && request.method === 'POST') {
        checkOrigin(request)
        const token = sessionToken(request)
        if (token) store.endSession(token)
        response.writeHead(204, {
          'Cache-Control': 'no-store',
          'Set-Cookie': `ss_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${request.socket instanceof TLSSocket ? '; Secure' : ''}`,
        })
        response.end()
        return
      }
      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      sendError(response, error)
    }
  }
}

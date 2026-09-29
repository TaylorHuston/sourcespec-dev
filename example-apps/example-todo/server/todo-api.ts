import type { IncomingMessage, ServerResponse } from 'node:http'
import { TLSSocket } from 'node:tls'
import type { TodoStore } from './todo-store.ts'

export class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 16_384) throw new RequestError(413, 'Request body is too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new RequestError(400, 'Invalid JSON')
  }
}

export function checkOrigin(request: IncomingMessage): void {
  if (!request.headers.origin) return
  const expected = `${request.socket instanceof TLSSocket ? 'https' : 'http'}://${request.headers.host}`
  if (request.headers.origin !== expected) throw new RequestError(403, 'Origin not allowed')
}

export function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof RequestError) {
    sendJson(response, error.status, { error: error.message })
  } else {
    console.error('Local API error', error)
    sendJson(response, 500, { error: 'Could not process request' })
  }
}

export function sessionToken(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('ss_session='))
  const token = cookie?.slice('ss_session='.length)
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function createTodoHandler(store: TodoStore) {
  return async function handleTodoRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method ?? '')) {
        sendJson(response, 404, { error: 'Not found' })
        return
      }
      if (request.method !== 'GET') checkOrigin(request)
      const token = sessionToken(request)
      const user = token ? store.sessionUser(token) : null
      if (!user) throw new RequestError(401, 'Sign in to access tasks')
      if (pathname === '/' && request.method === 'GET') {
        sendJson(response, 200, store.listTodos(user.id))
        return
      }
      if (pathname === '/' && request.method === 'POST') {
        const body = await readJson(request)
        if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string' || !body.text.trim()) {
          throw new RequestError(400, 'Task text is required')
        }
        sendJson(response, 201, store.createTodo(user.id, body.text.trim()))
        return
      }
      const match = /^\/([^/]+)\/?$/.exec(pathname)
      if (match && (request.method === 'PATCH' || request.method === 'DELETE')) {
        let id: string
        try {
          id = decodeURIComponent(match[1])
        } catch {
          throw new RequestError(400, 'Invalid task ID')
        }
        if (request.method === 'PATCH') {
          const body = await readJson(request)
          if (!body || typeof body !== 'object' || !('completed' in body) || typeof body.completed !== 'boolean') {
            throw new RequestError(400, 'Completed must be a boolean')
          }
          const updated = store.setTodoCompleted(user.id, id, body.completed)
          if (!updated) throw new RequestError(404, 'Task not found')
          sendJson(response, 200, updated)
        } else if (store.removeTodo(user.id, id)) {
          response.writeHead(204, { 'Cache-Control': 'no-store' })
          response.end()
        } else {
          throw new RequestError(404, 'Task not found')
        }
        return
      }
      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      sendError(response, error)
    }
  }
}

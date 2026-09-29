import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TodoStore } from './todo-store.ts'

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
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

export function createTodoHandler(store: TodoStore) {
  return async function handleTodoRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
      if (pathname === '/' && request.method === 'GET') {
        sendJson(response, 200, store.listTodos())
        return
      }
      if (pathname === '/' && request.method === 'POST') {
        const body = await readJson(request)
        if (!body || typeof body !== 'object' || !('text' in body) || typeof body.text !== 'string' || !body.text.trim()) {
          throw new RequestError(400, 'Task text is required')
        }
        sendJson(response, 201, store.createTodo(body.text.trim()))
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
          const updated = store.setTodoCompleted(id, body.completed)
          if (!updated) throw new RequestError(404, 'Task not found')
          sendJson(response, 200, updated)
        } else if (store.removeTodo(id)) {
          response.writeHead(204, { 'Cache-Control': 'no-store' })
          response.end()
        } else {
          throw new RequestError(404, 'Task not found')
        }
        return
      }
      sendJson(response, 404, { error: 'Not found' })
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { error: error.message })
      } else {
        console.error('Todo API error', error)
        sendJson(response, 500, { error: 'Could not process task' })
      }
    }
  }
}

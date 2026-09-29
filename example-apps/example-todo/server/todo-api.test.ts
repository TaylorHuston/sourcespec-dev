import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createAuthHandler } from './auth-api.ts'
import { createTodoHandler } from './todo-api.ts'
import { openTodoStore } from './todo-store.ts'

it('scopes tasks to users and persists them across SQLite connections', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sourcespec-todo-'))
  let store = openTodoStore(join(directory, 'todos.sqlite'))
  try {
    const alice = store.register('alice', 'password-123')!
    const bob = store.register('bob', 'password-456')!
    const created = store.createTodo(alice.id, 'Keep this task')
    store.createTodo(bob.id, 'Another task')
    expect(store.setTodoCompleted(bob.id, created.id, true)).toBeNull()
    expect(store.removeTodo(bob.id, created.id)).toBe(false)
    store.setTodoCompleted(alice.id, created.id, true)
    const token = store.createSession(alice.id)
    store.close()
    store = openTodoStore(join(directory, 'todos.sqlite'))
    expect(store.sessionUser(token)).toEqual(alice)
    expect(store.listTodos(alice.id)).toEqual([{ ...created, completed: true }])
    expect(store.listTodos(bob.id)).toHaveLength(1)
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('preserves old single-user tasks and assigns them to the first registered user', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sourcespec-legacy-'))
  const filename = join(directory, 'todos.sqlite')
  const old = new DatabaseSync(filename)
  old.exec("CREATE TABLE todos (id TEXT PRIMARY KEY, text TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0)")
  old.prepare('INSERT INTO todos (id, text) VALUES (?, ?)').run('old-task', 'Keep me')
  old.close()
  const store = openTodoStore(filename)
  try {
    const beforeClaim = new DatabaseSync(filename)
    expect(beforeClaim.prepare('SELECT user_id FROM todos WHERE id = ?').get('old-task')).toEqual({ user_id: null })
    beforeClaim.close()
    const first = store.register('alice', 'password-123')!
    const second = store.register('bob', 'password-456')!
    expect(store.listTodos(first.id)).toEqual([{ id: 'old-task', text: 'Keep me', completed: false }])
    expect(store.listTodos(second.id)).toEqual([])
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('requires a session and keeps HTTP tasks private to their owner', async () => {
  const store = openTodoStore(':memory:')
  const auth = createAuthHandler(store)
  const todos = createTodoHandler(store)
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/api/auth')) {
      request.url = request.url.slice('/api/auth'.length) || '/'
      void auth(request, response)
    } else if (request.url?.startsWith('/api/todos')) {
      request.url = request.url.slice('/api/todos'.length) || '/'
      void todos(request, response)
    } else {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No local test server')
    const url = `http://127.0.0.1:${address.port}`
    const post = (path: string, body: unknown, cookie?: string) => fetch(`${url}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    })
    expect((await fetch(`${url}/api/todos`)).status).toBe(401)
    expect((await post('/api/todos', { text: 'unowned' })).status).toBe(401)
    expect((await post('/api/auth/register', { username: 'a', password: 'short' })).status).toBe(400)
    expect((await post('/api/auth/register', { username: 'alice', password: 'password-123', extra: true })).status).toBe(400)
    const alice = await post('/api/auth/register', { username: 'Alice', password: 'password-123' })
    expect(alice.status).toBe(201)
    expect(await alice.json()).toMatchObject({ user: { username: 'alice' } })
    const aliceCookie = alice.headers.get('set-cookie')!.split(';')[0]
    expect(alice.headers.get('set-cookie')).toContain('HttpOnly')
    expect(alice.headers.get('set-cookie')).toContain('SameSite=Strict')
    expect((await post('/api/auth/register', { username: 'alice', password: 'password-123' })).status).toBe(409)
    expect((await post('/api/auth/login', { username: 'alice', password: 'wrong-password' })).status).toBe(401)
    expect((await post('/api/auth/login', { username: 'missing', password: 'password-123' })).status).toBe(401)
    expect((await fetch(`${url}/api/auth/session`, { headers: { Cookie: aliceCookie } })).status).toBe(200)
    const bob = await post('/api/auth/register', { username: 'bob', password: 'password-456' })
    const bobCookie = bob.headers.get('set-cookie')!.split(';')[0]
    const invalid = await post('/api/todos', { text: '  ' }, aliceCookie)
    expect(invalid.status).toBe(400)
    const created = await post('/api/todos', { text: '  Buy milk  ' }, aliceCookie)
    expect(created.status).toBe(201)
    const todo = await created.json() as { id: string; text: string; completed: boolean }
    expect(todo).toMatchObject({ text: 'Buy milk', completed: false })
    expect(await (await fetch(`${url}/api/todos`, { headers: { Cookie: bobCookie } })).json()).toEqual([])
    const patch = (cookie: string, completed: unknown) => fetch(`${url}/api/todos/${todo.id}`, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ completed }),
    })
    expect((await patch(bobCookie, true)).status).toBe(404)
    expect((await patch(aliceCookie, 'true')).status).toBe(400)
    expect((await patch(aliceCookie, true)).status).toBe(200)
    expect((await fetch(`${url}/api/todos/${todo.id}`, { method: 'DELETE', headers: { Cookie: bobCookie } })).status).toBe(404)
    expect((await fetch(`${url}/api/todos`, { headers: { Cookie: aliceCookie } })).status).toBe(200)
    const listed = await fetch(`${url}/api/todos`, { headers: { Cookie: aliceCookie } })
    expect(await listed.json()).toEqual([{ ...todo, completed: true }])
    expect((await patch(aliceCookie, false)).status).toBe(200)
    const reopened = await fetch(`${url}/api/todos`, { headers: { Cookie: aliceCookie } })
    expect(await reopened.json()).toEqual([{ ...todo, completed: false }])
    expect((await fetch(`${url}/api/todos/${todo.id}`, { method: 'DELETE', headers: { Cookie: aliceCookie } })).status).toBe(204)
    const empty = await fetch(`${url}/api/todos`, { headers: { Cookie: aliceCookie } })
    expect(await empty.json()).toEqual([])
    expect((await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Cookie: aliceCookie } })).status).toBe(204)
    expect((await fetch(`${url}/api/todos`, { headers: { Cookie: aliceCookie } })).status).toBe(401)
    const login = await post('/api/auth/login', { username: 'alice', password: 'password-123' })
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toContain('HttpOnly')
    expect((await fetch(`${url}/api/todos`, { headers: { Cookie: login.headers.get('set-cookie')!.split(';')[0] } })).status).toBe(200)
    expect((await fetch(`${url}/api/todos`, { headers: { Cookie: bobCookie, Origin: 'https://evil.example' } })).status).toBe(200)
    expect((await post('/api/todos', { text: 'blocked' }, bobCookie)).status).toBe(201)
    expect((await fetch(`${url}/api/todos`, { method: 'POST', headers: { Cookie: bobCookie, Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'blocked' }) })).status).toBe(403)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    store.close()
  }
})

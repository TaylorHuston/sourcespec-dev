import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { createTodoHandler } from './todo-api.ts'
import { openTodoStore } from './todo-store.ts'

it('keeps tasks and completion state after reopening the SQLite database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sourcespec-todo-'))
  let store = openTodoStore(join(directory, 'todos.sqlite'))
  try {
    const created = store.createTodo('Keep this task')
    store.setTodoCompleted(created.id, true)
    store.close()
    store = openTodoStore(join(directory, 'todos.sqlite'))

    expect(store.listTodos()).toEqual([{ ...created, completed: true }])
  } finally {
    store.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

it('validates and persists create, list, update, and delete requests', async () => {
  const store = openTodoStore(':memory:')
  const server = createServer(createTodoHandler(store))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No local test server')
    const url = `http://127.0.0.1:${address.port}/`

    const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '  ' }) })
    expect(invalid.status).toBe(400)

    const created = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '  Buy milk  ' }) })
    expect(created.status).toBe(201)
    const todo = await created.json() as { id: string; text: string; completed: boolean }
    expect(todo.text).toBe('Buy milk')
    expect(todo.completed).toBe(false)

    const listed = await fetch(url)
    expect(await listed.json()).toEqual([todo])

    const invalidUpdate = await fetch(`${url}${todo.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: 'true' }) })
    expect(invalidUpdate.status).toBe(400)

    const updated = await fetch(`${url}${todo.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: true }) })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ ...todo, completed: true })

    const deleted = await fetch(`${url}${todo.id}`, { method: 'DELETE' })
    expect(deleted.status).toBe(204)
    expect((await fetch(`${url}${todo.id}`, { method: 'DELETE' })).status).toBe(404)
    expect(await (await fetch(url)).json()).toEqual([])
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    store.close()
  }
})

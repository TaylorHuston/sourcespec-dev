import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export type Todo = { id: string; text: string; completed: boolean }

export function openTodoStore(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL CHECK (length(trim(text)) > 0),
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
    )
  `)

  function toTodo(row: Record<string, unknown>): Todo {
    return { id: String(row.id), text: String(row.text), completed: row.completed === 1 }
  }

  function listTodos(): Todo[] {
    return db.prepare('SELECT id, text, completed FROM todos ORDER BY rowid').all().map(toTodo)
  }

  function createTodo(text: string): Todo {
    const todo = { id: randomUUID(), text, completed: false }
    db.prepare('INSERT INTO todos (id, text) VALUES (?, ?)').run(todo.id, todo.text)
    return todo
  }

  function setTodoCompleted(id: string, completed: boolean): Todo | null {
    const result = db.prepare('UPDATE todos SET completed = ? WHERE id = ?').run(Number(completed), id)
    const row = result.changes ? db.prepare('SELECT id, text, completed FROM todos WHERE id = ?').get(id) : undefined
    return row ? toTodo(row) : null
  }

  function removeTodo(id: string): boolean {
    return db.prepare('DELETE FROM todos WHERE id = ?').run(id).changes > 0
  }

  return { listTodos, createTodo, setTodoCompleted, removeTodo, close: () => db.close() }
}

export type TodoStore = ReturnType<typeof openTodoStore>

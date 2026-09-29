import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Todo = { id: string; text: string; completed: boolean }
export type User = { id: string; username: string }
const sessionLifetime = 7 * 24 * 60 * 60 * 1000

function passwordHash(password: string, salt = randomBytes(16).toString('hex')): string {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

function validPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':')
  const actual = scryptSync(password, salt, 64)
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'))
}

const dummyPasswordHash = passwordHash('not-a-real-password', '00000000000000000000000000000000')

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function openTodoStore(filename: string) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
  `)
  const hasTodos = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'todos'").get()
  if (!hasTodos) {
    db.exec(`
      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))
      );
    `)
  } else if (!db.prepare('PRAGMA table_info(todos)').all().some((column) => column.name === 'user_id')) {
    // Preserve tasks from the original single-user example; the first registered user claims them.
    db.exec('ALTER TABLE todos ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE')
  }
  db.exec('CREATE INDEX IF NOT EXISTS todos_by_user ON todos(user_id)')

  function toTodo(row: Record<string, unknown>): Todo {
    return { id: String(row.id), text: String(row.text), completed: row.completed === 1 }
  }

  function register(username: string, password: string): User | null {
    const normalized = username.trim().toLowerCase()
    const user = { id: randomUUID(), username: normalized }
    const hash = passwordHash(password)
    db.exec('BEGIN IMMEDIATE')
    try {
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(normalized)) {
        db.exec('ROLLBACK')
        return null
      }
      const firstUser = (db.prepare('SELECT COUNT(*) AS total FROM users').get() as { total: number }).total === 0
      db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(user.id, normalized, hash)
      if (firstUser) db.prepare('UPDATE todos SET user_id = ? WHERE user_id IS NULL').run(user.id)
      db.exec('COMMIT')
      return user
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function authenticate(username: string, password: string): User | null {
    const row = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
      .get(username.trim().toLowerCase()) as { id: string; username: string; password_hash: string } | undefined
    // Equal work for unknown usernames avoids leaking which names exist through an obvious timing difference.
    const hash = row?.password_hash ?? dummyPasswordHash
    return validPassword(password, hash) && row ? { id: row.id, username: row.username } : null
  }

  function createSession(userId: string): string {
    const token = randomBytes(32).toString('hex')
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash(token), userId, Date.now() + sessionLifetime)
    return token
  }

  function sessionUser(token: string): User | null {
    const row = db.prepare(`SELECT users.id, users.username FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
      .get(tokenHash(token), Date.now()) as User | undefined
    return row ?? null
  }

  function endSession(token: string): void {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
  }

  function listTodos(userId: string): Todo[] {
    return db.prepare('SELECT id, text, completed FROM todos WHERE user_id = ? ORDER BY rowid').all(userId).map(toTodo)
  }

  function createTodo(userId: string, text: string): Todo {
    const todo = { id: randomUUID(), text, completed: false }
    db.prepare('INSERT INTO todos (id, user_id, text) VALUES (?, ?, ?)').run(todo.id, userId, todo.text)
    return todo
  }

  function setTodoCompleted(userId: string, id: string, completed: boolean): Todo | null {
    const result = db.prepare('UPDATE todos SET completed = ? WHERE id = ? AND user_id = ?')
      .run(Number(completed), id, userId)
    const row = result.changes
      ? db.prepare('SELECT id, text, completed FROM todos WHERE id = ? AND user_id = ?').get(id, userId)
      : undefined
    return row ? toTodo(row) : null
  }

  function removeTodo(userId: string, id: string): boolean {
    return db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, userId).changes > 0
  }

  return { register, authenticate, createSession, sessionUser, endSession,
    listTodos, createTodo, setTodoCompleted, removeTodo, close: () => db.close() }
}

export type TodoStore = ReturnType<typeof openTodoStore>

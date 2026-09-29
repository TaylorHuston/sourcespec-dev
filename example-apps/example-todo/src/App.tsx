import { useEffect, useState, type FormEvent } from 'react'
import { currentUser, signIn, signOut, type User } from './auth-api'
import {
  createTodo,
  listTodos,
  removeTodo as deleteTodo,
  setTodoCompleted,
  type Todo,
} from './todo-api'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [register, setRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remaining = todos.filter((todo) => !todo.completed).length

  useEffect(() => {
    let active = true
    currentUser().then((sessionUser) => {
      if (active) setUser(sessionUser)
    }).catch(() => {
      if (active) setAuthError('Could not check your session. Refresh to try again.')
    }).finally(() => {
      if (active) setAuthLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true)
    setLoadFailed(false)
    listTodos().then((items) => {
      if (active) setTodos(items)
    }).catch(() => {
      if (active) {
        setLoadFailed(true)
        setError('Could not load tasks. Refresh the page to retry.')
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [user?.id])

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (authBusy) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const signedIn = await signIn(username.trim(), password, register)
      setTodos([])
      setLoading(true)
      setError(null)
      setUser(signedIn)
      setPassword('')
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : 'Could not sign in. Try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function logOut() {
    if (authBusy || busy) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      await signOut()
      setUser(null)
      setTodos([])
      setDraft('')
      setLoading(true)
      setError(null)
      setPassword('')
      setRegister(false)
    } catch {
      setAuthError('Could not sign out. Try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy || loading || loadFailed || !user) return
    setBusy(true)
    setError(null)
    try {
      const todo = await createTodo(text)
      setTodos((current) => [...current, todo])
      setDraft('')
    } catch {
      setError('Could not add task. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleTodo(id: string) {
    const todo = todos.find((item) => item.id === id)
    if (!todo || busy || !user) return
    setBusy(true)
    setError(null)
    try {
      const updated = await setTodoCompleted(id, !todo.completed)
      setTodos((current) => current.map((item) => item.id === id ? updated : item))
    } catch {
      setError('Could not update task. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function removeTodo(id: string) {
    if (busy || !user) return
    setBusy(true)
    setError(null)
    try {
      await deleteTodo(id)
      setTodos((current) => current.filter((todo) => todo.id !== id))
    } catch {
      setError('Could not remove task. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) return <main className="app"><h1>Todo list</h1><p role="status">Checking session…</p></main>

  if (!user) return (
    <main className="app">
      <h1>Todo list</h1>
      <p className="intro">Sign in to see your saved tasks. New here? Create a local account.</p>
      <form className="auth-form" onSubmit={submitCredentials}>
        <h2>{register ? 'Create account' : 'Sign in'}</h2>
        <label htmlFor="username">Username</label>
        <input id="username" name="username" value={username} onChange={(event) => setUsername(event.target.value)}
          autoComplete="username" required minLength={3} maxLength={32} disabled={authBusy} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} maxLength={128}
          disabled={authBusy} />
        {authError && <p role="alert">{authError}</p>}
        <button type="submit" disabled={authBusy}>{authBusy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="text-button" disabled={authBusy}
          onClick={() => { setRegister(!register); setAuthError(null) }}>
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </main>
  )

  return (
    <main className="app">
      <div className="app-header">
        <div><h1>Todo list</h1><p className="intro">Tasks for {user.username} are saved in a local SQLite database.</p></div>
        <button type="button" className="text-button" onClick={logOut} disabled={authBusy || busy}>Sign out</button>
      </div>
      {authError && <p role="alert">{authError}</p>}
      <form className="add-form" onSubmit={addTodo}>
        <label htmlFor="new-todo">New task</label>
        <div className="add-controls">
          <input id="new-todo" type="text" value={draft} onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs doing?" disabled={loading || loadFailed || busy} />
          <button type="submit" disabled={loading || loadFailed || busy || !draft.trim()}>Add task</button>
        </div>
      </form>
      <section aria-labelledby="tasks-heading">
        <div className="list-heading">
          <h2 id="tasks-heading">Tasks</h2>
          <span role="status">{loading ? 'Loading…' : loadFailed ? 'Unavailable' : `${remaining} remaining`}</span>
        </div>
        {error && <p role="alert">{error}</p>}
        {loading || loadFailed ? null : todos.length === 0 ? (
          <p className="empty">No tasks yet. Add one above.</p>
        ) : (
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id}>
                <label className="todo-label">
                  <input type="checkbox" checked={todo.completed} onChange={() => toggleTodo(todo.id)} disabled={busy} />
                  <span className={todo.completed ? 'completed' : ''}>{todo.text}</span>
                </label>
                <button type="button" className="remove" onClick={() => removeTodo(todo.id)} disabled={busy}
                  aria-label={`Remove ${todo.text}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

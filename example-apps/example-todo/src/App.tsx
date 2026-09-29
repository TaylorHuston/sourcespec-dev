import { useEffect, useState, type FormEvent } from 'react'
import {
  createTodo,
  listTodos,
  removeTodo as deleteTodo,
  setTodoCompleted,
  type Todo,
} from './todo-api'

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remaining = todos.filter((todo) => !todo.completed).length

  useEffect(() => {
    let active = true
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
  }, [])

  async function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy || loading || loadFailed) return

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
    if (!todo || busy) return
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
    if (busy) return
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

  return (
    <main className="app">
      <h1>Todo list</h1>
      <p className="intro">Tasks are saved in a local SQLite database.</p>

      <form className="add-form" onSubmit={addTodo}>
        <label htmlFor="new-todo">New task</label>
        <div className="add-controls">
          <input
            id="new-todo"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs doing?"
            disabled={loading || loadFailed || busy}
          />
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
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                    disabled={busy}
                  />
                  <span className={todo.completed ? 'completed' : ''}>{todo.text}</span>
                </label>
                <button type="button" className="remove" onClick={() => removeTodo(todo.id)} disabled={busy} aria-label={`Remove ${todo.text}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

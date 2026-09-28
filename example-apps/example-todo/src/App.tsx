import { useState, type FormEvent } from 'react'

type Todo = {
  id: string
  text: string
  completed: boolean
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [draft, setDraft] = useState('')
  const remaining = todos.filter((todo) => !todo.completed).length

  function addTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return

    setTodos((current) => [...current, { id: crypto.randomUUID(), text, completed: false }])
    setDraft('')
  }

  function toggleTodo(id: string) {
    setTodos((current) => current.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo,
    ))
  }

  function removeTodo(id: string) {
    setTodos((current) => current.filter((todo) => todo.id !== id))
  }

  return (
    <main className="app">
      <h1>Todo list</h1>
      <p className="intro">A small example. Tasks disappear when you reload this page.</p>

      <form className="add-form" onSubmit={addTodo}>
        <label htmlFor="new-todo">New task</label>
        <div className="add-controls">
          <input
            id="new-todo"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="What needs doing?"
          />
          <button type="submit" disabled={!draft.trim()}>Add task</button>
        </div>
      </form>

      <section aria-labelledby="tasks-heading">
        <div className="list-heading">
          <h2 id="tasks-heading">Tasks</h2>
          <span role="status">{remaining} remaining</span>
        </div>
        {todos.length === 0 ? (
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
                  />
                  <span className={todo.completed ? 'completed' : ''}>{todo.text}</span>
                </label>
                <button type="button" className="remove" onClick={() => removeTodo(todo.id)} aria-label={`Remove ${todo.text}`}>
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

export type Todo = { id: string; text: string; completed: boolean }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/todos${path}`, options)
  if (!response.ok) throw new Error(`Todo request failed: ${response.status}`)
  return response.json() as Promise<T>
}

export function listTodos(): Promise<Todo[]> {
  return request<Todo[]>('')
}

export function createTodo(text: string): Promise<Todo> {
  return request<Todo>('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

export function setTodoCompleted(id: string, completed: boolean): Promise<Todo> {
  return request<Todo>(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  })
}

export async function removeTodo(id: string): Promise<void> {
  const response = await fetch(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Todo request failed: ${response.status}`)
}

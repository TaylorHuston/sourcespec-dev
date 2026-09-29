// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { createTodo, listTodos, removeTodo, setTodoCompleted } from './todo-api'

vi.mock('./todo-api', () => ({
  listTodos: vi.fn(),
  createTodo: vi.fn(),
  setTodoCompleted: vi.fn(),
  removeTodo: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listTodos).mockResolvedValue([])
  vi.mocked(createTodo).mockImplementation(async (text) => ({ id: 'new', text, completed: false }))
  vi.mocked(setTodoCompleted).mockImplementation(async (id, completed) => ({ id, text: 'Buy milk', completed }))
  vi.mocked(removeTodo).mockResolvedValue(undefined)
})
afterEach(cleanup)

it('loads existing tasks', async () => {
  vi.mocked(listTodos).mockResolvedValue([{ id: 'saved', text: 'Saved task', completed: true }])
  render(<App />)

  expect((await screen.findByRole('checkbox', { name: 'Saved task' }) as HTMLInputElement).checked).toBe(true)
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('adds a task with trimmed text and clears the input', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('0 remaining')
  const input = screen.getByRole('textbox', { name: 'New task' }) as HTMLInputElement

  await user.type(input, '  Buy milk  ')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  expect((await screen.findByRole('checkbox', { name: 'Buy milk' }) as HTMLInputElement).checked).toBe(false)
  expect(createTodo).toHaveBeenCalledWith('Buy milk')
  expect(screen.getByText('1 remaining')).toBeTruthy()
  expect(input.value).toBe('')
})

it('does not allow a blank task', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('0 remaining')
  const addButton = screen.getByRole('button', { name: 'Add task' }) as HTMLButtonElement
  expect(addButton.disabled).toBe(true)

  await user.type(screen.getByRole('textbox', { name: 'New task' }), '   ')

  expect(addButton.disabled).toBe(true)
  expect(createTodo).not.toHaveBeenCalled()
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('marks a task complete and updates the remaining count', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('0 remaining')
  await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Buy milk')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  const checkbox = await screen.findByRole('checkbox', { name: 'Buy milk' }) as HTMLInputElement
  await user.click(checkbox)

  await waitFor(() => expect(checkbox.checked).toBe(true))
  expect(setTodoCompleted).toHaveBeenCalledWith('new', true)
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('removes a task from the list', async () => {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('0 remaining')
  await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Call Sam')
  await user.click(screen.getByRole('button', { name: 'Add task' }))
  await screen.findByRole('checkbox', { name: 'Call Sam' })

  await user.click(screen.getByRole('button', { name: 'Remove Call Sam' }))

  await waitFor(() => expect(screen.queryByRole('checkbox')).toBeNull())
  expect(removeTodo).toHaveBeenCalledWith('new')
  expect(screen.getByText('No tasks yet. Add one above.')).toBeTruthy()
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('keeps the draft when saving fails', async () => {
  vi.mocked(createTodo).mockRejectedValue(new Error('offline'))
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('0 remaining')
  const input = screen.getByRole('textbox', { name: 'New task' }) as HTMLInputElement
  await user.type(input, 'Buy milk')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not add task. Try again.')
  expect(input.value).toBe('Buy milk')
  expect(screen.queryByRole('checkbox')).toBeNull()
})

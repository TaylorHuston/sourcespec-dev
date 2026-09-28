// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

it('adds a task with trimmed text and clears the input', async () => {
  const user = userEvent.setup()
  render(<App />)
  const input = screen.getByRole('textbox', { name: 'New task' }) as HTMLInputElement

  await user.type(input, '  Buy milk  ')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  expect((screen.getByRole('checkbox', { name: 'Buy milk' }) as HTMLInputElement).checked).toBe(false)
  expect(screen.getByText('Buy milk').textContent).toBe('Buy milk')
  expect(screen.getByText('1 remaining')).toBeTruthy()
  expect(input.value).toBe('')
})

it('does not allow a blank task', async () => {
  const user = userEvent.setup()
  render(<App />)
  const addButton = screen.getByRole('button', { name: 'Add task' }) as HTMLButtonElement
  expect(addButton.disabled).toBe(true)

  await user.type(screen.getByRole('textbox', { name: 'New task' }), '   ')

  expect(addButton.disabled).toBe(true)
  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('marks a task complete and updates the remaining count', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Buy milk')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  const checkbox = screen.getByRole('checkbox', { name: 'Buy milk' }) as HTMLInputElement
  await user.click(checkbox)

  expect(checkbox.checked).toBe(true)
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

it('removes a task from the list', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByRole('textbox', { name: 'New task' }), 'Call Sam')
  await user.click(screen.getByRole('button', { name: 'Add task' }))

  await user.click(screen.getByRole('button', { name: 'Remove Call Sam' }))

  expect(screen.queryByRole('checkbox')).toBeNull()
  expect(screen.getByText('No tasks yet. Add one above.')).toBeTruthy()
  expect(screen.getByText('0 remaining')).toBeTruthy()
})

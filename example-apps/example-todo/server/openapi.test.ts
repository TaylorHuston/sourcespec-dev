import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import SwaggerParser from '@apidevtools/swagger-parser'
import { parse } from 'yaml'
import { expect, it } from 'vitest'

const apiFile = fileURLToPath(new URL('../openapi.yaml', import.meta.url))
type ApiDocument = { openapi: string; paths: Record<string, Record<string, { operationId?: string; security?: Record<string, unknown>[] }>> }

async function validatedApi(): Promise<ApiDocument> {
  await SwaggerParser.validate(apiFile, { resolve: { http: false } })
  return parse(readFileSync(apiFile, 'utf8')) as ApiDocument
}

it('validates the local OpenAPI contract and its operation IDs', async () => {
  const api = await validatedApi()
  expect(api.openapi).toBe('3.1.1')

  const operations = Object.entries(api.paths).flatMap(([path, item]) =>
    Object.entries(item ?? {}).filter(([method]) => ['get', 'post', 'patch', 'delete'].includes(method))
      .map(([method, value]) => ({ path, method, id: value.operationId })),
  )
  expect(operations).toEqual([
    { path: '/api/auth/register', method: 'post', id: 'registerUser' },
    { path: '/api/auth/login', method: 'post', id: 'loginUser' },
    { path: '/api/auth/session', method: 'get', id: 'getSession' },
    { path: '/api/auth/logout', method: 'post', id: 'logoutUser' },
    { path: '/api/todos', method: 'get', id: 'listTodos' },
    { path: '/api/todos', method: 'post', id: 'createTodo' },
    { path: '/api/todos/{id}', method: 'patch', id: 'setTodoCompleted' },
    { path: '/api/todos/{id}', method: 'delete', id: 'removeTodo' },
  ])
  expect(new Set(operations.map((item) => item.id)).size).toBe(operations.length)
  expect(api.paths['/api/todos'].get.security).toEqual([{ sessionCookie: [] }])
})

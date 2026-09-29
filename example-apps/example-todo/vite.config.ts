import { resolve } from 'node:path'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createTodoHandler } from './server/todo-api.ts'
import { openTodoStore } from './server/todo-store.ts'

function localTodoApi(): Plugin {
  function attach(server: PreviewServer | ViteDevServer) {
    const store = openTodoStore(resolve(process.cwd(), '.data/todos.sqlite'))
    server.middlewares.use('/api/todos', createTodoHandler(store))
    server.httpServer?.once('close', () => store.close())
  }

  return { name: 'local-todo-api', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig({
  plugins: [react(), localTodoApi()],
})

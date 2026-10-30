import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use('/api/report', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }
        if (req.method !== 'POST') {
          next()
          return
        }
        const chunks = []
        for await (const c of req) chunks.push(c)
        try {
          req.body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
        } catch {
          req.body = {}
        }
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }
        try {
          const { default: handler } = await server.ssrLoadModule('/api/report.js')
          await handler(req, res)
        } catch (e) {
          console.error(e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message || '서버 오류' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(loadEnv(mode, process.cwd(), ''))],
}))

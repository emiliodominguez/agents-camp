import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

const agentPort = process.env.AGENT_PORT ?? '8787'

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5180,
    // Proxy the agent backend WebSocket so the browser connects same-origin.
    proxy: {
      '/agents': {
        target: `ws://localhost:${agentPort}`,
        ws: true,
        rewriteWsOrigin: true
      }
    }
  }
})

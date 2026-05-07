import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

let wss: WebSocketServer | null = null

const subscriptions = new Map<string, Set<WebSocket>>()

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'subscribe' && msg.taskId) {
          if (!subscriptions.has(msg.taskId)) {
            subscriptions.set(msg.taskId, new Set())
          }
          subscriptions.get(msg.taskId)!.add(ws)
        }
        if (msg.type === 'unsubscribe' && msg.taskId) {
          subscriptions.get(msg.taskId)?.delete(ws)
        }
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      for (const subs of subscriptions.values()) {
        subs.delete(ws)
      }
    })
  })
}

export function broadcast(data: Record<string, unknown>) {
  if (!wss) return
  const msg = JSON.stringify(data)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

export function broadcastToTask(taskId: string, data: Record<string, unknown>) {
  const subs = subscriptions.get(taskId)
  if (!subs) return
  const msg = JSON.stringify({ ...data, taskId })
  for (const ws of subs) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}

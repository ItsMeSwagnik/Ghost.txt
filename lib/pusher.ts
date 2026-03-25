import Pusher from "pusher"
import PusherClient from "pusher-js"

// Server-side Pusher instance
export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
})

// Client-side Pusher instance (singleton)
let pusherClientInstance: PusherClient | null = null
let pusherClientUserId: string | null = null

export const getPusherClient = (userId?: string, nickname?: string) => {
  // Re-create if user changed or previous instance was disconnected
  if (pusherClientInstance) {
    const state = pusherClientInstance.connection.state
    const userChanged = userId && userId !== pusherClientUserId
    if (userChanged || state === 'failed') {
      console.log(`[Pusher] Reconnecting client — reason: ${userChanged ? 'user changed' : 'connection failed'}`)
      pusherClientInstance.disconnect()
      pusherClientInstance = null
    }
  }

  if (!pusherClientInstance) {
    console.log("[Pusher] Creating new client instance")
    pusherClientUserId = userId ?? null
    pusherClientInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
      authEndpoint: "/api/pusher/auth",
      auth: {
        headers: {
          "x-user-id": userId ?? "",
          "x-nickname": nickname ?? "",
        },
      },
    })
  }
  return pusherClientInstance
}

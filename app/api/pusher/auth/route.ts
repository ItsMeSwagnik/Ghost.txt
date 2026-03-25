import { NextRequest, NextResponse } from "next/server"
import { pusherServer } from "@/lib/pusher"

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    const params = new URLSearchParams(text)
    const socketId = params.get("socket_id") as string
    const channel = params.get("channel_name") as string
    
    // Get user info from headers (set by client)
    const userId = request.headers.get("x-user-id") || "anonymous"
    const nickname = request.headers.get("x-nickname") || "Anonymous"
    
    console.log(`[API/pusher/auth] Authorizing channel type: ${channel.startsWith('presence-') ? 'presence' : 'private'}`)
    
    // For presence channels, include user info
    if (channel.startsWith("presence-")) {
      const presenceData = {
        user_id: userId,
        user_info: {
          nickname,
        },
      }
      
      const authResponse = pusherServer.authorizeChannel(socketId, channel, presenceData)
      return NextResponse.json(authResponse)
    }
    
    // For private channels
    const authResponse = pusherServer.authorizeChannel(socketId, channel)
    return NextResponse.json(authResponse)
  } catch (error) {
    console.error("[API/pusher/auth] Error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 403 })
  }
}

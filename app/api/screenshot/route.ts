import { NextRequest, NextResponse } from "next/server"
import { pusherServer } from "@/lib/pusher"

export async function POST(request: NextRequest) {
  try {
    const { roomId, userId, nickname } = await request.json()

    if (!roomId || !userId || !nickname) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    await pusherServer.trigger(`presence-room-${roomId}`, "screenshot-taken", {
      userId,
      nickname,
      timestamp: Date.now(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API/screenshot] Error:", error)
    return NextResponse.json({ error: "Failed to broadcast screenshot event" }, { status: 500 })
  }
}

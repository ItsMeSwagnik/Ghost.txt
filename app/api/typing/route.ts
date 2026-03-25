import { NextRequest, NextResponse } from "next/server"
import { pusherServer } from "@/lib/pusher"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomId, userId, nickname, isTyping } = body
    
    if (!roomId || !userId) {
      console.warn("[API/typing] Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    console.log(`[API/typing] Typing event — isTyping=${isTyping}`)
    
    // Trigger typing event
    await pusherServer.trigger(`presence-room-${roomId}`, "typing", {
      userId,
      nickname,
      isTyping,
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API/typing] Error:", error)
    return NextResponse.json({ error: "Failed to update typing status" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { pusherServer } from "@/lib/pusher"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomId, encryptedMessage, senderId, senderNickname, messageId } = body
    
    if (!roomId || !encryptedMessage || !senderId) {
      console.warn("[API/message] Missing required fields")
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    console.log("[API/message] Relaying encrypted message to room")
    
    // Trigger event on presence channel
    // Note: Message is already encrypted client-side, server never sees plaintext
    await pusherServer.trigger(`presence-room-${roomId}`, "new-message", {
      id: messageId,
      encryptedContent: encryptedMessage,
      senderId,
      senderNickname,
      timestamp: Date.now(),
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[API/message] Error:", error)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}

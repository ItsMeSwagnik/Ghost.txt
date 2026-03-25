import { NextRequest, NextResponse } from "next/server"
import { 
  isRoomIdAvailable, 
  createRoom, 
  roomExists, 
  leaveRoom,
  getCooldownRemaining,
  requestJoinRoom,
  approveJoinRequest,
  rejectJoinRequest,
  kickUser,
  getRoomInfo,
  isUserAdmin,
  isUserMember,
  cancelJoinRequest,
} from "@/lib/room-manager"
import { generateRoomId, isValidRoomId } from "@/lib/encryption"
import { pusherServer } from "@/lib/pusher"

// POST: Room actions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, roomId, userId, nickname, targetUserId } = body
    console.log(`[API/room] action=${action}`)
    
    if (action === "create") {
      // Generate a unique room ID
      let newRoomId = roomId
      
      if (!userId || !nickname) {
        return NextResponse.json(
          { error: "User ID and nickname are required" },
          { status: 400 }
        )
      }
      
      if (newRoomId) {
        // User provided custom room ID
        if (!isValidRoomId(newRoomId)) {
          return NextResponse.json(
            { error: "Room ID must be exactly 4 digits" },
            { status: 400 }
          )
        }
        
        if (!isRoomIdAvailable(newRoomId)) {
          const cooldown = getCooldownRemaining(newRoomId)
          if (cooldown > 0) {
            return NextResponse.json(
              { error: `Room ID is in cooldown. Available in ${Math.ceil(cooldown / 60)} minutes.` },
              { status: 409 }
            )
          }
          return NextResponse.json(
            { error: "Room ID is already in use" },
            { status: 409 }
          )
        }
      } else {
        // Generate random room ID
        let attempts = 0
        do {
          newRoomId = generateRoomId()
          attempts++
        } while (!isRoomIdAvailable(newRoomId) && attempts < 10)
        
        if (!isRoomIdAvailable(newRoomId)) {
          return NextResponse.json(
            { error: "Unable to generate available room ID. Please try again." },
            { status: 503 }
          )
        }
      }
      
      // Create room with admin
      createRoom(newRoomId, userId, nickname)
      console.log("[API/room] Room created successfully")
      
      return NextResponse.json({
        success: true,
        roomId: newRoomId,
        isAdmin: true,
      })
    }
    
    if (action === "request_join") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json(
          { error: "Invalid room ID" },
          { status: 400 }
        )
      }
      
      if (!userId || !nickname) {
        return NextResponse.json(
          { error: "User ID and nickname are required" },
          { status: 400 }
        )
      }
      
      // Check if room is in cooldown
      const cooldown = getCooldownRemaining(roomId)
      if (cooldown > 0) {
        return NextResponse.json(
          { error: `This room recently closed. Available in ${Math.ceil(cooldown / 60)} minutes.` },
          { status: 409 }
        )
      }
      
      if (!roomExists(roomId)) {
        return NextResponse.json(
          { error: "Room does not exist" },
          { status: 404 }
        )
      }
      
      const result = requestJoinRoom(roomId, userId, nickname)
      
      if (result === 'already_member') {
        return NextResponse.json({
          success: true,
          status: 'already_member',
        })
      }
      
      if (result === 'already_pending') {
        return NextResponse.json({
          success: true,
          status: 'pending',
        })
      }
      
      // Notify admin about new join request via Pusher
      console.log("[API/room] Triggering join-request event")
      await pusherServer.trigger(`presence-room-${roomId}`, 'join-request', {
        userId,
        nickname,
        requestedAt: Date.now(),
      })
      
      return NextResponse.json({
        success: true,
        status: 'pending',
      })
    }
    
    if (action === "approve") {
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json(
          { error: "Room ID, user ID, and target user ID are required" },
          { status: 400 }
        )
      }
      
      const result = approveJoinRequest(roomId, userId, targetUserId)
      
      if (result === 'not_admin') {
        return NextResponse.json(
          { error: "Only the room admin can approve join requests" },
          { status: 403 }
        )
      }
      
      if (result === 'not_found') {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        )
      }
      
      if (result === 'user_not_pending') {
        return NextResponse.json(
          { error: "User is not in pending list" },
          { status: 400 }
        )
      }
      
      // Notify the approved user
      console.log("[API/room] Notifying approved user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'join-approved', {
        roomId,
      })
      
      // Notify everyone in the room about the approval
      await pusherServer.trigger(`presence-room-${roomId}`, 'request-approved', {
        userId: targetUserId,
      })
      
      return NextResponse.json({ success: true })
    }
    
    if (action === "reject") {
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json(
          { error: "Room ID, user ID, and target user ID are required" },
          { status: 400 }
        )
      }
      
      const result = rejectJoinRequest(roomId, userId, targetUserId)
      
      if (result === 'not_admin') {
        return NextResponse.json(
          { error: "Only the room admin can reject join requests" },
          { status: 403 }
        )
      }
      
      if (result === 'not_found') {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        )
      }
      
      // Notify the rejected user
      console.log("[API/room] Notifying rejected user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'join-rejected', {
        roomId,
      })
      
      return NextResponse.json({ success: true })
    }
    
    if (action === "kick") {
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json(
          { error: "Room ID, user ID, and target user ID are required" },
          { status: 400 }
        )
      }
      
      const result = kickUser(roomId, userId, targetUserId)
      
      if (result === 'not_admin') {
        return NextResponse.json(
          { error: "Only the room admin can kick users" },
          { status: 403 }
        )
      }
      
      if (result === 'not_found') {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        )
      }
      
      if (result === 'cannot_kick_admin') {
        return NextResponse.json(
          { error: "Cannot kick the admin" },
          { status: 400 }
        )
      }
      
      // Notify the kicked user
      console.log("[API/room] Notifying kicked user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'kicked', {
        roomId,
      })
      
      // Notify everyone in the room
      await pusherServer.trigger(`presence-room-${roomId}`, 'user-kicked', {
        userId: targetUserId,
      })
      
      return NextResponse.json({ success: true })
    }
    
    if (action === "cancel_request") {
      if (roomId && userId) {
        cancelJoinRequest(roomId, userId)
      }
      return NextResponse.json({ success: true })
    }
    
    if (action === "leave") {
      if (roomId && userId) {
        leaveRoom(roomId, userId)
      }
      return NextResponse.json({ success: true })
    }
    
    if (action === "check") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json(
          { error: "Invalid room ID" },
          { status: 400 }
        )
      }
      
      const cooldown = getCooldownRemaining(roomId)
      const exists = roomExists(roomId)
      const available = isRoomIdAvailable(roomId)
      
      return NextResponse.json({
        exists,
        available,
        cooldownRemaining: cooldown,
      })
    }
    
    if (action === "info") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json(
          { error: "Invalid room ID" },
          { status: 400 }
        )
      }
      
      const info = getRoomInfo(roomId)
      
      if (!info) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404 }
        )
      }
      
      const isAdmin = userId ? isUserAdmin(roomId, userId) : false
      const isMember = userId ? isUserMember(roomId, userId) : false
      
      return NextResponse.json({
        ...info,
        isAdmin,
        isMember,
        // Only send pending users to admin
        pendingUsers: isAdmin ? info.pendingUsers : [],
      })
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[API/room] Unhandled error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, roomId, userId, nickname, targetUserId } = body
    console.log(`[API/room] action=${action}`)

    if (action === "create") {
      if (!userId || !nickname) {
        return NextResponse.json({ error: "User ID and nickname are required" }, { status: 400 })
      }

      let newRoomId = roomId

      if (newRoomId) {
        if (!isValidRoomId(newRoomId)) {
          return NextResponse.json({ error: "Room ID must be exactly 4 digits" }, { status: 400 })
        }
        if (!(await isRoomIdAvailable(newRoomId))) {
          const cooldown = await getCooldownRemaining(newRoomId)
          if (cooldown > 0) {
            return NextResponse.json({ error: `Room ID is in cooldown. Available in ${Math.ceil(cooldown / 60)} minutes.` }, { status: 409 })
          }
          return NextResponse.json({ error: "Room ID is already in use" }, { status: 409 })
        }
      } else {
        let attempts = 0
        do {
          newRoomId = generateRoomId()
          attempts++
        } while (!(await isRoomIdAvailable(newRoomId)) && attempts < 10)

        if (!(await isRoomIdAvailable(newRoomId))) {
          return NextResponse.json({ error: "Unable to generate available room ID. Please try again." }, { status: 503 })
        }
      }

      await createRoom(newRoomId, userId, nickname)
      console.log("[API/room] Room created successfully")
      return NextResponse.json({ success: true, roomId: newRoomId, isAdmin: true })
    }

    if (action === "request_join") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json({ error: "Invalid room ID" }, { status: 400 })
      }
      if (!userId || !nickname) {
        return NextResponse.json({ error: "User ID and nickname are required" }, { status: 400 })
      }

      const cooldown = await getCooldownRemaining(roomId)
      if (cooldown > 0) {
        return NextResponse.json({ error: `This room recently closed. Available in ${Math.ceil(cooldown / 60)} minutes.` }, { status: 409 })
      }

      if (!(await roomExists(roomId))) {
        return NextResponse.json({ error: "Room does not exist" }, { status: 404 })
      }

      const result = await requestJoinRoom(roomId, userId, nickname)

      if (result === 'already_member') {
        return NextResponse.json({ success: true, status: 'already_member' })
      }
      if (result === 'already_pending') {
        return NextResponse.json({ success: true, status: 'pending' })
      }

      console.log("[API/room] Triggering join-request event")
      await pusherServer.trigger(`presence-room-${roomId}`, 'join-request', {
        userId, nickname, requestedAt: Date.now(),
      })

      return NextResponse.json({ success: true, status: 'pending' })
    }

    if (action === "approve") {
      const { encryptionKey } = body
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json({ error: "Room ID, user ID, and target user ID are required" }, { status: 400 })
      }

      const result = await approveJoinRequest(roomId, userId, targetUserId)

      if (result === 'not_admin') return NextResponse.json({ error: "Only the room admin can approve join requests" }, { status: 403 })
      if (result === 'not_found') return NextResponse.json({ error: "Room not found" }, { status: 404 })
      if (result === 'user_not_pending') return NextResponse.json({ success: true })

      console.log("[API/room] Notifying approved user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'join-approved', {
        roomId, encryptionKey: encryptionKey || null,
      })
      await pusherServer.trigger(`presence-room-${roomId}`, 'request-approved', { userId: targetUserId })

      return NextResponse.json({ success: true })
    }

    if (action === "reject") {
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json({ error: "Room ID, user ID, and target user ID are required" }, { status: 400 })
      }

      const result = await rejectJoinRequest(roomId, userId, targetUserId)

      if (result === 'not_admin') return NextResponse.json({ error: "Only the room admin can reject join requests" }, { status: 403 })
      if (result === 'not_found') return NextResponse.json({ error: "Room not found" }, { status: 404 })

      console.log("[API/room] Notifying rejected user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'join-rejected', { roomId })

      return NextResponse.json({ success: true })
    }

    if (action === "kick") {
      if (!roomId || !userId || !targetUserId) {
        return NextResponse.json({ error: "Room ID, user ID, and target user ID are required" }, { status: 400 })
      }

      const result = await kickUser(roomId, userId, targetUserId)

      if (result === 'not_admin') return NextResponse.json({ error: "Only the room admin can kick users" }, { status: 403 })
      if (result === 'not_found') return NextResponse.json({ error: "Room not found" }, { status: 404 })
      if (result === 'cannot_kick_admin') return NextResponse.json({ error: "Cannot kick the admin" }, { status: 400 })

      console.log("[API/room] Notifying kicked user")
      await pusherServer.trigger(`private-user-${targetUserId}`, 'kicked', { roomId })
      await pusherServer.trigger(`presence-room-${roomId}`, 'user-kicked', { userId: targetUserId })

      return NextResponse.json({ success: true })
    }

    if (action === "cancel_request") {
      if (roomId && userId) await cancelJoinRequest(roomId, userId)
      return NextResponse.json({ success: true })
    }

    if (action === "leave") {
      if (roomId && userId) await leaveRoom(roomId, userId)
      return NextResponse.json({ success: true })
    }

    if (action === "debug") {
      const { getRoomDebugInfo } = await import("@/lib/room-manager")
      return NextResponse.json(await getRoomDebugInfo())
    }

    if (action === "check") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json({ error: "Invalid room ID" }, { status: 400 })
      }
      const [cooldown, exists] = await Promise.all([
        getCooldownRemaining(roomId),
        roomExists(roomId),
      ])
      return NextResponse.json({ exists, available: !exists && cooldown === 0, cooldownRemaining: cooldown })
    }

    if (action === "info") {
      if (!roomId || !isValidRoomId(roomId)) {
        return NextResponse.json({ error: "Invalid room ID" }, { status: 400 })
      }

      const info = await getRoomInfo(roomId)
      if (!info) return NextResponse.json({ error: "Room not found" }, { status: 404 })

      const [isAdmin, isMember] = await Promise.all([
        userId ? isUserAdmin(roomId, userId) : Promise.resolve(false),
        userId ? isUserMember(roomId, userId) : Promise.resolve(false),
      ])

      return NextResponse.json({
        ...info,
        isAdmin,
        isMember,
        pendingUsers: isAdmin ? info.pendingUsers : [],
      })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("[API/room] Unhandled error:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

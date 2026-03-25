// In-memory room management (no persistence)
// NOTE: This works on Vercel only because vercel.json pins all functions to a
// single region (iad1). If you ever remove that constraint or scale to multiple
// regions, replace this with a Redis store (e.g. Upstash) for shared state.

interface RoomUser {
  id: string
  nickname: string
  joinedAt: number
}

interface PendingUser {
  id: string
  nickname: string
  requestedAt: number
}

interface Room {
  id: string
  adminId: string
  adminNickname: string
  users: Map<string, RoomUser>
  pendingUsers: Map<string, PendingUser>
  createdAt: number
  lastActivity: number
}

interface CooldownRoom {
  id: string
  cooldownUntil: number
}

// Use global to survive Next.js HMR module re-evaluation in dev
declare global {
  // eslint-disable-next-line no-var
  var __activeRooms: Map<string, Room> | undefined
  // eslint-disable-next-line no-var
  var __cooldownRooms: Map<string, CooldownRoom> | undefined
}

const activeRooms: Map<string, Room> = global.__activeRooms ?? (global.__activeRooms = new Map())
const cooldownRooms: Map<string, CooldownRoom> = global.__cooldownRooms ?? (global.__cooldownRooms = new Map())

const COOLDOWN_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds

// Clean up expired cooldowns periodically
function cleanupCooldowns() {
  const now = Date.now()
  for (const [roomId, room] of cooldownRooms.entries()) {
    if (now >= room.cooldownUntil) {
      cooldownRooms.delete(roomId)
    }
  }
}

// Check if a room ID is available
export function isRoomIdAvailable(roomId: string): boolean {
  cleanupCooldowns()
  
  // Check if room is active
  if (activeRooms.has(roomId)) {
    return false
  }
  
  // Check if room is in cooldown
  if (cooldownRooms.has(roomId)) {
    const cooldown = cooldownRooms.get(roomId)!
    if (Date.now() < cooldown.cooldownUntil) {
      return false
    }
    cooldownRooms.delete(roomId)
  }
  
  return true
}

// Create a new room with admin
export function createRoom(roomId: string, adminId: string, adminNickname: string): boolean {
  if (!isRoomIdAvailable(roomId)) {
    console.warn("[RoomManager] createRoom failed — room ID not available")
    return false
  }
  
  console.log("[RoomManager] Room created")
  
  activeRooms.set(roomId, {
    id: roomId,
    adminId,
    adminNickname,
    users: new Map([[adminId, { id: adminId, nickname: adminNickname, joinedAt: Date.now() }]]),
    pendingUsers: new Map(),
    createdAt: Date.now(),
    lastActivity: Date.now(),
  })
  
  return true
}

// Request to join a room (goes to pending)
export function requestJoinRoom(roomId: string, userId: string, nickname: string): 'pending' | 'not_found' | 'already_member' | 'already_pending' {
  const room = activeRooms.get(roomId)
  if (!room) {
    console.warn("[RoomManager] requestJoinRoom — room not found")
    return 'not_found'
  }
  
  if (room.users.has(userId)) {
    console.log("[RoomManager] requestJoinRoom — user already member")
    return 'already_member'
  }
  
  if (room.pendingUsers.has(userId)) {
    console.log("[RoomManager] requestJoinRoom — user already pending")
    return 'already_pending'
  }
  
  console.log("[RoomManager] Join request queued")
  
  room.pendingUsers.set(userId, {
    id: userId,
    nickname,
    requestedAt: Date.now(),
  })
  room.lastActivity = Date.now()
  
  return 'pending'
}

// Admin approves a join request
export function approveJoinRequest(roomId: string, adminId: string, userId: string): 'approved' | 'not_admin' | 'not_found' | 'user_not_pending' {
  const room = activeRooms.get(roomId)
  if (!room) {
    console.warn("[RoomManager] approveJoinRequest — room not found")
    return 'not_found'
  }
  
  if (room.adminId !== adminId) {
    console.warn("[RoomManager] approveJoinRequest — unauthorized: not admin")
    return 'not_admin'
  }
  
  const pendingUser = room.pendingUsers.get(userId)
  if (!pendingUser) {
    console.warn("[RoomManager] approveJoinRequest — user not in pending list")
    return 'user_not_pending'
  }
  
  console.log("[RoomManager] Join request approved")
  
  // Move from pending to users
  room.users.set(userId, {
    id: userId,
    nickname: pendingUser.nickname,
    joinedAt: Date.now(),
  })
  room.pendingUsers.delete(userId)
  room.lastActivity = Date.now()
  
  return 'approved'
}

// Admin rejects a join request
export function rejectJoinRequest(roomId: string, adminId: string, userId: string): 'rejected' | 'not_admin' | 'not_found' | 'user_not_pending' {
  const room = activeRooms.get(roomId)
  if (!room) {
    console.warn("[RoomManager] rejectJoinRequest — room not found")
    return 'not_found'
  }
  
  if (room.adminId !== adminId) {
    console.warn("[RoomManager] rejectJoinRequest — unauthorized: not admin")
    return 'not_admin'
  }
  
  if (!room.pendingUsers.has(userId)) {
    console.warn("[RoomManager] rejectJoinRequest — user not in pending list")
    return 'user_not_pending'
  }
  
  console.log("[RoomManager] Join request rejected")
  
  room.pendingUsers.delete(userId)
  room.lastActivity = Date.now()
  
  return 'rejected'
}

// Admin kicks a user from the room
export function kickUser(roomId: string, adminId: string, userId: string): 'kicked' | 'not_admin' | 'not_found' | 'user_not_found' | 'cannot_kick_admin' {
  const room = activeRooms.get(roomId)
  if (!room) {
    console.warn("[RoomManager] kickUser — room not found")
    return 'not_found'
  }
  
  if (room.adminId !== adminId) {
    console.warn("[RoomManager] kickUser — unauthorized: not admin")
    return 'not_admin'
  }
  
  if (userId === adminId) {
    console.warn("[RoomManager] kickUser — cannot kick admin")
    return 'cannot_kick_admin'
  }
  
  if (!room.users.has(userId)) {
    console.warn("[RoomManager] kickUser — target user not found in room")
    return 'user_not_found'
  }
  
  console.log("[RoomManager] User kicked from room")
  
  room.users.delete(userId)
  room.lastActivity = Date.now()
  
  return 'kicked'
}

// Direct join for admin (creator)
export function joinRoomDirect(roomId: string, userId: string, nickname: string): boolean {
  const room = activeRooms.get(roomId)
  if (!room) {
    return false
  }
  
  room.users.set(userId, {
    id: userId,
    nickname,
    joinedAt: Date.now(),
  })
  room.lastActivity = Date.now()
  return true
}

// Leave a room
export function leaveRoom(roomId: string, userId: string): void {
  const room = activeRooms.get(roomId)
  if (!room) {
    console.warn("[RoomManager] leaveRoom — room not found")
    return
  }
  
  console.log("[RoomManager] User leaving room")
  
  room.users.delete(userId)
  room.pendingUsers.delete(userId)
  room.lastActivity = Date.now()
  
  // If room is empty, start cooldown
  if (room.users.size === 0) {
    console.log("[RoomManager] Room empty — starting 5-min cooldown")
    activeRooms.delete(roomId)
    cooldownRooms.set(roomId, {
      id: roomId,
      cooldownUntil: Date.now() + COOLDOWN_DURATION,
    })
  }
}

// Cancel pending request
export function cancelJoinRequest(roomId: string, userId: string): void {
  const room = activeRooms.get(roomId)
  if (!room) {
    return
  }
  room.pendingUsers.delete(userId)
}

// Get room info
export function getRoomInfo(roomId: string): {
  exists: boolean
  adminId: string
  adminNickname: string
  userCount: number
  users: Array<{ id: string; nickname: string }>
  pendingUsers: Array<{ id: string; nickname: string; requestedAt: number }>
} | null {
  const room = activeRooms.get(roomId)
  if (!room) {
    return null
  }
  
  return {
    exists: true,
    adminId: room.adminId,
    adminNickname: room.adminNickname,
    userCount: room.users.size,
    users: Array.from(room.users.values()).map(u => ({ id: u.id, nickname: u.nickname })),
    pendingUsers: Array.from(room.pendingUsers.values()).map(u => ({ 
      id: u.id, 
      nickname: u.nickname, 
      requestedAt: u.requestedAt 
    })),
  }
}

// Check if user is admin
export function isUserAdmin(roomId: string, userId: string): boolean {
  const room = activeRooms.get(roomId)
  return room?.adminId === userId
}

// Check if user is a member
export function isUserMember(roomId: string, userId: string): boolean {
  const room = activeRooms.get(roomId)
  return room?.users.has(userId) ?? false
}

// Check if user is pending
export function isUserPending(roomId: string, userId: string): boolean {
  const room = activeRooms.get(roomId)
  return room?.pendingUsers.has(userId) ?? false
}

// Check if room exists (for joining)
export function roomExists(roomId: string): boolean {
  return activeRooms.has(roomId)
}

// Get cooldown remaining time in seconds
export function getCooldownRemaining(roomId: string): number {
  cleanupCooldowns()
  const cooldown = cooldownRooms.get(roomId)
  if (!cooldown) {
    return 0
  }
  return Math.max(0, Math.ceil((cooldown.cooldownUntil - Date.now()) / 1000))
}

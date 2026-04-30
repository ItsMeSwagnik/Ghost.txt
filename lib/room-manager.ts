import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Initialize tables on first use
let initialized = false
async function ensureSchema() {
  if (initialized) return
  await sql`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      admin_nickname TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      last_activity BIGINT NOT NULL
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS room_users (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      joined_at BIGINT NOT NULL,
      PRIMARY KEY (room_id, user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS room_pending (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      requested_at BIGINT NOT NULL,
      PRIMARY KEY (room_id, user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS room_cooldowns (
      id TEXT PRIMARY KEY,
      cooldown_until BIGINT NOT NULL
    )
  `
  initialized = true
}

const COOLDOWN_MS = 5 * 60 * 1000
const STALE_ROOM_MS = 30 * 60 * 1000 // 30 minutes

async function cleanupStaleRooms() {
  const cutoff = Date.now() - STALE_ROOM_MS
  await sql`DELETE FROM rooms WHERE last_activity < ${cutoff}`
  await sql`DELETE FROM room_cooldowns WHERE cooldown_until < ${Date.now()}`
}

export async function isRoomIdAvailable(roomId: string): Promise<boolean> {
  await ensureSchema()
  await cleanupStaleRooms()
  const [roomRow] = await sql`SELECT id FROM rooms WHERE id = ${roomId}`
  if (roomRow) return false
  const [cooldown] = await sql`SELECT cooldown_until FROM room_cooldowns WHERE id = ${roomId}`
  if (cooldown && Date.now() < Number(cooldown.cooldown_until)) return false
  return true
}

export async function createRoom(roomId: string, adminId: string, adminNickname: string): Promise<boolean> {
  await ensureSchema()
  if (!(await isRoomIdAvailable(roomId))) return false
  const now = Date.now()
  await sql`INSERT INTO rooms (id, admin_id, admin_nickname, created_at, last_activity) VALUES (${roomId}, ${adminId}, ${adminNickname}, ${now}, ${now})`
  await sql`INSERT INTO room_users (room_id, user_id, nickname, joined_at) VALUES (${roomId}, ${adminId}, ${adminNickname}, ${now})`
  // Clear any stale cooldown
  await sql`DELETE FROM room_cooldowns WHERE id = ${roomId}`
  return true
}

export async function requestJoinRoom(roomId: string, userId: string, nickname: string): Promise<'pending' | 'not_found' | 'already_member' | 'already_pending'> {
  await ensureSchema()
  const [room] = await sql`SELECT id FROM rooms WHERE id = ${roomId}`
  if (!room) return 'not_found'
  const [member] = await sql`SELECT user_id FROM room_users WHERE room_id = ${roomId} AND user_id = ${userId}`
  if (member) return 'already_member'
  const [pending] = await sql`SELECT user_id FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  if (pending) return 'already_pending'
  await sql`INSERT INTO room_pending (room_id, user_id, nickname, requested_at) VALUES (${roomId}, ${userId}, ${nickname}, ${Date.now()})`
  await sql`UPDATE rooms SET last_activity = ${Date.now()} WHERE id = ${roomId}`
  return 'pending'
}

export async function approveJoinRequest(roomId: string, adminId: string, userId: string): Promise<'approved' | 'not_admin' | 'not_found' | 'user_not_pending'> {
  await ensureSchema()
  const [room] = await sql`SELECT admin_id FROM rooms WHERE id = ${roomId}`
  if (!room) return 'not_found'
  if (room.admin_id !== adminId) return 'not_admin'
  const [pending] = await sql`SELECT nickname FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  if (!pending) return 'user_not_pending'
  const now = Date.now()
  await sql`INSERT INTO room_users (room_id, user_id, nickname, joined_at) VALUES (${roomId}, ${userId}, ${pending.nickname}, ${now}) ON CONFLICT DO NOTHING`
  await sql`DELETE FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  await sql`UPDATE rooms SET last_activity = ${now} WHERE id = ${roomId}`
  return 'approved'
}

export async function rejectJoinRequest(roomId: string, adminId: string, userId: string): Promise<'rejected' | 'not_admin' | 'not_found' | 'user_not_pending'> {
  await ensureSchema()
  const [room] = await sql`SELECT admin_id FROM rooms WHERE id = ${roomId}`
  if (!room) return 'not_found'
  if (room.admin_id !== adminId) return 'not_admin'
  const [pending] = await sql`SELECT user_id FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  if (!pending) return 'user_not_pending'
  await sql`DELETE FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  await sql`UPDATE rooms SET last_activity = ${Date.now()} WHERE id = ${roomId}`
  return 'rejected'
}

export async function kickUser(roomId: string, adminId: string, userId: string): Promise<'kicked' | 'not_admin' | 'not_found' | 'user_not_found' | 'cannot_kick_admin'> {
  await ensureSchema()
  const [room] = await sql`SELECT admin_id FROM rooms WHERE id = ${roomId}`
  if (!room) return 'not_found'
  if (room.admin_id !== adminId) return 'not_admin'
  if (userId === adminId) return 'cannot_kick_admin'
  const [member] = await sql`SELECT user_id FROM room_users WHERE room_id = ${roomId} AND user_id = ${userId}`
  if (!member) return 'user_not_found'
  await sql`DELETE FROM room_users WHERE room_id = ${roomId} AND user_id = ${userId}`
  await sql`UPDATE rooms SET last_activity = ${Date.now()} WHERE id = ${roomId}`
  return 'kicked'
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await ensureSchema()
  await sql`DELETE FROM room_users WHERE room_id = ${roomId} AND user_id = ${userId}`
  await sql`DELETE FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
  const [countRow] = await sql`SELECT COUNT(*) as count FROM room_users WHERE room_id = ${roomId}`
  if (Number(countRow.count) === 0) {
    await sql`DELETE FROM rooms WHERE id = ${roomId}`
    await sql`INSERT INTO room_cooldowns (id, cooldown_until) VALUES (${roomId}, ${Date.now() + COOLDOWN_MS}) ON CONFLICT (id) DO UPDATE SET cooldown_until = ${Date.now() + COOLDOWN_MS}`
  } else {
    await sql`UPDATE rooms SET last_activity = ${Date.now()} WHERE id = ${roomId}`
  }
}

export async function cancelJoinRequest(roomId: string, userId: string): Promise<void> {
  await ensureSchema()
  await sql`DELETE FROM room_pending WHERE room_id = ${roomId} AND user_id = ${userId}`
}

export async function getRoomInfo(roomId: string): Promise<{
  exists: boolean
  adminId: string
  adminNickname: string
  userCount: number
  users: Array<{ id: string; nickname: string }>
  pendingUsers: Array<{ id: string; nickname: string; requestedAt: number }>
} | null> {
  await ensureSchema()
  const [room] = await sql`SELECT * FROM rooms WHERE id = ${roomId}`
  if (!room) return null
  const [users, pending] = await Promise.all([
    sql`SELECT user_id, nickname FROM room_users WHERE room_id = ${roomId}`,
    sql`SELECT user_id, nickname, requested_at FROM room_pending WHERE room_id = ${roomId}`,
  ])
  return {
    exists: true,
    adminId: room.admin_id,
    adminNickname: room.admin_nickname,
    userCount: users.length,
    users: users.map(u => ({ id: u.user_id, nickname: u.nickname })),
    pendingUsers: pending.map(u => ({ id: u.user_id, nickname: u.nickname, requestedAt: Number(u.requested_at) })),
  }
}

export async function isUserAdmin(roomId: string, userId: string): Promise<boolean> {
  await ensureSchema()
  const [room] = await sql`SELECT admin_id FROM rooms WHERE id = ${roomId}`
  return room?.admin_id === userId
}

export async function isUserMember(roomId: string, userId: string): Promise<boolean> {
  await ensureSchema()
  const [row] = await sql`SELECT user_id FROM room_users WHERE room_id = ${roomId} AND user_id = ${userId}`
  return !!row
}

export async function roomExists(roomId: string): Promise<boolean> {
  await ensureSchema()
  const [row] = await sql`SELECT id FROM rooms WHERE id = ${roomId}`
  return !!row
}

export async function getCooldownRemaining(roomId: string): Promise<number> {
  await ensureSchema()
  const [row] = await sql`SELECT cooldown_until FROM room_cooldowns WHERE id = ${roomId}`
  if (!row) return 0
  const remaining = Math.ceil((Number(row.cooldown_until) - Date.now()) / 1000)
  if (remaining <= 0) {
    await sql`DELETE FROM room_cooldowns WHERE id = ${roomId}`
    return 0
  }
  return remaining
}

export async function getRoomDebugInfo() {
  await ensureSchema()
  const rooms = await sql`SELECT id FROM rooms`
  const cooldowns = await sql`SELECT id FROM room_cooldowns`
  return {
    activeRoomIds: rooms.map(r => r.id),
    cooldownRoomIds: cooldowns.map(r => r.id),
  }
}

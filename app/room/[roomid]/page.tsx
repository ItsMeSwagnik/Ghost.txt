"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChatRoom } from "@/components/chat/chat-room"
import { EncryptionKeyPrompt } from "@/components/chat/encryption-key-prompt"
import { WaitingRoom } from "@/components/chat/waiting-room"

type RoomStatus = 'loading' | 'need_key' | 'pending' | 'approved' | 'not_found'

interface PageProps {
  params: Promise<{ roomid: string }>
}

export default function RoomPage({ params }: PageProps) {
  const { roomid: roomId } = use(params)
  const router = useRouter()
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminId, setAdminId] = useState<string>("")
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('loading')

  // Check room status and request to join
  const checkAndRequestJoin = useCallback(async (uid: string, nick: string) => {
    try {
      console.log("[RoomPage] Checking room status")
      // First check if user is already a member or admin
      let infoResponse = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "info", roomId, userId: uid }),
      })

      // Retry once after a short delay (handles Next.js dev HMR module reload)
      if (infoResponse.status === 404) {
        await new Promise(r => setTimeout(r, 500))
        infoResponse = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "info", roomId, userId: uid }),
        })
      }
      
      if (!infoResponse.ok) {
        if (infoResponse.status === 404) {
          console.warn("[RoomPage] Room not found")
          setRoomStatus('not_found')
          return
        }
        throw new Error("Failed to get room info")
      }
      
      const info = await infoResponse.json()
      setAdminId(info.adminId)
      
      // Check if user is admin
      if (info.isAdmin) {
        console.log("[RoomPage] User is admin — access granted")
        setIsAdmin(true)
        setRoomStatus('approved')
        return
      }
      
      // Check if user is already a member
      if (info.isMember) {
        console.log("[RoomPage] User already member — access granted")
        setRoomStatus('approved')
        return
      }
      
      // Request to join
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_join", roomId, userId: uid, nickname: nick }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        console.error("[RoomPage] Failed to request join:", data.error)
        setRoomStatus('not_found')
        return
      }
      
      if (data.status === 'already_member') {
        console.log("[RoomPage] Already member — access granted")
        setRoomStatus('approved')
      } else {
        console.log("[RoomPage] Join request sent — pending approval")
        setRoomStatus('pending')
      }
    } catch (error) {
      console.error("[RoomPage] Error checking room:", error)
      setRoomStatus('not_found')
    }
  }, [roomId])

  useEffect(() => {
    // Get encryption key from URL hash
    const hash = window.location.hash.slice(1)
    
    // Get user info from session storage
    const savedNickname = sessionStorage.getItem("chat-nickname")
    const savedUserId = sessionStorage.getItem("chat-user-id")
    
    if (!savedNickname) {
      // No nickname, redirect to home
      router.push("/")
      return
    }
    
    const uid = savedUserId || crypto.randomUUID()
    if (!savedUserId) {
      sessionStorage.setItem("chat-user-id", uid)
    }
    
    setNickname(savedNickname)
    setUserId(uid)
    
    // Check if user created this room (coming from create flow)
    const creatorFlag = sessionStorage.getItem(`room-creator-${roomId}`)
    if (creatorFlag === uid) {
      console.log("[RoomPage] Creator session detected — setting admin")
      setIsAdmin(true)
      setAdminId(uid)
      setRoomStatus('approved')
      if (hash && hash.length > 0) {
        setEncryptionKey(hash)
      } else {
        setRoomStatus('need_key')
      }
      return
    }
    
    if (hash && hash.length > 0) {
      setEncryptionKey(hash)
    }
    // Always proceed to check/request join regardless of key
    checkAndRequestJoin(uid, savedNickname)
  }, [router, roomId, checkAndRequestJoin])

  // Handle approval callback
  const handleApproved = useCallback((key: string | null) => {
    if (key) {
      window.history.replaceState(null, "", `#${key}`)
      setEncryptionKey(key)
    }
    setRoomStatus('approved')
  }, [])

  if (roomStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading secure room...</p>
        </div>
      </div>
    )
  }

  if (roomStatus === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Room Not Found</h1>
          <p className="text-muted-foreground mb-6">This room does not exist or has been closed.</p>
          <button
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Return Home
          </button>
        </div>
      </div>
    )
  }

  if (!nickname || !userId) {
    return null
  }

  // Waiting room for pending users
  if (roomStatus === 'pending') {
    return (
      <WaitingRoom
        roomId={roomId}
        userId={userId}
        nickname={nickname}
        encryptionKey={encryptionKey}
        onApproved={handleApproved}
      />
    )
  }

  // Only admins who lost their key need to re-enter it
  if (!encryptionKey && isAdmin) {
    return (
      <EncryptionKeyPrompt 
        roomId={roomId}
        onKeySubmit={(key) => {
          window.history.replaceState(null, "", `#${key}`)
          setEncryptionKey(key)
        }}
      />
    )
  }

  // Non-admin approved without key yet — wait for key from approval event
  if (!encryptionKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Entering secure room...</p>
        </div>
      </div>
    )
  }

  return (
    <ChatRoom 
      roomId={roomId}
      encryptionKey={encryptionKey}
      nickname={nickname}
      userId={userId}
      isAdmin={isAdmin}
      adminId={adminId}
    />
  )
}

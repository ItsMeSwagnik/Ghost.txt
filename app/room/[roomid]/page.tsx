"use client"

import { use, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChatRoom } from "@/components/chat/chat-room"
import { EncryptionKeyPrompt } from "@/components/chat/encryption-key-prompt"
import { WaitingRoom } from "@/components/chat/waiting-room"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RoomStatus = 'loading' | 'need_nickname' | 'need_key' | 'pending' | 'approved' | 'not_found'

interface PageProps {
  params: Promise<{ roomid: string }>
}

export default function RoomPage({ params }: PageProps) {
  const { roomid: roomId } = use(params)
  const router = useRouter()
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [nicknameInput, setNicknameInput] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminId, setAdminId] = useState<string>("")
  const [roomStatus, setRoomStatus] = useState<RoomStatus>('loading')

  const checkAndRequestJoin = useCallback(async (uid: string, nick: string) => {
    try {
      let infoResponse = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "info", roomId, userId: uid }),
      })
      if (infoResponse.status === 404) {
        await new Promise(r => setTimeout(r, 500))
        infoResponse = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "info", roomId, userId: uid }),
        })
      }
      if (!infoResponse.ok) {
        setRoomStatus('not_found')
        return
      }
      const info = await infoResponse.json()
      setAdminId(info.adminId)
      if (info.isAdmin) { setIsAdmin(true); setRoomStatus('approved'); return }
      if (info.isMember) { setRoomStatus('approved'); return }

      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_join", roomId, userId: uid, nickname: nick }),
      })
      const data = await response.json()
      if (!response.ok) { setRoomStatus('not_found'); return }
      setRoomStatus(data.status === 'already_member' ? 'approved' : 'pending')
    } catch {
      setRoomStatus('not_found')
    }
  }, [roomId])

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const savedNickname = sessionStorage.getItem("chat-nickname")
    const savedUserId = sessionStorage.getItem("chat-user-id")

    if (hash) setEncryptionKey(hash)

    if (!savedNickname) {
      setRoomStatus('need_nickname')
      return
    }

    const uid = savedUserId || crypto.randomUUID()
    if (!savedUserId) sessionStorage.setItem("chat-user-id", uid)

    setNickname(savedNickname)
    setUserId(uid)

    const creatorFlag = sessionStorage.getItem(`room-creator-${roomId}`)
    if (creatorFlag === uid) {
      setIsAdmin(true)
      setAdminId(uid)
      setRoomStatus(hash ? 'approved' : 'need_key')
      return
    }

    checkAndRequestJoin(uid, savedNickname)
  }, [roomId, checkAndRequestJoin])

  const handleNicknameSubmit = useCallback(() => {
    const nick = nicknameInput.trim()
    if (!nick) return
    sessionStorage.setItem("chat-nickname", nick)
    const uid = sessionStorage.getItem("chat-user-id") || crypto.randomUUID()
    sessionStorage.setItem("chat-user-id", uid)
    setNickname(nick)
    setUserId(uid)
    setRoomStatus('loading')
    checkAndRequestJoin(uid, nick)
  }, [nicknameInput, checkAndRequestJoin])

  const handleApproved = useCallback((key: string | null) => {
    if (key) {
      window.history.replaceState(null, "", `#${key}`)
      setEncryptionKey(key)
    }
    setRoomStatus('approved')
  }, [])

  if (roomStatus === 'need_nickname') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center">
            <span className="text-5xl">👻</span>
            <h1 className="text-2xl font-bold mt-3 mb-1">Enter your nickname</h1>
            <p className="text-muted-foreground text-sm">to join Room <span className="font-mono font-bold text-foreground">{roomId}</span></p>
          </div>
          <Input
            placeholder="Your nickname"
            value={nicknameInput}
            onChange={e => setNicknameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNicknameSubmit()}
            autoFocus
            className="h-11"
          />
          <Button onClick={handleNicknameSubmit} disabled={!nicknameInput.trim()} className="w-full h-11">
            Continue
          </Button>
        </div>
      </div>
    )
  }

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
          <button onClick={() => router.push("/")} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
            Return Home
          </button>
        </div>
      </div>
    )
  }

  if (!nickname || !userId) return null

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

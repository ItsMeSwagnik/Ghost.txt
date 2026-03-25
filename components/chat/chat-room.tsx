"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { 
  Shield, 
  Copy, 
  Check, 
  LogOut, 
  Send,
  Lock,
  Menu,
  Crown,
  X,
  Camera
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/theme-toggle"
import { getPusherClient } from "@/lib/pusher"
import { encryptMessage, decryptMessage } from "@/lib/encryption"
import { TypingIndicator } from "./typing-indicator"
import { MessageBubble } from "./message-bubble"
import { OnlineUsers } from "./online-users"
import { AdminPanel } from "./admin-panel"
import type { PresenceChannel, Members, Member } from "pusher-js"

interface Message {
  id: string
  content: string
  senderId: string
  senderNickname: string
  timestamp: number
  isOwn: boolean
  isSystem?: boolean
}

interface User {
  id: string
  nickname: string
}

interface PendingUser {
  id: string
  nickname: string
  requestedAt: number
}

interface ChatRoomProps {
  roomId: string
  encryptionKey: string
  nickname: string
  userId: string
  isAdmin: boolean
  adminId: string
}

export function ChatRoom({ roomId, encryptionKey, nickname, userId, isAdmin, adminId }: ChatRoomProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const [copied, setCopied] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [showMobileUsers, setShowMobileUsers] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingRef = useRef<number>(0)
  const channelRef = useRef<PresenceChannel | null>(null)
  const mountedRef = useRef(false)

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Close mobile panel when clicking outside or on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMobileUsers(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const controller = new AbortController()
    fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "info", roomId, userId }),
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.pendingUsers) setPendingUsers(data.pendingUsers) })
      .catch(() => {})
    return () => controller.abort()
  }, [roomId, userId, isAdmin])

  // Setup Pusher connection
  useEffect(() => {
    mountedRef.current = true
    const pusher = getPusherClient(userId, nickname)
    console.log(`[ChatRoom] Subscribing to presence channel for room`)

    const channel = pusher.subscribe(`presence-room-${roomId}`) as PresenceChannel
    channelRef.current = channel

    channel.bind("pusher:subscription_succeeded", (members: Members) => {
      console.log(`[ChatRoom] Connected — ${members.count} member(s) online`)
      setIsConnected(true)
      const users: User[] = []
      members.each((member: Member) => {
        users.push({
          id: member.id,
          nickname: member.info?.nickname || "Anonymous",
        })
      })
      setOnlineUsers(users)
    })

    channel.bind("pusher:member_added", (member: Member) => {
      console.log("[ChatRoom] A member joined the room")
      setOnlineUsers((prev) => [
        ...prev,
        { id: member.id, nickname: member.info?.nickname || "Anonymous" },
      ])
    })

    channel.bind("pusher:member_removed", (member: Member) => {
      console.log("[ChatRoom] A member left the room")
      setOnlineUsers((prev) => prev.filter((u) => u.id !== member.id))
      setTypingUsers((prev) => {
        const next = new Map(prev)
        next.delete(member.id)
        return next
      })
    })

    // Handle incoming messages
    channel.bind("new-message", (data: {
      id: string
      encryptedContent: string
      senderId: string
      senderNickname: string
      timestamp: number
    }) => {
      console.log("[ChatRoom] Received encrypted message")
      const decrypted = decryptMessage(data.encryptedContent, encryptionKey)
      
      if (!decrypted) {
        console.warn("[ChatRoom] Failed to decrypt message — possible key mismatch")
      }
      
      if (decrypted) {
        setMessages((prev) => [
          ...prev,
          {
            id: data.id,
            content: decrypted,
            senderId: data.senderId,
            senderNickname: data.senderNickname,
            timestamp: data.timestamp,
            isOwn: data.senderId === userId,
          },
        ])
      }
      
      // Clear typing indicator for sender
      setTypingUsers((prev) => {
        const next = new Map(prev)
        next.delete(data.senderId)
        return next
      })
    })

    // Handle typing indicators
    channel.bind("typing", (data: { userId: string; nickname: string; isTyping: boolean }) => {
      if (data.userId === userId) return
      
      setTypingUsers((prev) => {
        const next = new Map(prev)
        if (data.isTyping) {
          next.set(data.userId, data.nickname)
        } else {
          next.delete(data.userId)
        }
        return next
      })
    })

    // Handle join requests (admin only)
    channel.bind("join-request", (data: { userId: string; nickname: string; requestedAt: number }) => {
      if (isAdmin) {
        console.log("[ChatRoom] New join request received")
        setPendingUsers((prev) => {
          if (prev.some(u => u.id === data.userId)) return prev
          return [...prev, { id: data.userId, nickname: data.nickname, requestedAt: data.requestedAt }]
        })
      }
    })

    // Handle approved requests
    channel.bind("request-approved", (data: { userId: string }) => {
      console.log("[ChatRoom] A join request was approved")
      setPendingUsers((prev) => prev.filter(u => u.id !== data.userId))
    })

    // Handle screenshot notifications
    channel.bind("screenshot-taken", (data: { userId: string; nickname: string; timestamp: number }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `screenshot-${data.timestamp}`,
          content: `📸 ${data.userId === userId ? "You" : data.nickname} took a screenshot`,
          senderId: "system",
          senderNickname: "system",
          timestamp: data.timestamp,
          isOwn: false,
          isSystem: true,
        },
      ])
    })

    // Handle kicked users
    channel.bind("user-kicked", (data: { userId: string }) => {
      console.log("[ChatRoom] A user was kicked from the room")
      setOnlineUsers((prev) => prev.filter(u => u.id !== data.userId))
    })

    // Handle being kicked
    const privateChannel = pusher.subscribe(`private-user-${userId}`)
    privateChannel.bind("kicked", () => {
      console.warn("[ChatRoom] Current user was removed from the room")
      router.push("/?kicked=true")
    })

    // Notify server when leaving (only on real page unload)
    const handleLeave = () => {
      navigator.sendBeacon("/api/room", JSON.stringify({ action: "leave", roomId, userId }))
    }

    window.addEventListener("beforeunload", handleLeave)

    return () => {
      mountedRef.current = false
      window.removeEventListener("beforeunload", handleLeave)
      pusher.unsubscribe(`presence-room-${roomId}`)
      pusher.unsubscribe(`private-user-${userId}`)
      // Use a longer delay to distinguish Strict Mode double-mount from real unmount
      const roomIdCopy = roomId
      const userIdCopy = userId
      setTimeout(() => {
        if (!mountedRef.current) {
          fetch("/api/room", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "leave", roomId: roomIdCopy, userId: userIdCopy }),
          }).catch(() => {})
        }
      }, 2000)
    }
  }, [roomId, encryptionKey, userId, nickname, isAdmin, router])

  // Send typing indicator
  const sendTypingIndicator = useCallback(async (isTyping: boolean) => {
    const now = Date.now()
    // Throttle typing events to max once per second
    if (isTyping && now - lastTypingRef.current < 1000) return
    lastTypingRef.current = now

    await fetch("/api/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, userId, nickname, isTyping }),
    })
  }, [roomId, userId, nickname])

  // Handle input change with typing indicator
  const handleInputChange = (value: string) => {
    setNewMessage(value)
    
    if (value.length > 0) {
      sendTypingIndicator(true)
      
      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      
      // Set new timeout to stop typing
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false)
      }, 2000)
    } else {
      sendTypingIndicator(false)
    }
  }

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return

    setIsSending(true)
    const messageContent = newMessage.trim()
    setNewMessage("")
    
    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    sendTypingIndicator(false)

    try {
      const encrypted = encryptMessage(messageContent, encryptionKey)
      const messageId = crypto.randomUUID()
      console.log("[ChatRoom] Sending encrypted message")

      await fetch("/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          encryptedMessage: encrypted,
          senderId: userId,
          senderNickname: nickname,
          messageId,
        }),
      })
    } catch (error) {
      console.error("Failed to send message:", error)
      // Restore message on error
      setNewMessage(messageContent)
    } finally {
      setIsSending(false)
      // Focus input after sending on mobile
      inputRef.current?.focus()
    }
  }

  // Admin: Approve join request
  const handleApproveUser = async (targetUserId: string) => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", roomId, userId, targetUserId, encryptionKey }),
    })
    setPendingUsers((prev) => prev.filter(u => u.id !== targetUserId))
  }

  // Admin: Reject join request
  const handleRejectUser = async (targetUserId: string) => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", roomId, userId, targetUserId }),
    })
    setPendingUsers((prev) => prev.filter(u => u.id !== targetUserId))
  }

  // Admin: Kick user
  const handleKickUser = async (targetUserId: string) => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kick", roomId, userId, targetUserId }),
    })
    setOnlineUsers((prev) => prev.filter(u => u.id !== targetUserId))
  }

  // Take screenshot
  const handleScreenshot = async () => {
    if (isCapturing || messages.length === 0) return
    setIsCapturing(true)
    try {
      const isDark = document.documentElement.classList.contains("dark")
      const bg = isDark ? "#1a1a2e" : "#f8fafc"
      const ownBubble = isDark ? "#1e3a2f" : "#3a9e6e"
      const otherBubble = isDark ? "#2a2a3e" : "#e8eaf0"
      const textColor = isDark ? "#f0f0f0" : "#1a1a2e"
      const mutedColor = isDark ? "#888" : "#666"
      const systemColor = isDark ? "#555" : "#aaa"
      const padding = 16
      const bubbleMaxWidth = 480
      const fontSize = 14
      const lineHeight = 20
      const headerHeight = 48

      // Measure all messages first to calculate total canvas height
      const offscreen = document.createElement("canvas")
      const octx = offscreen.getContext("2d")!
      octx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

      type RenderedMsg = {
        lines: string[]
        bubbleH: number
        isOwn: boolean
        isSystem: boolean
        nickname: string
        time: string
      }

      const rendered: RenderedMsg[] = messages.map((msg) => {
        if (msg.isSystem) {
          return { lines: [msg.content], bubbleH: 28, isOwn: false, isSystem: true, nickname: "", time: "" }
        }
        const maxTextWidth = bubbleMaxWidth - padding * 2
        const words = msg.content.split(" ")
        const lines: string[] = []
        let current = ""
        for (const word of words) {
          const test = current ? `${current} ${word}` : word
          if (octx.measureText(test).width > maxTextWidth && current) {
            lines.push(current)
            current = word
          } else {
            current = test
          }
        }
        if (current) lines.push(current)
        const nicknameH = 18
        const bubbleH = nicknameH + lines.length * lineHeight + 24 + 16 // text + time row + padding
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        return { lines, bubbleH, isOwn: msg.isOwn, isSystem: false, nickname: msg.senderNickname, time }
      })

      const totalHeight = headerHeight + rendered.reduce((sum, m) => sum + m.bubbleH + 8, 0) + padding * 2
      const canvasWidth = Math.min(640, window.innerWidth)

      const canvas = document.createElement("canvas")
      canvas.width = canvasWidth * 2
      canvas.height = totalHeight * 2
      const ctx = canvas.getContext("2d")!
      ctx.scale(2, 2)

      // Background
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvasWidth, totalHeight)

      // Header
      ctx.fillStyle = isDark ? "#16162a" : "#ffffff"
      ctx.fillRect(0, 0, canvasWidth, headerHeight)
      ctx.fillStyle = textColor
      ctx.font = `bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
      ctx.fillText(`👻 Ghost.txt — Room ${roomId}`, padding, 20)
      ctx.fillStyle = mutedColor
      ctx.font = `12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
      ctx.fillText(new Date().toLocaleString(), padding, 38)

      // Messages
      let y = headerHeight + padding
      for (const msg of rendered) {
        if (msg.isSystem) {
          ctx.fillStyle = systemColor
          ctx.font = `11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
          ctx.textAlign = "center"
          ctx.fillText(msg.lines[0], canvasWidth / 2, y + 14)
          ctx.textAlign = "left"
          y += msg.bubbleH + 8
          continue
        }

        const bubbleW = Math.min(
          bubbleMaxWidth,
          Math.max(...msg.lines.map(l => octx.measureText(l).width)) + padding * 2 + 20
        )
        const x = msg.isOwn ? canvasWidth - bubbleW - padding : padding

        // Bubble
        ctx.fillStyle = msg.isOwn ? ownBubble : otherBubble
        const r = 12
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + bubbleW - r, y)
        ctx.quadraticCurveTo(x + bubbleW, y, x + bubbleW, y + r)
        ctx.lineTo(x + bubbleW, y + msg.bubbleH - r)
        ctx.quadraticCurveTo(x + bubbleW, y + msg.bubbleH, x + bubbleW - r, y + msg.bubbleH)
        ctx.lineTo(x + r, y + msg.bubbleH)
        ctx.quadraticCurveTo(x, y + msg.bubbleH, x, y + msg.bubbleH - r)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.closePath()
        ctx.fill()

        let textY = y + padding
        // Nickname always shown
        ctx.font = `bold 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
        if (!msg.isOwn) {
          ctx.fillStyle = "#4ade80"
          ctx.textAlign = "left"
        } else {
          ctx.fillStyle = "#86efac"
          ctx.textAlign = "right"
        }
        ctx.fillText(msg.nickname, msg.isOwn ? x + bubbleW - padding : x + padding, textY)
        ctx.textAlign = "left"
        textY += 18
        // Message lines
        ctx.fillStyle = msg.isOwn ? "#ffffff" : textColor
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
        for (const line of msg.lines) {
          ctx.fillText(line, x + padding, textY)
          textY += lineHeight
        }
        // Timestamp
        ctx.fillStyle = mutedColor
        ctx.font = `10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
        ctx.textAlign = msg.isOwn ? "right" : "left"
        ctx.fillText(msg.time, msg.isOwn ? x + bubbleW - padding : x + padding, textY + 4)
        ctx.textAlign = "left"

        y += msg.bubbleH + 8
      }

      const link = document.createElement("a")
      link.download = `ghost-txt-room-${roomId}-${Date.now()}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()

      await fetch("/api/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId, nickname }),
      })
    } catch (error) {
      console.error("Screenshot failed:", error)
    } finally {
      setIsCapturing(false)
    }
  }

  // Copy share link
  const copyShareLink = async () => {
    const shareUrl = `${window.location.origin}/room/${roomId}#${encryptionKey}`
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Leave room
  const handleLeaveRoom = async () => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave", roomId, userId }),
    })
    router.push("/")
  }

  const typingList = Array.from(typingUsers.values())

  return (
    <div className="h-screen-safe flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-card/80 backdrop-blur transition-colors duration-300" style={{ paddingTop: 'max(0.625rem, calc(0.625rem + env(safe-area-inset-top)))' }}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg transition-transform duration-300 active:scale-95 sm:hover:scale-110 flex-shrink-0">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h1 className="font-semibold text-sm sm:text-base">Room {roomId}</h1>
              {isAdmin && (
                <span className="hidden xs:flex items-center gap-1 text-[10px] sm:text-xs text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded-full">
                  <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  Admin
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] sm:text-xs text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded-full transition-all duration-300">
                <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                E2EE
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
              <span className={`relative w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-colors duration-300 ${isConnected ? "bg-online" : "bg-muted-foreground"}`}>
                {isConnected && <span className="absolute inset-0 bg-online rounded-full animate-ping opacity-75" />}
              </span>
              <span className="truncate">{isConnected ? `${onlineUsers.length} online` : "Connecting..."}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleScreenshot}
            disabled={isCapturing}
            title="Download chat screenshot"
            className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground transition-all duration-300 active:scale-95"
          >
            {isCapturing ? (
              <span className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyShareLink}
            className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground transition-all duration-300 active:scale-95"
          >
            {copied ? (
              <Check className="w-4 h-4 text-online" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMobileUsers(!showMobileUsers)}
            className="lg:hidden h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLeaveRoom}
            className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300 active:scale-95"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Admin Panel for pending requests */}
      {isAdmin && (
        <AdminPanel
          pendingUsers={pendingUsers}
          onApprove={handleApproveUser}
          onReject={handleRejectUser}
        />
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 sm:space-y-3 chat-scrollbar">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground animate-in fade-in duration-500 px-4">
                <div className="p-3 sm:p-4 bg-primary/5 rounded-full mb-3 sm:mb-4 float">
                  <Lock className="w-10 h-10 sm:w-12 sm:h-12 opacity-50" />
                </div>
                <p className="text-base sm:text-lg font-medium">Secure room ready</p>
                <p className="text-xs sm:text-sm max-w-xs">Messages are end-to-end encrypted and will not be stored.</p>
                {isAdmin && (
                  <p className="text-xs sm:text-sm mt-2 text-primary">You are the admin. New members need your approval to join.</p>
                )}
              </div>
            ) : (
              messages.map((message) =>
                message.isSystem ? (
                  <div key={message.id} className="flex justify-center">
                    <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                      {message.content}
                    </span>
                  </div>
                ) : (
                  <MessageBubble
                    key={message.id}
                    content={message.content}
                    senderNickname={message.senderNickname}
                    timestamp={message.timestamp}
                    isOwn={message.isOwn}
                  />
                )
              )
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Typing indicator */}
          {typingList.length > 0 && (
            <div className="px-3 sm:px-4 pb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <TypingIndicator users={typingList} />
            </div>
          )}

          {/* Input area */}
          <div className="p-3 sm:p-4 border-t border-border bg-card/50 transition-colors duration-300" style={{ paddingBottom: 'max(0.75rem, calc(0.75rem + env(safe-area-inset-bottom)))' }}>
            <div className="flex gap-2 sm:gap-3">
              <Input
                ref={inputRef}
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                className="flex-1 bg-input transition-all duration-300 focus:scale-[1.01] input-glow h-11 sm:h-10"
                disabled={!isConnected}
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                enterKeyHint="send"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending || !isConnected}
                size="icon"
                className="h-11 w-11 sm:h-10 sm:w-10 transition-all duration-300 active:scale-95 sm:hover:scale-110 disabled:hover:scale-100 flex-shrink-0"
              >
                {isSending ? (
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Online users sidebar (desktop) */}
        <div className="hidden lg:block w-64 border-l border-border bg-card/30 transition-colors duration-300 overflow-y-auto">
          <OnlineUsers 
            users={onlineUsers} 
            currentUserId={userId}
            adminId={adminId}
            isAdmin={isAdmin}
            onKickUser={handleKickUser}
          />
        </div>

        {/* Mobile users panel */}
        {showMobileUsers && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div 
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setShowMobileUsers(false)}
            />
            <div className="absolute right-0 top-0 h-full w-72 sm:w-80 max-w-[85vw] bg-card border-l border-border animate-in slide-in-from-right duration-300 flex flex-col safe-area-top safe-area-bottom safe-area-right">
              <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
                <h2 className="font-semibold text-sm sm:text-base">Online Users</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowMobileUsers(false)}
                  className="h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <OnlineUsers 
                  users={onlineUsers} 
                  currentUserId={userId}
                  adminId={adminId}
                  isAdmin={isAdmin}
                  onKickUser={handleKickUser}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

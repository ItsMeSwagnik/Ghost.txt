"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Lock, MessageSquare, Users, Zap, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"
import { generateEncryptionKey, isValidRoomId } from "@/lib/encryption"

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen-safe flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomePageContent />
    </Suspense>
  )
}

function HomePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wasKicked = searchParams.get("kicked") === "true"
  const [nickname, setNickname] = useState("")
  const [joinRoomId, setJoinRoomId] = useState("")
  const [customRoomId, setCustomRoomId] = useState("")
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect touch device
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0)
  }, [])

  // Track mouse position for glow effect (desktop only)
  useEffect(() => {
    if (isTouchDevice) return

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [isTouchDevice])

  // Load nickname from session storage
  useEffect(() => {
    const savedNickname = sessionStorage.getItem("chat-nickname")
    if (savedNickname) {
      setNickname(savedNickname)
      // If there's a pending redirect (came from a share URL), go there now
      const redirect = sessionStorage.getItem("redirect-after-nickname")
      if (redirect) {
        sessionStorage.removeItem("redirect-after-nickname")
        router.push(redirect)
      }
    }
  }, [])

  // Save nickname to session storage and return userId
  const saveNickname = (name: string): string => {
    sessionStorage.setItem("chat-nickname", name)
    const existingUserId = sessionStorage.getItem("chat-user-id")
    if (existingUserId) return existingUserId
    const newUserId = crypto.randomUUID()
    sessionStorage.setItem("chat-user-id", newUserId)
    return newUserId
  }

  // Ripple effect handler
  const createRipple = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    const ripple = document.createElement("span")
    const rect = button.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    
    let x: number, y: number
    if ('touches' in event) {
      x = event.touches[0].clientX - rect.left - size / 2
      y = event.touches[0].clientY - rect.top - size / 2
    } else {
      x = event.clientX - rect.left - size / 2
      y = event.clientY - rect.top - size / 2
    }

    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    ripple.classList.add("ripple")

    button.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
  }

  const handleCreateRoom = async (e: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(e)
    
    if (!nickname.trim()) {
      setError("Please enter a nickname")
      return
    }

    setIsCreating(true)
    setError("")

    try {
      const roomIdToCreate = customRoomId.trim() || undefined

      if (roomIdToCreate && !isValidRoomId(roomIdToCreate)) {
        setError("Room ID must be exactly 4 digits")
        setIsCreating(false)
        return
      }

      // Save user and get userId
      const currentUserId = saveNickname(nickname.trim())

      let response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "create", 
          roomId: roomIdToCreate,
          userId: currentUserId,
          nickname: nickname.trim()
        }),
      })

      // If auto-generated ID conflicts, retry once without a roomId
      if (response.status === 409 && !roomIdToCreate) {
        response = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "create",
            userId: currentUserId,
            nickname: nickname.trim()
          }),
        })
      }

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to create room")
        setIsCreating(false)
        return
      }

      // Generate encryption key
      const encryptionKey = generateEncryptionKey()
      
      // Mark this user as the room creator
      // Clear any stale creator flags for other rooms first
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('room-creator-') && k !== `room-creator-${data.roomId}`)
        .forEach(k => sessionStorage.removeItem(k))
      sessionStorage.setItem(`room-creator-${data.roomId}`, currentUserId)

      // Navigate to room with encryption key in hash (never sent to server)
      router.push(`/room/${data.roomId}#${encryptionKey}`)
    } catch {
      setError("Failed to create room. Please try again.")
      setIsCreating(false)
    }
  }

  const handleJoinRoom = async (e: React.MouseEvent<HTMLButtonElement>) => {
    createRipple(e)
    
    if (!nickname.trim()) {
      setError("Please enter a nickname")
      return
    }

    if (!joinRoomId.trim()) {
      setError("Please enter a room ID")
      return
    }

    if (!isValidRoomId(joinRoomId.trim())) {
      setError("Room ID must be exactly 4 digits")
      return
    }

    setIsJoining(true)
    setError("")

    try {
      // First check if room exists
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", roomId: joinRoomId.trim() }),
      })

      const data = await response.json()

      if (!response.ok || !data.exists) {
        setError("Room not found or no longer available")
        setIsJoining(false)
        return
      }

      saveNickname(nickname.trim())

      // Check for a pending redirect (e.g. came from a share URL)
      const redirect = sessionStorage.getItem("redirect-after-nickname")
      if (redirect) {
        sessionStorage.removeItem("redirect-after-nickname")
        router.push(redirect)
        return
      }

      // Navigate to room - the room page will handle the join request
      router.push(`/room/${joinRoomId.trim()}`)
    } catch {
      setError("Failed to join room. Please try again.")
      setIsJoining(false)
    }
  }

  return (
    <main 
      ref={containerRef}
      className="min-h-screen-safe flex flex-col items-center justify-center px-4 py-8 sm:p-6 relative overflow-hidden"
    >
      {/* Animated background gradient that follows mouse (desktop only) */}
      {!isTouchDevice && (
        <div 
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(var(--primary) / 0.08), transparent 40%)`,
          }}
        />
      )}

      {/* Theme toggle */}
      <div className="fixed top-4 right-4 z-50 safe-area-top safe-area-right">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-4xl relative z-10">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-2.5 sm:p-3 bg-primary/10 rounded-xl float transition-transform duration-300 active:scale-95">
              <span className="text-4xl sm:text-5xl">👻</span>
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 sm:mb-3 text-balance animate-in fade-in slide-in-from-bottom-4 duration-700">
            Ghost.txt
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-md mx-auto text-pretty animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 px-2">
            End-to-end encrypted ephemeral chat rooms. No history, no traces, just secure conversations.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-8 sm:mb-10 px-1">
          <FeatureCard icon={Lock} title="E2E Encrypted" description="Messages encrypted locally" delay={0} />
          <FeatureCard icon={Eye} title="No Storage" description="Zero message history" delay={100} />
          <FeatureCard icon={Zap} title="Real-time" description="Instant messaging" delay={200} />
          <FeatureCard icon={Users} title="Private Rooms" description="4-digit secure codes" delay={300} />
        </div>

        {/* Main Cards */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Create Room Card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur card-interactive animate-in fade-in slide-in-from-left-4 duration-500">
            <CardHeader className="pb-4 sm:pb-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary transition-transform duration-300" />
                Create Room
              </CardTitle>
              <CardDescription className="text-sm">
                Start a new encrypted chat room and share the link
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm text-muted-foreground">Your Nickname</label>
                <Input
                  placeholder="Enter your nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-input transition-all duration-300 focus:scale-[1.01] sm:focus:scale-[1.02] input-glow h-11 sm:h-10"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm text-muted-foreground">
                  Room ID <span className="opacity-60">(optional)</span>
                </label>
                <Input
                  placeholder="4-digit code (or leave empty)"
                  value={customRoomId}
                  onChange={(e) => setCustomRoomId(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bg-input font-mono text-center text-lg tracking-widest transition-all duration-300 focus:scale-[1.01] sm:focus:scale-[1.02] input-glow h-11 sm:h-10"
                />
              </div>
              <Button 
                onClick={handleCreateRoom} 
                disabled={isCreating}
                className="w-full relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] h-11 sm:h-10"
              >
                {isCreating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Secure Room"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur card-interactive animate-in fade-in slide-in-from-right-4 duration-500">
            <CardHeader className="pb-4 sm:pb-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-primary transition-transform duration-300" />
                Join Room
              </CardTitle>
              <CardDescription className="text-sm">
                Enter a room ID to join an existing chat
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm text-muted-foreground">Your Nickname</label>
                <Input
                  placeholder="Enter your nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="bg-input transition-all duration-300 focus:scale-[1.01] sm:focus:scale-[1.02] input-glow h-11 sm:h-10"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-xs sm:text-sm text-muted-foreground">Room ID</label>
                <Input
                  placeholder="Enter 4-digit room code"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="bg-input font-mono text-center text-lg tracking-widest transition-all duration-300 focus:scale-[1.01] sm:focus:scale-[1.02] input-glow h-11 sm:h-10"
                />
              </div>
              <Button 
                onClick={handleJoinRoom}
                disabled={isJoining}
                variant="secondary"
                className="w-full relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] h-11 sm:h-10"
              >
                {isJoining ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-secondary-foreground border-t-transparent rounded-full animate-spin" />
                    Joining...
                  </span>
                ) : (
                  "Join Room"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Kicked notification */}
        {wasKicked && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg text-center animate-in fade-in zoom-in-95 duration-300">
            <p className="text-orange-500 text-sm">You were removed from the room by the admin.</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-center animate-in fade-in zoom-in-95 duration-300">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Security Note */}
        <div className="mt-8 sm:mt-10 text-center text-xs sm:text-sm text-muted-foreground animate-in fade-in duration-1000 delay-500 px-4">
          <p className="flex items-center justify-center gap-2 flex-wrap">
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span>Encryption keys are stored only in the URL hash - never sent to our servers</span>
          </p>
        </div>
      </div>
    </main>
  )
}

function FeatureCard({ 
  icon: Icon, 
  title, 
  description,
  delay = 0 
}: { 
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  delay?: number
}) {
  return (
    <div 
      className="p-3 sm:p-4 rounded-xl bg-secondary/30 border border-border/30 text-center transition-all duration-300 active:scale-95 sm:hover:scale-105 sm:hover:bg-secondary/50 sm:hover:border-primary/30 sm:hover:shadow-lg sm:hover:shadow-primary/10 cursor-default animate-in fade-in slide-in-from-bottom-4"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary mx-auto mb-1.5 sm:mb-2 transition-transform duration-300" />
      <h3 className="font-medium text-xs sm:text-sm">{title}</h3>
      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">{description}</p>
    </div>
  )
}

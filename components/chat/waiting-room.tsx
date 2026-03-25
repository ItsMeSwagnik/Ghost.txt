"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Clock, Shield, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import Pusher from "pusher-js"

interface WaitingRoomProps {
  roomId: string
  userId: string
  nickname: string
  encryptionKey: string | null
  onApproved: (key: string | null) => void
}

export function WaitingRoom({ roomId, userId, nickname, encryptionKey, onApproved }: WaitingRoomProps) {
  const router = useRouter()
  const [status, setStatus] = useState<'waiting' | 'approved' | 'rejected'>('waiting')
  const [dots, setDots] = useState(0)
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

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const onApprovedRef = useRef(onApproved)
  useEffect(() => { onApprovedRef.current = onApproved })

  // Listen for approval/rejection
  useEffect(() => {
    let active = true
    let pusher: Pusher | null = null

    // Defer connection slightly so Strict Mode double-invoke cleanup
    // of the first run finishes before the second run connects
    const timer = setTimeout(() => {
      if (!active) return

      pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: "/api/pusher/auth",
        auth: {
          headers: {
            "x-user-id": userId,
            "x-nickname": nickname,
          },
        },
      })

      const privateChannel = pusher.subscribe(`private-user-${userId}`)

      privateChannel.bind('join-approved', (data: { encryptionKey?: string | null }) => {
        if (!active) return
        console.log("[WaitingRoom] Join approved — entering room")
        setStatus('approved')
        setTimeout(() => {
          onApprovedRef.current(data?.encryptionKey ?? null)
        }, 1000)
      })

      privateChannel.bind('join-rejected', () => {
        if (!active) return
        console.warn("[WaitingRoom] Join request was rejected")
        setStatus('rejected')
      })
    }, 100)

    return () => {
      active = false
      clearTimeout(timer)
      if (pusher && pusher.connection.state !== 'disconnected') {
        pusher.disconnect()
      }
    }
  }, [userId, nickname])

  const handleCancel = async () => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel_request", roomId, userId }),
    })
    router.push("/")
  }

  const handleReturnHome = () => {
    router.push("/")
  }

  if (status === 'rejected') {
    return (
      <div 
        ref={containerRef}
        className="min-h-screen-safe flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      >
        {/* Animated background gradient (desktop only) */}
        {!isTouchDevice && (
          <div 
            className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
            style={{
              background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(239, 68, 68, 0.1), transparent 40%)`,
            }}
          />
        )}

        <div className="fixed top-4 right-4 z-50 safe-area-top safe-area-right">
          <ThemeToggle />
        </div>

        <div className="relative z-10 text-center max-w-md px-4 animate-in fade-in zoom-in-95 duration-500">
          <div className="p-3 sm:p-4 bg-destructive/10 rounded-full mx-auto mb-4 sm:mb-6 w-fit">
            <X className="w-12 h-12 sm:w-16 sm:h-16 text-destructive" />
          </div>
          
          <h1 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">Request Declined</h1>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
            The room admin has declined your join request. You can try joining another room or creating your own.
          </p>
          
          <Button 
            onClick={handleReturnHome}
            className="transition-all duration-300 active:scale-95 sm:hover:scale-105 h-11 sm:h-10"
          >
            Return Home
          </Button>
        </div>
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <div 
        ref={containerRef}
        className="min-h-screen-safe flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      >
        <div className="fixed top-4 right-4 z-50 safe-area-top safe-area-right">
          <ThemeToggle />
        </div>

        <div className="relative z-10 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="p-3 sm:p-4 bg-online/20 rounded-full mx-auto mb-4 sm:mb-6 w-fit">
            <Shield className="w-12 h-12 sm:w-16 sm:h-16 text-online" />
          </div>
          
          <h1 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3 text-online">Request Approved!</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Joining the secure room...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen-safe flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
    >
      {/* Animated background gradient (desktop only) */}
      {!isTouchDevice && (
        <div 
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-500"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(var(--primary) / 0.08), transparent 40%)`,
          }}
        />
      )}

      <div className="fixed top-4 right-4 z-50 safe-area-top safe-area-right">
        <ThemeToggle />
      </div>

      <div className="relative z-10 text-center max-w-md px-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="p-3 sm:p-4 bg-primary/10 rounded-full mx-auto mb-4 sm:mb-6 w-fit float">
          <Clock className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
        </div>
        
        <h1 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">Waiting Room</h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-1.5 sm:mb-2">
          Your request to join Room <span className="font-mono font-bold text-foreground">{roomId}</span> has been sent.
        </p>
        <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
          Waiting for the room admin to approve your request{'.'.repeat(dots)}
        </p>
        
        <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8 text-primary">
          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
          <span className="text-xs sm:text-sm font-medium">Pending approval</span>
        </div>

        <div className="p-3 sm:p-4 bg-secondary/30 rounded-xl border border-border/50 mb-4 sm:mb-6">
          <p className="text-xs sm:text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Tip:</span> The room creator must approve your request before you can join. This ensures only trusted people can enter the chat.
          </p>
        </div>
        
        <Button 
          variant="outline"
          onClick={handleCancel}
          className="transition-all duration-300 active:scale-95 sm:hover:scale-105 h-11 sm:h-10"
        >
          Cancel Request
        </Button>
      </div>
    </div>
  )
}

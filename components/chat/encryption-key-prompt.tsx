"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Lock, ArrowLeft, Key } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ThemeToggle } from "@/components/theme-toggle"

interface EncryptionKeyPromptProps {
  roomId: string
  onKeySubmit: (key: string) => void
}

export function EncryptionKeyPrompt({ roomId, onKeySubmit }: EncryptionKeyPromptProps) {
  const router = useRouter()
  const [key, setKey] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  const handleSubmit = () => {
    if (!key.trim()) {
      setError("Please enter the encryption key")
      return
    }

    setIsSubmitting(true)

    // Basic validation - key should be base64 encoded
    try {
      const decoded = atob(key.trim())
      if (decoded.length !== 32) {
        setError("Invalid encryption key format")
        setIsSubmitting(false)
        return
      }
    } catch {
      setError("Invalid encryption key format")
      setIsSubmitting(false)
      return
    }

    onKeySubmit(key.trim())
  }

  return (
    <main 
      ref={containerRef}
      className="min-h-screen-safe flex items-center justify-center p-4 sm:p-6 relative overflow-hidden"
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

      <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur card-interactive animate-in fade-in zoom-in-95 duration-500 relative z-10">
        <CardHeader className="text-center pb-4 sm:pb-6">
          <div className="flex items-center justify-center mb-3 sm:mb-4">
            <div className="p-2.5 sm:p-3 bg-primary/10 rounded-xl float transition-transform duration-300 active:scale-95">
              <Key className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="flex items-center justify-center gap-2 text-lg sm:text-xl animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Encryption Key Required
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
            This room uses end-to-end encryption. Ask the room creator for the encryption key to join.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="p-2.5 sm:p-3 bg-secondary/30 rounded-lg text-center transition-all duration-300 hover:bg-secondary/40 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
            <p className="text-xs sm:text-sm text-muted-foreground">Room ID</p>
            <p className="text-xl sm:text-2xl font-mono font-bold tracking-widest">{roomId}</p>
          </div>

          <div className="space-y-1.5 sm:space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-400">
            <label className="text-xs sm:text-sm text-muted-foreground">Encryption Key</label>
            <Input
              type="password"
              placeholder="Paste the encryption key here"
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError("")
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="bg-input font-mono text-xs sm:text-sm transition-all duration-300 focus:scale-[1.01] sm:focus:scale-[1.02] input-glow h-11 sm:h-10"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {error && (
              <p className="text-destructive text-xs sm:text-sm animate-in fade-in zoom-in-95 duration-200">{error}</p>
            )}
          </div>

          <div className="flex gap-2 sm:gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-500">
            <Button 
              variant="secondary" 
              onClick={() => router.push("/")}
              className="flex-1 transition-all duration-300 active:scale-[0.98] sm:hover:scale-[1.02] h-11 sm:h-10"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5 sm:mr-2" />
              Back
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 transition-all duration-300 active:scale-[0.98] sm:hover:scale-[1.02] sm:hover:shadow-lg sm:hover:shadow-primary/25 h-11 sm:h-10"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Joining...
                </span>
              ) : (
                "Join Room"
              )}
            </Button>
          </div>

          <p className="text-[10px] sm:text-xs text-muted-foreground text-center animate-in fade-in duration-500 delay-700">
            The encryption key ensures only authorized users can read messages in this room.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

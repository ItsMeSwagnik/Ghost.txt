"use client"

import { useState } from "react"
import { UserPlus, Check, X, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PendingUser {
  id: string
  nickname: string
  requestedAt: number
}

interface AdminPanelProps {
  pendingUsers: PendingUser[]
  onApprove: (userId: string) => Promise<void>
  onReject: (userId: string) => Promise<void>
}

export function AdminPanel({ pendingUsers, onApprove, onReject }: AdminPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const [processingUsers, setProcessingUsers] = useState<Set<string>>(new Set())

  const handleApprove = async (userId: string) => {
    setProcessingUsers((prev) => new Set(prev).add(userId))
    try {
      await onApprove(userId)
    } finally {
      setProcessingUsers((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  const handleReject = async (userId: string) => {
    setProcessingUsers((prev) => new Set(prev).add(userId))
    try {
      await onReject(userId)
    } finally {
      setProcessingUsers((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  const formatTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  if (pendingUsers.length === 0) {
    return null
  }

  return (
    <div className="border-b border-border bg-card/50 animate-in fade-in slide-in-from-top-2 duration-300">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-secondary/30 active:bg-secondary/40 transition-colors duration-300"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <UserPlus className="w-4 h-4 text-primary" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingUsers.length}
            </span>
          </div>
          <span className="text-xs sm:text-sm font-medium">
            {pendingUsers.length} pending request{pendingUsers.length !== 1 ? 's' : ''}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
          {pendingUsers.map((user, index) => {
            const isProcessing = processingUsers.has(user.id)
            return (
              <div
                key={user.id}
                className="flex items-center justify-between p-2.5 sm:p-3 bg-secondary/30 rounded-lg border border-border/50 animate-in fade-in slide-in-from-left-2"
                style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-xs sm:text-sm truncate">{user.nickname}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{formatTime(user.requestedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleReject(user.id)}
                    disabled={isProcessing}
                    className="h-8 w-8 sm:h-9 sm:w-9 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300 active:scale-95"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleApprove(user.id)}
                    disabled={isProcessing}
                    className="h-8 w-8 sm:h-9 sm:w-9 text-online hover:text-online hover:bg-online/10 transition-all duration-300 active:scale-95"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

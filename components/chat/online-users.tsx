"use client"

import { Users, User, Crown, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface OnlineUser {
  id: string
  nickname: string
}

interface OnlineUsersProps {
  users: OnlineUser[]
  currentUserId: string
  adminId: string
  isAdmin: boolean
  onKickUser?: (userId: string) => Promise<void>
}

export function OnlineUsers({ users, currentUserId, adminId, isAdmin, onKickUser }: OnlineUsersProps) {
  const [kickingUserId, setKickingUserId] = useState<string | null>(null)

  const handleKick = async (userId: string) => {
    if (!onKickUser) return
    setKickingUserId(userId)
    try {
      await onKickUser(userId)
    } finally {
      setKickingUserId(null)
    }
  }

  return (
    <div className="p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3 sm:mb-4 text-muted-foreground">
        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span className="text-xs sm:text-sm font-medium">Online ({users.length})</span>
      </div>
      <div className="space-y-1.5 sm:space-y-2">
        {users.map((user, index) => {
          const isUserAdmin = user.id === adminId
          const isCurrentUser = user.id === currentUserId
          const canKick = isAdmin && !isUserAdmin && !isCurrentUser

          return (
            <div
              key={user.id}
              className="group flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg hover:bg-secondary/30 active:bg-secondary/40 transition-all duration-300 sm:hover:translate-x-1 cursor-default animate-in fade-in slide-in-from-right-2"
              style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'backwards' }}
            >
              <div className="relative flex-shrink-0">
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
                  isUserAdmin ? 'bg-primary/20' : 'bg-secondary'
                }`}>
                  {isUserAdmin ? (
                    <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  ) : (
                    <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-online rounded-full border-2 border-card">
                  <span className="absolute inset-0 bg-online rounded-full animate-ping opacity-75" />
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium truncate flex items-center gap-1 flex-wrap">
                  <span className="truncate">{user.nickname}</span>
                  {isUserAdmin && (
                    <span className="text-[10px] sm:text-xs text-primary bg-primary/10 px-1 sm:px-1.5 py-0.5 rounded-full flex-shrink-0">Admin</span>
                  )}
                  {isCurrentUser && (
                    <span className="text-[10px] sm:text-xs text-muted-foreground bg-secondary px-1 sm:px-1.5 py-0.5 rounded-full flex-shrink-0">(you)</span>
                  )}
                </p>
              </div>
              {canKick && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleKick(user.id)}
                  disabled={kickingUserId === user.id}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300 flex-shrink-0"
                >
                  {kickingUserId === user.id ? (
                    <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  )}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

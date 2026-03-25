"use client"

interface TypingIndicatorProps {
  users: string[]
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  if (users.length === 0) return null

  const getText = () => {
    if (users.length === 1) {
      return `${users[0]} is typing`
    } else if (users.length === 2) {
      return `${users[0]} and ${users[1]} are typing`
    } else {
      return `${users.length} people are typing`
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="flex items-center gap-2 bg-secondary/50 rounded-full px-3 py-1.5 transition-all duration-300 hover:bg-secondary/70">
        <div className="flex gap-1">
          <span className="typing-dot w-2 h-2 bg-primary rounded-full" />
          <span className="typing-dot w-2 h-2 bg-primary rounded-full" />
          <span className="typing-dot w-2 h-2 bg-primary rounded-full" />
        </div>
        <span className="text-xs font-medium">{getText()}</span>
      </div>
    </div>
  )
}

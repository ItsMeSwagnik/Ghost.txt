"use client"

import { Check } from "lucide-react"

interface MessageBubbleProps {
  content: string
  senderNickname: string
  timestamp: number
  isOwn: boolean
}

export function MessageBubble({ content, senderNickname, timestamp, isOwn }: MessageBubbleProps) {
  const time = new Date(timestamp).toLocaleTimeString([], { 
    hour: "2-digit", 
    minute: "2-digit" 
  })

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${isOwn ? "message-own" : "message-other"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 transition-all duration-300 hover:scale-[1.02] ${
          isOwn
            ? "bg-message-own text-foreground rounded-br-md"
            : "bg-message-other text-foreground rounded-bl-md"
        }`}
      >
        {!isOwn ? (
          <p className="text-xs font-medium text-primary mb-1">{senderNickname}</p>
        ) : (
          <p className="text-xs font-medium text-primary/70 mb-1 text-right">{senderNickname}</p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] text-muted-foreground">{time}</span>
          {isOwn && (
            <Check className="w-3 h-3 text-primary" />
          )}
        </div>
      </div>
    </div>
  )
}

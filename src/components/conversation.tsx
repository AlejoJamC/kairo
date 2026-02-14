import type { Message } from "@/types";
import { Bot, User } from "lucide-react";

interface ConversationProps {
  messages: Message[];
}

export function Conversation({ messages }: ConversationProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg, i) => (
        <div key={i} className="flex gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              msg.sender === "customer" ? "bg-zinc-200" : "bg-zinc-700"
            }`}
          >
            {msg.sender === "customer" ? (
              <User className="h-4 w-4 text-zinc-600" />
            ) : (
              <Bot className="h-4 w-4 text-white" />
            )}
          </div>
          <div
            className={`flex-1 rounded-lg px-4 py-3 text-sm ${
              msg.sender === "customer"
                ? "bg-zinc-100 text-zinc-800"
                : "bg-zinc-50 text-zinc-700"
            }`}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {/* Placeholder message blocks matching design */}
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200">
          <User className="h-4 w-4 text-zinc-600" />
        </div>
        <div className="flex-1 space-y-2 rounded-lg bg-zinc-100 px-4 py-3">
          <div className="h-3 w-3/4 rounded bg-zinc-300" />
          <div className="h-3 w-1/2 rounded bg-zinc-300" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200">
          <User className="h-4 w-4 text-zinc-600" />
        </div>
        <div className="flex-1 space-y-2 rounded-lg bg-zinc-100 px-4 py-3">
          <div className="h-3 w-2/3 rounded bg-zinc-300" />
          <div className="h-3 w-5/6 rounded bg-zinc-300" />
        </div>
      </div>
    </div>
  );
}

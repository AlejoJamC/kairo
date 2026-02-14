import type { Message } from "@/types";
import { Bot, User } from "lucide-react";

interface ConversationProps {
  messages: Message[];
}

export function Conversation({ messages }: ConversationProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((msg, i) => {
        const isCustomer = msg.sender === "customer";
        return (
          <div
            key={i}
            className={`flex gap-3 ${isCustomer ? "" : "flex-row-reverse"}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                isCustomer ? "bg-zinc-200" : "bg-zinc-700"
              }`}
            >
              {isCustomer ? (
                <User className="h-4 w-4 text-zinc-600" />
              ) : (
                <Bot className="h-4 w-4 text-white" />
              )}
            </div>
            <div
              className={`max-w-[75%] rounded-lg px-4 py-3 shadow-sm ${
                isCustomer
                  ? "bg-white border border-gray-200 text-zinc-800"
                  : "bg-blue-50 text-zinc-700 ml-auto"
              }`}
            >
              <p className="text-sm">{msg.content}</p>
              <p className="mt-1 text-xs text-gray-400">{msg.timestamp}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

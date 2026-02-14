import { Mic, Smile, Paperclip, Pen } from "lucide-react";

export function ReplyBar() {
  return (
    <div className="border-t bg-white">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <Pen className="h-4 w-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Reply..."
          className="flex-1 bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
        />
        <div className="flex items-center gap-2">
          <button className="text-zinc-400 hover:text-zinc-600">
            <Mic className="h-4 w-4" />
          </button>
          <button className="text-zinc-400 hover:text-zinc-600">
            <Smile className="h-4 w-4" />
          </button>
          <button className="text-zinc-400 hover:text-zinc-600">
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

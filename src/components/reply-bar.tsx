import { Paperclip, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function ReplyBar() {
  const { t } = useTranslation("dashboard");

  return (
    <div className="border-t bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <textarea
          rows={3}
          placeholder={t("ticketDetail.replyPlaceholder")}
          className="flex-1 resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
        />
        <div className="flex flex-col gap-1.5">
          <Button size="sm" className="text-xs">
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {t("ticketDetail.send")}
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            {t("ticketDetail.attach")}
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Zap className="mr-1.5 h-3.5 w-3.5" />
            {t("ticketDetail.quickReply")}
          </Button>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{t("ticketDetail.sendHint")}</p>
    </div>
  );
}

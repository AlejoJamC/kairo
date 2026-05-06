import * as React from "react";
import { Paperclip, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { TemplatePicker } from "./template-picker";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";

export function ReplyBar() {
  const { t } = useTranslation("dashboard");
  const selectedTicketId = useTriageStore((s) => s.selectedTicketId);

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);

  function handleTemplateSelect(content: string) {
    if (draft.trim()) {
      if (!window.confirm(t("templatePicker.confirmOverwrite"))) return;
    }
    setDraft(content);
    setSendError(null);
  }

  async function handleSend() {
    if (!draft.trim() || !selectedTicketId || sending) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await apiCall(`/v1/tickets/${selectedTicketId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: draft }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = (body as { error?: string }).error ?? "";
        const msg =
          code === "GMAIL_TOKEN_EXPIRED"
            ? t("replyBar.errorTokenExpired")
            : code === "NO_GMAIL_INTEGRATION"
              ? t("replyBar.errorNoGmail")
              : t("replyBar.errorGeneric");
        setSendError(msg);
        console.error("[ReplyBar] send failed", body);
        return;
      }

      setDraft("");
    } catch (err) {
      console.error("[ReplyBar] send error", err);
      setSendError(t("replyBar.errorGeneric"));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = !!draft.trim() && !!selectedTicketId && !sending;

  return (
    <div className="border-t bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <textarea
          rows={3}
          placeholder={t("ticketDetail.replyPlaceholder")}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={handleKeyDown}
          className="flex-1 resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
        />
        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="text-xs"
            disabled={!canSend}
            onClick={handleSend}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {sending ? t("replyBar.sending") : t("ticketDetail.send")}
          </Button>
          <Button variant="outline" size="sm" className="text-xs">
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            {t("ticketDetail.attach")}
          </Button>
          <TemplatePicker onSelect={handleTemplateSelect}>
            <Button variant="outline" size="sm" className="text-xs">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              {t("ticketDetail.quickReply")}
            </Button>
          </TemplatePicker>
        </div>
      </div>

      {sendError ? (
        <p className="mt-1.5 text-xs text-red-500">{sendError}</p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-400">{t("ticketDetail.sendHint")}</p>
      )}
    </div>
  );
}

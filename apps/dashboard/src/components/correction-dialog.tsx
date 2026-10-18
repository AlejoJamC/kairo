import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Button, Chip, Dialog, FieldLabel, FieldTextarea, Text } from "@kairo/ui";
import { correctClassification } from "@kairo/client-core/endpoints";
import { TICKET_PRIORITIES, TICKET_TYPES, TICKET_CATEGORIES, TICKET_TONES, type Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// Option lists — the canonical vocabulary lives in @kairo/types, which the
// DB CHECK constraints and packages/intelligence's ClassificationSchema both
// derive from too.
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS   = TICKET_PRIORITIES;
const TYPE_OPTIONS       = TICKET_TYPES;
const CATEGORY_OPTIONS   = TICKET_CATEGORIES;
const SENTIMENT_OPTIONS  = TICKET_TONES;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrectionFields {
  correct_ticket_type?: string;
  correct_priority?: string;
  correct_category?: string;
  correct_sentiment?: string;
}

interface CorrectionDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrected: (fields: CorrectionFields) => void;
}

// ---------------------------------------------------------------------------
// CorrectionDialog
// ---------------------------------------------------------------------------

export function CorrectionDialog({
  ticket,
  open,
  onOpenChange,
  onCorrected,
}: CorrectionDialogProps) {
  const { t } = useTranslation("dashboard");

  const [priority,   setPriority]   = useState("");
  const [ticketType, setTicketType] = useState("");
  const [category,   setCategory]   = useState("");
  const [sentiment,  setSentiment]  = useState("");
  const [notes,      setNotes]      = useState("");

  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const NOTE_MAX = 2000;
  const notesId = useId();

  function resetForm() {
    setPriority("");
    setTicketType("");
    setCategory("");
    setSentiment("");
    setNotes("");
    setError(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!priority && !ticketType && !category && !sentiment) {
      setError(t("correction.errorEmpty"));
      return;
    }

    const body: Record<string, string> = {};
    if (priority)   body.correct_priority    = priority;
    if (ticketType) body.correct_ticket_type = ticketType;
    if (category)   body.correct_category    = category;
    if (sentiment)  body.correct_sentiment   = sentiment;
    if (notes.trim()) body.notes = notes.trim();

    setLoading(true);
    setError(null);

    try {
      const res = await correctClassification(ticket.id, body);

      if (!res.ok) {
        setError(t("correction.errorGeneric"));
        return;
      }

      setSuccess(true);
      onCorrected(body as CorrectionFields);

      // Close after brief success flash
      setTimeout(() => handleOpenChange(false), 900);
    } catch {
      setError(t("correction.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  const dirty = Boolean(priority || ticketType || category || sentiment || notes);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("correction.dialogTitle")}
      dirty={dirty || loading}
      closeLabel={t("correction.cancel")}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={loading} onPress={() => handleOpenChange(false)}>
            {t("correction.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={loading}
            loadingLabel={t("correction.submitting")}
            disabled={notes.length > NOTE_MAX}
            onPress={handleSubmit}
          >
            {t("correction.submit")}
          </Button>
        </>
      }
    >
      <Text tag="p" margin={0} fontSize={12} color="var(--k-text-tertiary)" display="block">{t("correction.dialogSubtitle")}</Text>

      {/* Current AI values */}
      <Text tag="div" borderRadius={6} backgroundColor="var(--k-surface)" borderWidth={1} borderColor="var(--k-border-subtle)" paddingVertical={6} paddingHorizontal={10} fontSize={11} font="mono" color="var(--k-text-tertiary)" display="block" borderStyle="solid">
        AI: {[ticket.priority, ticket.ticket_type, ticket.category, ticket.sentiment]
          .filter(Boolean)
          .join(" · ") || "—"}
      </Text>

      <ChoiceGroup
        label={t("correction.fieldPriority")}
        options={PRIORITY_OPTIONS}
        value={priority}
        onChange={setPriority}
        format={(v) => v}
        disabled={loading}
      />
      <ChoiceGroup
        label={t("correction.fieldType")}
        options={TYPE_OPTIONS}
        value={ticketType}
        onChange={setTicketType}
        format={(v) => t(`ticketTypes.${v}`)}
        disabled={loading}
      />
      <ChoiceGroup
        label={t("correction.fieldCategory")}
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={setCategory}
        format={(v) => t(`ticketCategories.${v}`)}
        disabled={loading}
      />
      <ChoiceGroup
        label={t("correction.fieldSentiment")}
        options={SENTIMENT_OPTIONS}
        value={sentiment}
        onChange={setSentiment}
        format={(v) => t(`correction.tones.${v}`)}
        disabled={loading}
      />

      {/* Notes */}
      <Box display="flex" flexDirection="column" gap={6}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <FieldLabel htmlFor={notesId}>{t("correction.fieldNotes")}</FieldLabel>
          <Text color={notes.length > NOTE_MAX ? "var(--kairo-color-bad)" : "var(--k-text-tertiary)"} font="mono" fontSize={11}>
            {notes.length}/{NOTE_MAX}
          </Text>
        </Box>
        <FieldTextarea
          id={notesId}
          rows={2}
          maxLength={NOTE_MAX}
          placeholder={t("correction.fieldNotesPlaceholder")}
          value={notes}
          onChangeText={setNotes}
          disabled={loading}
        />
      </Box>

      {error && <Text tag="p" role="alert" fontSize={12} color="var(--kairo-color-bad)" margin={0} display="block">{error}</Text>}
      {success && <Text tag="p" role="status" fontSize={12} color="var(--kairo-color-ok)" fontWeight={500} margin={0} display="block">{t("correction.successMsg")}</Text>}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ChoiceGroup — one label and a row of chips; pressing the chosen chip again
// clears the choice, so "leave as classified" stays the default.
// ---------------------------------------------------------------------------

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  format,
  disabled,
}: {
  label: string;
  options: readonly T[];
  value: string;
  onChange: (next: string) => void;
  format: (option: T) => string;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <Box role="group" aria-labelledby={labelId} display="flex" flexDirection="column" gap={6}>
      <FieldLabel tag="div" id={labelId}>{label}</FieldLabel>
      <Box display="flex" flexWrap="wrap" gap={6}>
        {options.map((option) => (
          <Chip
            key={option}
            selected={value === option}
            disabled={disabled}
            onPress={() => onChange(value === option ? "" : option)}
          >
            {format(option)}
          </Chip>
        ))}
      </Box>
    </Box>
  );
}

import { useTranslation } from "react-i18next";
import type { ContactRow } from "@kairo/client-core/contact-row";
import {
  Box, DataTableMainCell, Icon, Menu, MenuItem, Popover, PopoverContent, PopoverTrigger, Pressable, Spinner, Text,
  type DataTableColumn,
} from "@kairo/ui";
import { CsatCell, ExternalSourceBadge, StatusBadge } from "@/components/clients/contact-parts";
import { PLAN_DOT, PLAN_LABEL, relativeTime } from "@/components/clients/contact-helpers";

interface ContactColumnHandlers {
  onEdit: (row: ContactRow) => void;
  onDelete: (row: ContactRow) => void;
  onQuickConfirm: (row: ContactRow) => void;
  /** id of the client row being deleted. */
  deletingId: string | null;
}

const HEADERS = ["CLIENTE", "PLAN", "MRR", "TICKETS", "CSAT", "ÚLTIMO CONTACTO", ""];

/** Columns of the contacts table: clients and drafts share one row model. */
export function useContactColumns({ onEdit, onDelete, onQuickConfirm, deletingId }: ContactColumnHandlers): DataTableColumn<ContactRow>[] {
  const { t } = useTranslation("clients");
  return [
    {
      id: "contact", header: HEADERS[0]!, width: "2.5fr",
      render: (row) => (
        <DataTableMainCell
          name={row.displayName}
          seed={row.id}
          sub={row.organization ? `${row.organization} · ${row.email ?? row.phone ?? ""}` : (row.email ?? row.phone ?? "—")}
          badge={<>
            <StatusBadge status={row.status} />
            {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
          </>}
        />
      ),
    },
    {
      id: "plan", header: HEADERS[1]!, width: "1fr",
      render: (row) => (
        <Box display="flex" alignItems="center" gap={6}>
          {row.source !== "draft" && row.plan ? (
            <>
              <Box width={6} height={6} circle flexShrink={0} backgroundColor={PLAN_DOT[row.plan] ?? "var(--kairo-color-faint)"} />
              <span>{PLAN_LABEL[row.plan] ?? row.plan}</span>
            </>
          ) : <Text color="var(--k-text-tertiary)">—</Text>}
        </Box>
      ),
    },
    { id: "mrr", header: HEADERS[2]!, width: "0.8fr", render: () => <Text font="mono" color="var(--k-text-secondary)">—</Text> },
    { id: "tickets", header: HEADERS[3]!, width: "0.8fr", render: (row) => <Text font="mono">{row.ticketCount}</Text> },
    {
      id: "csat", header: HEADERS[4]!, width: "1fr",
      render: (row) => row.source !== "draft" ? <CsatCell value={row.csatAvg} /> : <Text color="var(--k-text-tertiary)" font="mono">—</Text>,
    },
    {
      id: "last", header: HEADERS[5]!, width: "0.8fr",
      render: (row) => <Text font="mono" fontSize={12} color="var(--k-text-tertiary)">{relativeTime(row.lastSeenAt)}</Text>,
    },
    {
      id: "actions", header: HEADERS[6]!, width: "36px",
      render: (row, { hovered }) => {
        const isDraft = row.source === "draft";
        const deleting = deletingId === row.id.replace("client:", "");
        return (
          <Box position="relative" onClick={(e) => e.stopPropagation()}>
            {isDraft && row.status === "proposed" && (
              <Pressable onClick={() => onQuickConfirm(row)} title={t("actions.confirm")} display="flex" alignItems="center" gap={4} paddingVertical={3} paddingHorizontal={8} borderRadius={5} backgroundColor="color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" borderWidth={1} borderColor="color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" color="var(--kairo-color-ok)" fontSize={11} fontWeight={600} opacity={hovered ? 1 : 0} transition="opacity 0.1s" borderStyle="solid">
                <Icon name="check" size={11} />
                {t("actions.confirm")}
              </Pressable>
            )}
            {!isDraft && (
              <Popover>
                <PopoverTrigger>
                  <Pressable aria-label={t("actions.more")} padding={4} borderRadius={5} color="var(--k-text-tertiary)" opacity={hovered ? 1 : 0} transition="opacity 0.1s">
                    {deleting ? <Spinner /> : <Icon name="more" size={14} />}
                  </Pressable>
                </PopoverTrigger>
                <PopoverContent role="menu" label={t("actions.more")} width={160}>
                  <Menu label={t("actions.more")}>
                    <MenuItem label={t("actions.edit")} icon={<Icon name="draft" size={13} />} onSelect={() => onEdit(row)} />
                    <MenuItem label={t("actions.delete")} icon={<Icon name="trash" size={13} />} destructive disabled={deleting} onSelect={() => onDelete(row)} />
                  </Menu>
                </PopoverContent>
              </Popover>
            )}
          </Box>
        );
      },
    },
  ];
}

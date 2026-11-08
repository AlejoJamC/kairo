// Articles tab of the context panel: knowledge-base articles for the open ticket.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getKnowledgeContext } from "@kairo/client-core/endpoints";
import { Box, Button, Chip, Icon, Skeleton, Text } from "@kairo/ui";

interface KbArticle {
  id:         string;
  title:      string;
  content:    string;
  tags:       string[] | null;
  similarity: number | null;
}

function formatSim(s: number | null): string | null {
  return s === null ? null : `${Math.round(s * 100)}%`;
}

export function ArticlesTab({ ticketId }: { ticketId: string | null }) {
  const { t } = useTranslation("dashboard");
  const setSuggestedReply = useTriageStore((s) => s.setSuggestedReply);

  // The result is kept with the ticket it belongs to, so another ticket never shows it.
  const [loaded, setLoaded] = useState<{ ticketId: string; articles: KbArticle[] } | null>(null);
  const loading = !!ticketId && loaded?.ticketId !== ticketId;
  const articles = loaded && loaded.ticketId === ticketId ? loaded.articles : [];

  useEffect(() => {
    if (!ticketId) return;
    let current = true;
    getKnowledgeContext(ticketId)
      .then(async (res) => {
        const json: { kbArticles: KbArticle[] } = res.ok ? await res.json() : { kbArticles: [] };
        if (current) setLoaded({ ticketId, articles: json.kbArticles ?? [] });
      })
      .catch(() => { if (current) setLoaded({ ticketId, articles: [] }); });
    return () => { current = false; };
  }, [ticketId]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" gap={8}>
        <Skeleton height={72} borderRadius={8} />
        <Skeleton height={72} borderRadius={8} />
      </Box>
    );
  }

  if (!ticketId || articles.length === 0) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("ai.noKbArticles")}
      </Text>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={6}>
      {articles.map((article) => (
        <Box key={article.id} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" borderLeftWidth={3} borderLeftColor="var(--k-accent)" paddingTop={10} paddingRight={10} paddingBottom={10} paddingLeft={12} display="flex" flexDirection="column" gap={6} borderStyle="solid">
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
            <Text fontSize={13} fontWeight={500} color="var(--k-text-primary)" lineHeight={17.55} display="flex" alignItems="center" gap={6}>
              <Icon name="knowledge" size={13} color="var(--k-text-tertiary)" />
              {article.title}
            </Text>
            {formatSim(article.similarity) && (
              <Text flexShrink={0} fontSize={10} font="mono" paddingVertical={2} paddingHorizontal={6} borderRadius={4} backgroundColor="var(--k-accent-subtle)" color="var(--k-accent)">
                {formatSim(article.similarity)}
              </Text>
            )}
          </Box>
          {article.tags && article.tags.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {article.tags.map((tag) => (
                <Chip key={tag} size="sm">{tag}</Chip>
              ))}
            </Box>
          )}
          <Button variant="link" size="sm" icon={<Icon name="note" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => setSuggestedReply(article.content)}>
            {t("ai.useInReply")}
          </Button>
        </Box>
      ))}
    </Box>
  );
}

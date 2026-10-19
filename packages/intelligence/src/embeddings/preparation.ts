export const SEMANTIC_PREPARATIONS = {
  ticket: 'ticket:subject-body:1000:v1',
  kb_article: 'article:title-content:v1',
  knowledge_version: 'knowledge:title-body:2000:v1',
} as const;

export function prepareTicketEmbeddingText(subject: string, body: string): string {
  return [subject.trim(), body.trim()].filter(Boolean).join('\n\n').slice(0, 1000);
}

export function prepareArticleEmbeddingText(title: string, content: string): string {
  return [title.trim(), content.trim()].filter(Boolean).join('\n\n');
}

export function prepareKnowledgeEmbeddingText(snapshot: Record<string, unknown>): string {
  const evidence = snapshot['evidence'] as { title?: unknown } | undefined;
  const title = snapshot['title'] ?? evidence?.title ?? '';
  const body = snapshot['content'] ?? snapshot['summary'] ?? '';
  return `${String(title)}\n${String(body)}`.trim().slice(0, 2000);
}

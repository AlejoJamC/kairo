"use client";

import { Box, CategoryChip, ConfidenceRing, PriorityGlyph, Text } from "@kairo/ui";

export interface QueuePreviewItem {
  id: string;
  title: string;
  priority: string | null;
  /** Mono ticket id, before the title. */
  code?: string;
  age?: string;
  /** Second line: the category and the AI confidence. */
  category?: { value: string; label: string };
  confidence?: number | null;
  selected?: boolean;
  faded?: boolean;
}

/** A queue row of the public web's examples: priority, title and, when given, category and confidence. */
export function QueuePreviewRow({ item, confidenceLabel }: { item: QueuePreviewItem; confidenceLabel: string }) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={6}
      padding={10}
      borderRadius={9}
      borderWidth={1}
      borderStyle="solid"
      borderColor={item.selected ? "var(--kairo-color-accent-line)" : "transparent"}
      backgroundColor={item.selected ? "var(--kairo-color-accent-soft)" : "transparent"}
      opacity={item.faded ? 0.7 : 1}
    >
      <Box display="flex" alignItems="center" gap={8}>
        <PriorityGlyph priority={item.priority} label={false} />
        {item.code && (
          <Text font="mono" fontSize={11.5} color="var(--kairo-color-faint)">
            {item.code}
          </Text>
        )}
        <Text flexGrow={1} flexShrink={1} flexBasis="0%" minWidth={0} fontSize={13} fontWeight={500} color="var(--kairo-color-text)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
          {item.title}
        </Text>
        {item.age && (
          <Text font="mono" fontSize={11} color="var(--kairo-color-faint)">
            {item.age}
          </Text>
        )}
      </Box>
      {item.category && (
        <Box display="flex" alignItems="center" gap={8} paddingLeft={22}>
          <CategoryChip scale="category" size="sm" value={item.category.value} label={item.category.label} />
          <Box flexGrow={1} />
          <ConfidenceRing variant="numeric" value={item.confidence} label={confidenceLabel} />
        </Box>
      )}
    </Box>
  );
}

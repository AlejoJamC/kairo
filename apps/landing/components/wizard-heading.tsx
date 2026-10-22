"use client";

import { Box, Text } from "@kairo/ui";

/** The heading of a wizard step: eyebrow with the step, title and one line of context. */
export function WizardHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <Box display="flex" flexDirection="column" gap={12}>
      <Text tag="span" display="block" font="mono" fontSize={11.5} letterSpacing={0.69} textTransform="uppercase" color="var(--kairo-color-faint)">
        {eyebrow}
      </Text>
      <Text tag="h1" display="block" margin={0} fontSize={36} fontWeight={600} lineHeightRatio={1.12} letterSpacing={-0.94} color="var(--kairo-color-text)">
        {title}
      </Text>
      <Text tag="p" display="block" margin={0} fontSize={15} lineHeightRatio={1.6} color="var(--kairo-color-muted)">
        {body}
      </Text>
    </Box>
  );
}

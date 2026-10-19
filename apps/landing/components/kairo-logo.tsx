"use client";

import { Icon, Text } from "@kairo/ui";
import { AppLink } from "@/components/app-link";

interface KairoLogoProps {
  size?: number;
  href?: string;
}

export function KairoLogo({ size = 28, href = "/" }: KairoLogoProps) {
  const inner = (
    <Text display="inline-flex" alignItems="center" gap={8}>
      <Text width={size} height={size} borderRadius={6} backgroundImage="linear-gradient(135deg, var(--kairo-color-accent), var(--kairo-color-accent-hover))" display="inline-flex" alignItems="center" justifyContent="center" flexShrink={0}>
        <Icon name="zap" size={Math.round(size * 0.55)} color="var(--kairo-color-on-accent)" strokeWidth={2.5} />
      </Text>
      <Text fontWeight={600} fontSize={size * 0.6} letterSpacing={-0.01 * size * 0.6} color="var(--kairo-color-text)">
        Kairo
      </Text>
    </Text>
  );

  return href ? <AppLink href={href}>{inner}</AppLink> : inner;
}

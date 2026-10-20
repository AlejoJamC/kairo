"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Text, type TextProps } from "@kairo/ui";

type AppLinkProps = Omit<TextProps, "tag" | "href" | "onClick"> & { href: string; onClick?: TextProps["onClick"] };

const isInternal = (href: string) => href.startsWith("/") && !href.startsWith("//");

/** An anchor styled with the UI primitives that navigates client-side for internal paths. */
export function AppLink({ href, onClick, ...props }: AppLinkProps) {
  const router = useRouter();
  const handle = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!isInternal(href)) return;
    event.preventDefault();
    router.push(href);
  };
  return <Text tag="a" href={href} textDecoration="none" onClick={handle} {...props} />;
}

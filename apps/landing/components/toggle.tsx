"use client";

import { useState } from "react";

interface ToggleProps {
  defaultOn?: boolean;
  onChange?: (v: boolean) => void;
}

export function Toggle({ defaultOn = false, onChange }: ToggleProps) {
  const [on, setOn] = useState(defaultOn);

  const handleClick = () => {
    const next = !on;
    setOn(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-checked={on}
      role="switch"
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "var(--accent)" : "var(--border)",
        position: "relative",
        transition: "background 0.15s ease",
        flexShrink: 0,
        border: "none",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "white",
          transition: "left 0.15s ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

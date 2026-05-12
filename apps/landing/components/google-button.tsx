"use client";

import React from "react";

interface GoogleButtonProps {
  label: string;
  onClick?: () => void;
  href?: string;
}

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#EA4335" d="M12 11v3.4h4.8a4.8 4.8 0 01-2 3.1v2.6h3.3c1.9-1.8 3-4.4 3-7.5 0-.7-.1-1.4-.2-2L12 11z" />
    <path fill="#34A853" d="M12 21c2.7 0 5-.9 6.6-2.4l-3.3-2.6c-.9.6-2 1-3.3 1-2.5 0-4.7-1.7-5.5-4H3.2v2.5A10 10 0 0012 21z" />
    <path fill="#FBBC05" d="M6.5 13c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V6.5H3.2A10 10 0 002 11c0 1.6.4 3.2 1.2 4.5L6.5 13z" />
    <path fill="#4285F4" d="M12 5.4c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 2.3 14.6 1.4 12 1.4A10 10 0 003.2 6.5L6.5 9c.8-2.3 3-4 5.5-4z" />
  </svg>
);

const baseStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  width: "100%",
  padding: "12px 14px",
  fontSize: 14,
  fontWeight: 500,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-input)",
  background: "white",
  color: "var(--text-primary)",
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
  transition: "background 0.12s ease",
  boxSizing: "border-box",
};

export function GoogleButton({ label, onClick, href }: GoogleButtonProps) {
  if (href) {
    return (
      <a
        href={href}
        style={baseStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
      >
        <GoogleIcon />
        {label}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
    >
      <GoogleIcon />
      {label}
    </button>
  );
}

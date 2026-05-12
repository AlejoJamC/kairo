"use client";

import React, { useState } from "react";

interface AuthInputProps {
  label: string;
  id: string;
  type?: string;
  placeholder: string;
  icon: React.ReactNode;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
}

export function AuthInput({
  label,
  id,
  type = "text",
  placeholder,
  icon,
  value,
  onChange,
  required,
  autoComplete,
}: AuthInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <label style={{ display: "block" }} htmlFor={id}>
      <div
        style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 12px",
          border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "var(--radius-input)",
          background: "white",
          height: 38,
          boxShadow: focused ? "0 0 0 3px rgba(43,91,255,0.12)" : "none",
          transition: "border-color 0.12s ease, box-shadow 0.12s ease",
        }}
      >
        {icon}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            fontSize: 14,
            background: "transparent",
            color: "var(--text-primary)",
            fontFamily: "inherit",
          }}
        />
      </div>
    </label>
  );
}

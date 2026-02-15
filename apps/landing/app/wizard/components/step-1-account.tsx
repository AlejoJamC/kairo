"use client";

import { useState } from "react";
import { User, Mail, Building2 } from "lucide-react";
import type { FormData } from "../types";

interface Step1Props {
  formData: FormData;
  onUpdate: (updates: Partial<FormData>) => void;
  onNext: () => void;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Step1Account({ formData, onUpdate, onNext }: Step1Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = {
    name: !formData.name.trim() ? "Full name is required" : "",
    email: !formData.email.trim()
      ? "Email is required"
      : !emailRegex.test(formData.email)
        ? "Enter a valid email address"
        : "",
    company: !formData.company.trim() ? "Company name is required" : "",
  };

  const isValid = !errors.name && !errors.email && !errors.company;

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) onNext();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {([
        { key: "name", label: "Full Name", icon: User, type: "text", placeholder: "John Doe" },
        { key: "email", label: "Work Email", icon: Mail, type: "email", placeholder: "john@company.com" },
        { key: "company", label: "Company Name", icon: Building2, type: "text", placeholder: "Acme Inc." },
      ] as const).map(({ key, label, icon: Icon, type, placeholder }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
          <div className="relative">
            <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type={type}
              value={formData[key]}
              onChange={(e) => onUpdate({ [key]: e.target.value })}
              onBlur={() => handleBlur(key)}
              placeholder={placeholder}
              className={`w-full pl-11 pr-4 py-3 border rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
                touched[key] && errors[key]
                  ? "border-red-300 bg-red-50"
                  : "border-gray-300"
              }`}
            />
          </div>
          {touched[key] && errors[key] && (
            <p className="mt-1 text-sm text-red-500">{errors[key]}</p>
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={!isValid}
        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition mt-2"
      >
        Continue
      </button>
    </form>
  );
}

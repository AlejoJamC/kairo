import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

export type WizardStep = 1 | 2 | 3;

export interface FormData {
  name: string;
  email: string;
  company: string;
  connectedProviders: string[];
}

export interface OAuthProvider {
  id: string;
  name: string;
  icon: ComponentType<LucideProps>;
  color: string;
}

import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kairo/ui";
import { useLocale } from "@/hooks/useLocale";
import type { SupportedLanguage } from "@/i18n/types";

export function LanguageSwitcher() {
  const { language, setLanguage, supportedLanguages, languageMeta } =
    useLocale();

  return (
    <DropdownMenu>
      {/* asChild removed — DropdownMenuTrigger is already a <button>; use Tailwind classes for ghost/sm visual parity */}
      <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-accent transition-colors">
        <Globe className="h-4 w-4" />
        <span className="text-xs">
          {languageMeta[language].nativeLabel}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {supportedLanguages.map((lang: SupportedLanguage) => (
          <DropdownMenuItem
            key={lang}
            onPress={() => setLanguage(lang)}
            className={lang === language ? "bg-accent" : ""}
          >
            <span className="mr-2 text-sm">{languageMeta[lang].nativeLabel}</span>
            {lang === language && (
              <span className="ml-auto text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

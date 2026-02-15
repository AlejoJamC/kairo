import { Hero } from "@/components/hero";
import { CTAButton } from "@/components/cta-button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100">
      <Hero />
      <CTAButton />
    </main>
  );
}

"use client";

import { useTranslation } from "@/lib/i18n";

export default function TermsPage() {
  const { t } = useTranslation();
  const tr = t.terms;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            {tr.title}
          </h1>
          <p className="text-neutral-600">{tr.updated}</p>
        </div>

        <div className="prose prose-neutral max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s1.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s1.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s2.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {tr.s2.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {tr.s2.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s3.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {tr.s3.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {tr.s3.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s4.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {tr.s4.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {tr.s4.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s5.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s5.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s6.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s6.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s7.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {tr.s7.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {tr.s7.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s8.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {tr.s8.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {tr.s8.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s9.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s9.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s10.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s10.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {tr.s11.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{tr.s11.intro}</p>
            <ul className="list-none space-y-2 text-neutral-700 mt-4">
              <li>
                {tr.s11.emailLabel}{" "}
                <a
                  href="mailto:get.kairo.ai@gmail.com"
                  className="text-blue-600 hover:underline"
                >
                  get.kairo.ai@gmail.com
                </a>
              </li>
              <li>
                {tr.s11.websiteLabel}{" "}
                <a
                  href="https://kairo.alejojamc.com"
                  className="text-blue-600 hover:underline"
                >
                  kairo.alejojamc.com
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

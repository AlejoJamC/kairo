"use client";

import { useTranslation } from "@/lib/i18n";

export default function PrivacyPage() {
  const { t } = useTranslation();
  const p = t.privacy;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            {p.title}
          </h1>
          <p className="text-neutral-600">{p.updated}</p>
        </div>

        <div className="prose prose-neutral max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s1.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">{p.s1.p1}</p>
            <p className="text-neutral-700 leading-relaxed">{p.s1.p2}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s2.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {p.s2.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {p.s2.items.map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong> {item.text}
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s3.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              <strong>{p.s3.importantLabel}</strong> {p.s3.p1}{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-blue-600 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {p.s3.linkText}
              </a>
              {p.s3.p1After}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {p.s3.items.map((item, i) => (
                <li key={i}>
                  {item.bold ? (
                    <>
                      {item.pre}
                      <strong>{item.bold}</strong>
                      {item.post}
                    </>
                  ) : (
                    item.post
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s4.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {p.s4.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {p.s4.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s5.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {p.s5.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {p.s5.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s6.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              {p.s6.intro}
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              {p.s6.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-neutral-700 leading-relaxed mt-4">
              {p.s6.contactPrefix}{" "}
              <a
                href="mailto:get.kairo.ai@gmail.com"
                className="text-blue-600 hover:underline"
              >
                get.kairo.ai@gmail.com
              </a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s7.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{p.s7.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s8.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{p.s8.p}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              {p.s9.title}
            </h2>
            <p className="text-neutral-700 leading-relaxed">{p.s9.intro}</p>
            <ul className="list-none space-y-2 text-neutral-700 mt-4">
              <li>
                {p.s9.emailLabel}{" "}
                <a
                  href="mailto:get.kairo.ai@gmail.com"
                  className="text-blue-600 hover:underline"
                >
                  get.kairo.ai@gmail.com
                </a>
              </li>
              <li>
                {p.s9.websiteLabel}{" "}
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

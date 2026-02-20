import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Kairo",
  description: "How Kairo handles your data and protects your privacy",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-neutral-600">Last updated: February 20, 2026</p>
        </div>

        <div className="prose prose-neutral max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              1. Introduction
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Kairo (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;)
              is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, and safeguard your information when
              you use our AI Support Cockpit service.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              By using Kairo, you agree to the collection and use of information
              in accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              2. Information We Collect
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              We collect the following types of information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                <strong>Account Information:</strong> Name, email address, and
                company name when you sign up
              </li>
              <li>
                <strong>Gmail Data:</strong> Email content, metadata (sender,
                subject, date), and attachments for support ticket triage
              </li>
              <li>
                <strong>Usage Data:</strong> How you interact with the service,
                features used, and session information
              </li>
              <li>
                <strong>Technical Data:</strong> IP address, browser type, device
                information, and cookies
              </li>
            </ul>
          </section>

          <section className="mb-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              3. Gmail Data Handling
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              <strong>Important:</strong> Kairo&apos;s use of information
              received from Gmail APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-blue-600 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                We <strong>only read</strong> your Gmail messages to identify and
                triage support tickets
              </li>
              <li>
                We <strong>never delete, modify, or send</strong> emails from
                your account
              </li>
              <li>
                Gmail data is used <strong>exclusively</strong> to provide the
                Kairo service (ticket classification and prioritization)
              </li>
              <li>
                We <strong>do not</strong> share your Gmail data with third
                parties for advertising or marketing purposes
              </li>
              <li>
                You can revoke Gmail access at any time through your Google
                Account settings
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              4. How We Use Your Information
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>Provide and maintain the Kairo service</li>
              <li>
                Automatically triage and prioritize support tickets from your
                inbox
              </li>
              <li>Improve our AI classification algorithms</li>
              <li>Notify you about service updates or security issues</li>
              <li>Respond to your support requests</li>
              <li>Prevent fraud and ensure platform security</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              5. Data Storage and Security
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Your data is stored securely using industry-standard practices:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                Data encrypted in transit (TLS/SSL) and at rest (AES-256)
              </li>
              <li>OAuth tokens stored with encryption in secure databases</li>
              <li>Access limited to authorized personnel only</li>
              <li>Regular security audits and monitoring</li>
              <li>Hosted on secure cloud infrastructure (Supabase/Vercel)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              6. Your Rights
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Revoke Gmail access at any time</li>
              <li>Export your data in a portable format</li>
              <li>Object to processing of your data</li>
            </ul>
            <p className="text-neutral-700 leading-relaxed mt-4">
              To exercise these rights, contact us at{" "}
              <a
                href="mailto:privacy@kairo.com"
                className="text-blue-600 hover:underline"
              >
                privacy@kairo.com
              </a>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              7. Data Retention
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              We retain your data for as long as your account is active or as
              needed to provide services. When you delete your account, we
              permanently delete your data within 30 days, except where required
              by law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              8. Changes to This Policy
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              We may update this Privacy Policy periodically. We will notify you
              of significant changes via email or through the service. Your
              continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              9. Contact Us
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              If you have questions about this Privacy Policy, contact us:
            </p>
            <ul className="list-none space-y-2 text-neutral-700 mt-4">
              <li>
                Email:{" "}
                <a
                  href="mailto:privacy@kairo.com"
                  className="text-blue-600 hover:underline"
                >
                  privacy@kairo.com
                </a>
              </li>
              <li>
                Website:{" "}
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

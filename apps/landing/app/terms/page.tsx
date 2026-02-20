import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Kairo",
  description: "Terms and conditions for using Kairo",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-neutral-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-neutral-600">Last updated: February 20, 2026</p>
        </div>

        <div className="prose prose-neutral max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              By accessing or using Kairo (&ldquo;Service&rdquo;), you agree to
              be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you
              do not agree to these Terms, do not use the Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              2. Service Description
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Kairo is an AI-powered support cockpit that:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>Connects to your Gmail account to read support emails</li>
              <li>Automatically triages and prioritizes support tickets</li>
              <li>
                Provides AI-assisted suggestions for ticket resolution
              </li>
              <li>
                Organizes customer communications in a unified dashboard
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              3. User Responsibilities
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>Provide accurate account information</li>
              <li>Keep your login credentials secure</li>
              <li>Use the Service only for lawful purposes</li>
              <li>
                Not attempt to reverse engineer or hack the Service
              </li>
              <li>
                Not use the Service to send spam or malicious content
              </li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8 bg-blue-50 border-l-4 border-blue-600 p-6 rounded">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              4. Gmail Integration
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              By connecting your Gmail account:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                You authorize Kairo to read emails for support ticket
                identification
              </li>
              <li>
                You acknowledge that Kairo will not delete, modify, or send
                emails
              </li>
              <li>
                You can revoke access at any time through Google Account
                settings
              </li>
              <li>
                You understand that revoking access will disable Kairo&apos;s
                core functionality
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              5. Data Ownership
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              You retain all ownership rights to your data. Kairo does not claim
              ownership of your emails, tickets, or customer information. We
              only process your data to provide the Service as described in our
              Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              6. Service Availability
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              We strive to maintain 99.9% uptime but do not guarantee
              uninterrupted access. The Service may be temporarily unavailable
              for maintenance, updates, or due to circumstances beyond our
              control.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              7. Limitation of Liability
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                Kairo is provided &ldquo;as is&rdquo; without warranties of any
                kind
              </li>
              <li>
                We are not liable for indirect, incidental, or consequential
                damages
              </li>
              <li>
                Our total liability shall not exceed the amount you paid in the
                last 12 months
              </li>
              <li>
                We are not responsible for third-party services (e.g., Gmail,
                Google APIs)
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              8. Termination
            </h2>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Either party may terminate this agreement:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-neutral-700">
              <li>
                You can delete your account at any time from the dashboard
                settings
              </li>
              <li>
                We may suspend or terminate accounts for Terms violations
              </li>
              <li>
                Upon termination, your data will be deleted within 30 days
              </li>
              <li>
                Sections regarding liability and disputes survive termination
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              9. Changes to Terms
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              We may modify these Terms at any time. We will notify you of
              material changes via email or through the Service. Continued use
              after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              10. Governing Law
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              These Terms are governed by the laws of the Netherlands. Any
              disputes shall be resolved in the courts of Amsterdam,
              Netherlands.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-neutral-900 mb-4">
              11. Contact Us
            </h2>
            <p className="text-neutral-700 leading-relaxed">
              Questions about these Terms? Contact us:
            </p>
            <ul className="list-none space-y-2 text-neutral-700 mt-4">
              <li>
                Email:{" "}
                <a
                  href="mailto:legal@kairo.com"
                  className="text-blue-600 hover:underline"
                >
                  legal@kairo.com
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

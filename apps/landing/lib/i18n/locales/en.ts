export const en = {
  header: {
    login: "Log in",
    signup: "Sign up",
  },
  hero: {
    titlePrefix: "Resolve tickets in",
    titleHighlight: "seconds",
    description:
      "AI Support Cockpit for support teams. Automatic triage, intelligent prioritization, response time < 4h.",
  },
  cta: {
    button: "Get Started →",
  },
  footer: {
    tagline: "AI Support Cockpit",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    copyright: "© 2026 Kairo. All rights reserved.",
  },
  wizard: {
    title: "Welcome to Kairo",
    subtitle: "Connect your support inbox to get started",
    googleButton: "Continue with Google",
    gmailNote1: "Kairo needs access to read your Gmail",
    gmailNote2: "to automatically triage support tickets",
    emailButton: "Continue with Email →",
    emailComingSoon: "(Coming soon)",
  },
  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: February 20, 2026",
    s1: {
      title: "1. Introduction",
      p1: 'Kairo (\u201cwe\u201d, \u201cour\u201d, or \u201cus\u201d) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our AI Support Cockpit service.',
      p2: "By using Kairo, you agree to the collection and use of information in accordance with this policy.",
    },
    s2: {
      title: "2. Information We Collect",
      intro: "We collect the following types of information:",
      items: [
        {
          label: "Account Information:",
          text: "Name, email address, and company name when you sign up",
        },
        {
          label: "Gmail Data:",
          text: "Email content, metadata (sender, subject, date), and attachments for support ticket triage",
        },
        {
          label: "Usage Data:",
          text: "How you interact with the service, features used, and session information",
        },
        {
          label: "Technical Data:",
          text: "IP address, browser type, device information, and cookies",
        },
      ],
    },
    s3: {
      title: "3. Gmail Data Handling",
      importantLabel: "Important:",
      p1: "Kairo\u2019s use of information received from Gmail APIs adheres to the",
      linkText: "Google API Services User Data Policy",
      p1After: ", including the Limited Use requirements.",
      items: [
        { pre: "We ", bold: "only read", post: " your Gmail messages to identify and triage support tickets" },
        { pre: "We ", bold: "never delete, modify, or send", post: " emails from your account" },
        { pre: "Gmail data is used ", bold: "exclusively", post: " to provide the Kairo service (ticket classification and prioritization)" },
        { pre: "We ", bold: "do not", post: " share your Gmail data with third parties for advertising or marketing purposes" },
        { pre: "", bold: "", post: "You can revoke Gmail access at any time through your Google Account settings" },
      ],
    },
    s4: {
      title: "4. How We Use Your Information",
      intro: "We use your information to:",
      items: [
        "Provide and maintain the Kairo service",
        "Automatically triage and prioritize support tickets from your inbox",
        "Improve our AI classification algorithms",
        "Notify you about service updates or security issues",
        "Respond to your support requests",
        "Prevent fraud and ensure platform security",
      ],
    },
    s5: {
      title: "5. Data Storage and Security",
      intro: "Your data is stored securely using industry-standard practices:",
      items: [
        "Data encrypted in transit (TLS/SSL) and at rest (AES-256)",
        "OAuth tokens stored with encryption in secure databases",
        "Access limited to authorized personnel only",
        "Regular security audits and monitoring",
        "Hosted on secure cloud infrastructure (Supabase/Vercel)",
      ],
    },
    s6: {
      title: "6. Your Rights",
      intro: "You have the right to:",
      items: [
        "Access your personal data",
        "Correct inaccurate data",
        "Request deletion of your data",
        "Revoke Gmail access at any time",
        "Export your data in a portable format",
        "Object to processing of your data",
      ],
      contactPrefix: "To exercise these rights, contact us at",
    },
    s7: {
      title: "7. Data Retention",
      p: "We retain your data for as long as your account is active or as needed to provide services. When you delete your account, we permanently delete your data within 30 days, except where required by law.",
    },
    s8: {
      title: "8. Changes to This Policy",
      p: "We may update this Privacy Policy periodically. We will notify you of significant changes via email or through the service. Your continued use after changes constitutes acceptance.",
    },
    s9: {
      title: "9. Contact Us",
      intro: "If you have questions about this Privacy Policy, contact us:",
      emailLabel: "Email:",
      websiteLabel: "Website:",
    },
  },
  terms: {
    title: "Terms of Service",
    updated: "Last updated: February 20, 2026",
    s1: {
      title: "1. Acceptance of Terms",
      p: 'By accessing or using Kairo (\u201cService\u201d), you agree to be bound by these Terms of Service (\u201cTerms\u201d). If you do not agree to these Terms, do not use the Service.',
    },
    s2: {
      title: "2. Service Description",
      intro: "Kairo is an AI-powered support cockpit that:",
      items: [
        "Connects to your Gmail account to read support emails",
        "Automatically triages and prioritizes support tickets",
        "Provides AI-assisted suggestions for ticket resolution",
        "Organizes customer communications in a unified dashboard",
      ],
    },
    s3: {
      title: "3. User Responsibilities",
      intro: "You agree to:",
      items: [
        "Provide accurate account information",
        "Keep your login credentials secure",
        "Use the Service only for lawful purposes",
        "Not attempt to reverse engineer or hack the Service",
        "Not use the Service to send spam or malicious content",
        "Comply with all applicable laws and regulations",
      ],
    },
    s4: {
      title: "4. Gmail Integration",
      intro: "By connecting your Gmail account:",
      items: [
        "You authorize Kairo to read emails for support ticket identification",
        "You acknowledge that Kairo will not delete, modify, or send emails",
        "You can revoke access at any time through Google Account settings",
        "You understand that revoking access will disable Kairo\u2019s core functionality",
      ],
    },
    s5: {
      title: "5. Data Ownership",
      p: "You retain all ownership rights to your data. Kairo does not claim ownership of your emails, tickets, or customer information. We only process your data to provide the Service as described in our Privacy Policy.",
    },
    s6: {
      title: "6. Service Availability",
      p: "We strive to maintain 99.9% uptime but do not guarantee uninterrupted access. The Service may be temporarily unavailable for maintenance, updates, or due to circumstances beyond our control.",
    },
    s7: {
      title: "7. Limitation of Liability",
      intro: "To the maximum extent permitted by law:",
      items: [
        'Kairo is provided \u201cas is\u201d without warranties of any kind',
        "We are not liable for indirect, incidental, or consequential damages",
        "Our total liability shall not exceed the amount you paid in the last 12 months",
        "We are not responsible for third-party services (e.g., Gmail, Google APIs)",
      ],
    },
    s8: {
      title: "8. Termination",
      intro: "Either party may terminate this agreement:",
      items: [
        "You can delete your account at any time from the dashboard settings",
        "We may suspend or terminate accounts for Terms violations",
        "Upon termination, your data will be deleted within 30 days",
        "Sections regarding liability and disputes survive termination",
      ],
    },
    s9: {
      title: "9. Changes to Terms",
      p: "We may modify these Terms at any time. We will notify you of material changes via email or through the Service. Continued use after changes constitutes acceptance of the updated Terms.",
    },
    s10: {
      title: "10. Governing Law",
      p: "These Terms are governed by the laws of the Netherlands. Any disputes shall be resolved in the courts of Amsterdam, Netherlands.",
    },
    s11: {
      title: "11. Contact Us",
      intro: "Questions about these Terms? Contact us:",
      emailLabel: "Email:",
      websiteLabel: "Website:",
    },
  },
};

export type Translations = typeof en;

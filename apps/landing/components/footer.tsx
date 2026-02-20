import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-neutral-50 border-t border-neutral-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-sm font-semibold text-neutral-900">Kairo</p>
            <p className="text-xs text-neutral-600">AI Support Cockpit</p>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/privacy/"
              className="text-sm text-neutral-600 hover:text-neutral-900 transition"
            >
              Privacy Policy
            </Link>
            <span className="text-neutral-300">|</span>
            <Link
              href="/terms/"
              className="text-sm text-neutral-600 hover:text-neutral-900 transition"
            >
              Terms of Service
            </Link>
          </div>

          <div className="text-center md:text-right">
            <p className="text-xs text-neutral-500">
              &copy; 2026 Kairo. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

export function CTAButton() {
  return (
    <div className="flex justify-center mt-12">
      <Link
        href="/dashboard"
        className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition"
      >
        Get Started →
      </Link>
    </div>
  );
}

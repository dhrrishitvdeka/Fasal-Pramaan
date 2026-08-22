import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div className="fp-panel w-full max-w-md p-6 text-center sm:p-8">
        <div className="fp-kicker">Error 404</div>
        <h2 className="mt-2 text-base font-semibold text-[var(--ink)]">Page not found</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          यह पृष्ठ नहीं मिला। कृपया पते की जाँच करें या नीचे दिए विकल्प चुनें।
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/" className="fp-btn-primary w-full sm:w-auto">
            Home · मुखपृष्ठ
          </Link>
          <Link href="/farmer" className="fp-btn-secondary w-full sm:w-auto">
            Farmer portal · किसान पोर्टल
          </Link>
        </div>
      </div>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <section className="motion-rise flex w-full max-w-md flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card sm:px-10">
        <Image src="/icon.png" alt="PNC" width={36} height={36} className="rounded-lg" />
        <span aria-hidden="true" className="mt-6 flex size-12 items-center justify-center rounded-full bg-warning-soft text-ink">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Not authorized</h1>
        <p className="mt-2 text-[15px] text-ink-muted">Your account&apos;s group doesn&apos;t have access to that page.</p>
        <Link className={`${buttonClasses("primary")} mt-6`} href="/">
          Back home
        </Link>
      </section>
    </main>
  );
}

import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Not authorized</h1>
      <p className="text-ink-muted">
        Your account&apos;s group doesn&apos;t have access to that page.
      </p>
      <Link className={`${buttonClasses("primary")} mt-2`} href="/">
        Back home
      </Link>
    </main>
  );
}

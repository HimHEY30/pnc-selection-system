import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  /** A way back to the page this one belongs to, shown above the title. */
  back?: { href: string; label: string };
  /** Where the page sits, shown above the title instead of `back`. The last item is the current page. */
  breadcrumbs?: { label: string; href?: string; current?: boolean }[];
  breadcrumbsLabel?: string;
  /** The page's main actions, aligned to the right of the title (below it on a phone). */
  actions?: ReactNode;
};

/**
 * The top of a page: where you are, what this is, and what you can do about it. Every screen uses this one
 * header so titles, spacing and the back link look and behave the same everywhere.
 */
export default function PageHeader({ title, description, back, breadcrumbs, breadcrumbsLabel, actions }: Props) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-primary transition-colors duration-150 hover:underline focus-ring"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {back.label}
        </Link>
      )}
      {breadcrumbs && (
        <nav aria-label={breadcrumbsLabel} className="text-xs text-ink-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((item, i) => (
              <li key={item.label} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">/</span>}
                {item.href && !item.current ? (
                  <Link href={item.href} className="hover:text-ink hover:underline focus-ring">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={item.current ? "page" : undefined}>{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-[15px] text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

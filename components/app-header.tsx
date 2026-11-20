"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

export type SwitcherItem = {
  id: string;
  name: string;
  blurb: string;
  href?: string;
  /** In the client's plan. Others show greyed out with "Not in your plan". */
  enabled: boolean;
  current?: boolean;
  /** Opens in a new tab (other tools, via hub single sign-on). */
  external?: boolean;
};

export type HeaderLink = { href: string; label: string; external?: boolean };

/**
 * Loopdesk AI top bar: the same in all 7 tools (see the Loopdesk AI design system → AppHeader).
 * Crimson bar, logo tile + wordmark, current tool name, tool switcher, the tool's own pages as pills,
 * business name and Log out on the right.
 */
export function AppHeader({
  wordmark,
  showLogo = true,
  toolName,
  homeHref,
  links,
  activeHref,
  switcher,
  right,
}: {
  wordmark: string;
  showLogo?: boolean;
  toolName?: string;
  homeHref: string;
  links: HeaderLink[];
  activeHref: string;
  switcher?: SwitcherItem[];
  right: React.ReactNode;
}) {
  return (
    <header className="bg-brand-700 text-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <Link href={homeHref} className="flex items-center gap-2.5 text-base font-bold tracking-tight text-white">
            {showLogo && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-input bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/icon-512.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
              </span>
            )}
            {wordmark}
          </Link>
          {toolName && (
            <>
              <span className="text-lg text-brand-200" aria-hidden>/</span>
              <span className="text-base font-medium">{toolName}</span>
            </>
          )}
          {switcher && switcher.length > 0 && <ToolSwitcher items={switcher} />}
        </div>

        <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:flex-wrap lg:overflow-visible">
          {links.map((l) => {
            const active = !l.external && activeHref === l.href;
            const cls = clsx(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition",
              active ? "bg-white text-brand-800" : "text-brand-200 hover:text-white hover:ring-1 hover:ring-inset hover:ring-brand-200"
            );
            return l.external ? (
              <a key={l.href} href={l.href} target="_blank" rel="noopener" className={cls}>{l.label}</a>
            ) : (
              <Link key={l.href} href={l.href} className={cls} aria-current={active ? "page" : undefined}>{l.label}</Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm text-brand-200">{right}</div>
      </div>
    </header>
  );
}

function ToolSwitcher({ items }: { items: SwitcherItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Switch tool"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx("grid h-8 w-8 place-items-center rounded-full text-white transition hover:bg-brand-800", open && "bg-brand-800 ring-1 ring-inset ring-brand-200")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label="Loopdesk AI tools" className="absolute left-0 top-10 z-30 w-[340px] rounded-modal border border-gray-200 bg-white p-3 text-gray-900 shadow-pop">
          <p className="px-2 pb-2 text-xs font-medium text-gray-500">Loopdesk AI</p>
          <div className="grid grid-cols-2 gap-1">
            {items.map((t) => {
              const body = (
                <>
                  <span className={clsx("block text-sm font-semibold", t.current && "text-brand-900")}>{t.name}</span>
                  <span className="block text-xs text-gray-500">{t.enabled ? t.blurb : "Not in your plan"}</span>
                </>
              );
              const cls = clsx("block rounded-input px-3 py-2", t.current ? "bg-brand-100" : t.enabled ? "hover:bg-gray-100" : "cursor-default text-gray-500");
              if (!t.enabled || !t.href) return <div key={t.id} role="menuitem" aria-disabled className={cls}>{body}</div>;
              return t.external ? (
                <a key={t.id} role="menuitem" href={t.href} target="_blank" rel="noopener" className={cls} onClick={() => setOpen(false)}>{body}</a>
              ) : (
                <Link key={t.id} role="menuitem" href={t.href} className={cls} aria-current={t.current ? "page" : undefined} onClick={() => setOpen(false)}>{body}</Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

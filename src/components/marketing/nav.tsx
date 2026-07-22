"use client"

// Section 1 (copy deck "NAV"): cream/translucent sticky bar, wordmark with
// amber light-dot, anchor links, flame CTA. Gains a soft awning shadow once
// the page has scrolled (small client hook — the only reason this whole
// component is a client component).

import { useEffect, useState } from "react"
import { Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { Wordmark } from "./wordmark"

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#loop-board", label: "The loop" },
  { href: "#faq", label: "FAQ" },
]

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [threshold])
  return scrolled
}

export function MarketingNav() {
  const scrolled = useScrolled()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header
      id="nav"
      data-scene="nav"
      className={cn(
        "sticky top-0 z-50 border-b border-transparent bg-background/80 backdrop-blur-md transition-shadow duration-base",
        scrolled && "border-border shadow-soft"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#top" className="rounded-md text-lg text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Wordmark />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <a
            href="/login"
            className="text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
          >
            Sign in
          </a>
          <Button variant="flame" render={<a href="#pilot-menu" />}>
            Get early access
          </Button>
        </div>

        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="inline-flex size-9 items-center justify-center rounded-lg text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          {mobileOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Primary mobile"
          className="border-t border-border bg-background px-4 py-3 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Sign in
            </a>
            <Button variant="flame" className="mt-2 w-full" render={<a href="#pilot-menu" onClick={() => setMobileOpen(false)} />}>
              Get early access
            </Button>
          </div>
        </nav>
      )}
    </header>
  )
}

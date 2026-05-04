import * as React from "react";
import { Container } from "./Container";

export function Footer({ brand = "Acme" }: { brand?: string }) {
  return (
    <footer className="mt-12 border-t border-[rgb(var(--border))] py-10">
      <Container className="flex flex-col items-center justify-between gap-4 text-sm text-[rgb(var(--muted))] md:flex-row">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-5 w-5 rounded-md bg-[linear-gradient(135deg,rgb(139_92_246),rgb(217_70_239))]"
          />
          <span>© {new Date().getFullYear()} {brand}. All rights reserved.</span>
        </div>
        <ul className="flex items-center gap-5">
          <li><a href="#" className="hover:text-[rgb(var(--fg))] transition-colors">Privacy</a></li>
          <li><a href="#" className="hover:text-[rgb(var(--fg))] transition-colors">Terms</a></li>
          <li><a href="#" className="hover:text-[rgb(var(--fg))] transition-colors">Contact</a></li>
        </ul>
      </Container>
    </footer>
  );
}

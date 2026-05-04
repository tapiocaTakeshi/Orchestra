import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
};

export default function Button({ href, children, variant = "primary" }: Props) {
  if (variant === "ghost") {
    return (
      <Link
        href={href}
        className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
      >
        {children}
        <span
          aria-hidden
          className="transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 border-b border-foreground pb-1 text-sm font-medium tracking-tight transition-opacity hover:opacity-60"
    >
      {children}
      <span
        aria-hidden
        className="transition-transform group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}

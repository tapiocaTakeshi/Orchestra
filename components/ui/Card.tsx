import * as React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({
  className = "",
  interactive = false,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border border-border bg-card/70 backdrop-blur-sm",
        "shadow-soft p-6 sm:p-7",
        interactive
          ? "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow hover:border-foreground/20"
          : "",
        className,
      ].join(" ")}
      {...props}
    />
  );
}

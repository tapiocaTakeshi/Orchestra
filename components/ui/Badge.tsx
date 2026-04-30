import * as React from "react";
import { cn } from "@/lib/cn";

export const Badge = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      "border border-[rgb(var(--border))] bg-[rgb(var(--surface-2))]",
      "text-[rgb(var(--muted))]",
      className
    )}
    {...props}
  />
);

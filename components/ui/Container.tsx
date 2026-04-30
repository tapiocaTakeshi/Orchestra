import * as React from "react";
import { cn } from "@/lib/cn";

export const Container = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mx-auto w-full max-w-6xl px-5 md:px-8", className)}
    {...props}
  />
);

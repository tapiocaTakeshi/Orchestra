import * as React from "react";
import { cn } from "@/lib/cn";

export const GradientText = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("text-gradient", className)} {...props} />
);

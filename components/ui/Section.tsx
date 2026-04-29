import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  as?: "section" | "div" | "article";
  size?: "sm" | "md" | "lg";
}

const sizeMap: Record<NonNullable<SectionProps["size"]>, string> = {
  sm: "py-16 md:py-20",
  md: "py-20 md:py-28",
  lg: "py-28 md:py-36",
};

export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, as: Tag = "section", size = "md", ...props }, ref) => (
    <Tag
      ref={ref as never}
      className={cn(sizeMap[size], className)}
      {...props}
    />
  )
);
Section.displayName = "Section";

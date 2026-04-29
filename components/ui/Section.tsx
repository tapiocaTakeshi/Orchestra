import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article";
  bleed?: boolean;
  tone?: "paper" | "mist";
};

export function Section({
  as: Tag = "section",
  bleed = false,
  tone = "paper",
  className,
  children,
  ...rest
}: Props) {
  return (
    <Tag
      className={cn(
        "w-full",
        tone === "mist" ? "bg-mist" : "bg-paper",
        bleed ? "py-12 md:py-16" : "py-[clamp(4rem,3rem+4vw,7.5rem)]",
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export default Section;

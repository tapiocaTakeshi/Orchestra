import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-readable",
};

export function Container({
  size = "lg",
  className,
  children,
  ...rest
}: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 md:px-8",
        sizeMap[size],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Container;

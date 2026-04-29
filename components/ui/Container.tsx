import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

export const Container = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("mx-auto w-full max-w-[1040px] px-5 md:px-8 lg:px-12", className)}
      {...props}
    />
  )
);
Container.displayName = "Container";

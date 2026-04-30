import * as React from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 shadow-soft hover:shadow-glow hover:-translate-y-0.5",
  secondary:
    "bg-brand-gradient text-white shadow-soft hover:shadow-glow hover:-translate-y-0.5",
  outline:
    "border border-border bg-background/50 backdrop-blur hover:bg-muted hover:border-foreground/20",
  ghost: "hover:bg-muted text-foreground",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-6 text-sm",
  lg: "h-13 px-8 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`btn-base ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

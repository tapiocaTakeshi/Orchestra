import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const base =
  "inline-flex items-center justify-center h-11 px-6 text-sm font-medium tracking-tight transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/85",
  ghost:
    "bg-transparent text-foreground border hairline hover:bg-foreground/5",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

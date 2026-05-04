import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "solid" | "outline" | "ghost";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
};

const baseStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  height: 44,
  padding: "0 20px",
  fontSize: "var(--fs-sm)",
  letterSpacing: "0.02em",
  borderRadius: 999,
  border: "1px solid transparent",
  transition:
    "background-color var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease), transform var(--dur) var(--ease)",
};

const variants: Record<Variant, React.CSSProperties> = {
  solid: {
    background: "var(--color-accent)",
    color: "var(--color-accent-fg)",
    borderColor: "var(--color-accent)",
  },
  outline: {
    background: "transparent",
    color: "var(--color-fg)",
    borderColor: "var(--color-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-fg)",
    borderColor: "transparent",
  },
};

export default function Button({
  variant = "solid",
  children,
  style,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      style={{ ...baseStyle, ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
}

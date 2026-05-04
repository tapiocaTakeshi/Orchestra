import type { CSSProperties, ReactNode } from "react";
import Container from "./Container";

type Props = {
  children: ReactNode;
  id?: string;
  bordered?: boolean;
  size?: "sm" | "md" | "lg";
  style?: CSSProperties;
};

const padMap: Record<NonNullable<Props["size"]>, string> = {
  sm: "var(--space-8) 0",
  md: "var(--space-12) 0",
  lg: "var(--space-16) 0",
};

export default function Section({
  children,
  id,
  bordered = false,
  size = "md",
  style,
}: Props) {
  return (
    <section
      id={id}
      style={{
        padding: padMap[size],
        borderTop: bordered ? "1px solid var(--color-border)" : undefined,
        ...style,
      }}
    >
      <Container>{children}</Container>
    </section>
  );
}

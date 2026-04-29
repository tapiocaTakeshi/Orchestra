import * as React from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  className?: string;
};

export function Card({ children, title, eyebrow, className }: Props) {
  return (
    <article
      className={className}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-bg)",
        padding: "clamp(20px, 3vw, 32px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color var(--dur-base) var(--ease)",
      }}
    >
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {title && (
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: 600 }}>{title}</h3>
      )}
      <div style={{ color: "var(--color-text-muted)", lineHeight: 1.6 }}>
        {children}
      </div>
    </article>
  );
}

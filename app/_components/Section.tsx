import type { CSSProperties, ReactNode } from "react";
import styles from "./Section.module.css";

type Props = {
  children: ReactNode;
  id?: string;
  size?: "narrow" | "default" | "wide";
  style?: CSSProperties;
};

const widthMap: Record<NonNullable<Props["size"]>, string> = {
  narrow: "var(--container-narrow)",
  default: "var(--container)",
  wide: "var(--container-wide)",
};

export default function Section({
  children,
  id,
  size = "default",
  style,
}: Props) {
  return (
    <section id={id} className={styles.section} style={style}>
      <div className={styles.inner} style={{ maxWidth: widthMap[size] }}>
        {children}
      </div>
    </section>
  );
}

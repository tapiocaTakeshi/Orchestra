import * as React from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className = "", children, ...rest },
    ref
  ) {
    const cls = [
      styles.btn,
      styles[`v_${variant}`],
      styles[`s_${size}`],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={cls} {...rest}>
        <span className={styles.label}>{children}</span>
      </button>
    );
  }
);

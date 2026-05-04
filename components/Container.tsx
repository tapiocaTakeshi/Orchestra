import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  wide?: boolean;
  className?: string;
};

/**
 * Minimal デザインの最大幅コンテナ。
 * - 通常: 768px / wide: 960px
 * - 左右パディングは globals.css の token に合わせる
 */
export function Container({ children, wide = false, className = "" }: Props) {
  const base = "container" + (wide ? " container-wide" : "");
  return <div className={`${base} ${className}`.trim()}>{children}</div>;
}

export default Container;

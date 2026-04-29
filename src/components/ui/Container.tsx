import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
  className?: string;
};

export default function Container({
  children,
  as: Tag = "div",
  style,
  className,
}: Props) {
  return (
    <Tag
      className={className}
      style={{
        maxWidth: "var(--container-max)",
        marginInline: "auto",
        paddingInline: "var(--container-pad)",
        width: "100%",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

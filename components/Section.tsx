import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  as?: "section" | "header" | "footer" | "main";
};

export default function Section({
  children,
  className = "",
  as: Tag = "section",
}: Props) {
  return (
    <Tag className={`mx-auto w-full max-w-5xl px-6 md:px-10 ${className}`}>
      {children}
    </Tag>
  );
}

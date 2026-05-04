import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
};

export function Container({ children, className = "", size = "md" }: Props) {
  return (
    <div className={`mx-auto w-full px-6 md:px-8 ${sizeMap[size]} ${className}`}>
      {children}
    </div>
  );
}

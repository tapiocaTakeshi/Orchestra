import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  divider?: boolean;
  className?: string;
};

export function Section({ children, divider = false, className = "" }: Props) {
  return (
    <section
      className={`py-20 md:py-32 ${
        divider ? "border-t hairline" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

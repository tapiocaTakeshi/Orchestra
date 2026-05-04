import * as React from "react";

type HairlineOrientation = "horizontal" | "vertical";
type HairlineVariant = "solid" | "fade";
type HairlineSpacing = "none" | "sm" | "md" | "lg";

export interface HairlineProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  /** 互換: `vertical` プロップ。`orientation` 未指定時のみ参照。 */
  vertical?: boolean;
  /** 方向。デフォルト horizontal。 */
  orientation?: HairlineOrientation;
  /** ライン表現。`fade` は両端がフェードする上品なライン。 */
  variant?: HairlineVariant;
  /** 主軸方向の外側マージン。 */
  spacing?: HairlineSpacing;
  /** 既定より少しだけ濃いライン。 */
  strong?: boolean;
  /** 任意の色（CSS color）。未指定時は `--hairline` または currentColor 12% を使用。 */
  color?: string;
  className?: string;
}

const spacingClassOfSpacing: Record<
  HairlineSpacing,
  { horizontal: string; vertical: string }
> = {
  none: { horizontal: "", vertical: "" },
  sm: { horizontal: "my-2", vertical: "mx-2" },
  md: { horizontal: "my-4", vertical: "mx-4" },
  lg: { horizontal: "my-8", vertical: "mx-8" },
};

function joinClassNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}

export const Hairline = React.forwardRef<HTMLSpanElement, HairlineProps>(
  function Hairline(props, ref) {
    const {
      vertical = false,
      orientation,
      variant = "solid",
      spacing = "none",
      strong = false,
      color,
      className,
      style,
      role,
      ...rest
    } = props;

    const resolvedOrientation: HairlineOrientation =
      orientation ?? (vertical ? "vertical" : "horizontal");
    const isVertical = resolvedOrientation === "vertical";

    // 高DPIでは 0.5px、それ以外は 1px。
    const thickness =
      "max(0.5px, calc(1px / var(--orchestra-dpr, 1)))";

    // 色のフォールバック: 明示色 > CSS 変数 --hairline > currentColor を薄く。
    const lineColor =
      color ??
      `var(--hairline, color-mix(in srgb, currentColor ${
        strong ? "18%" : "12%"
      }, transparent))`;

    const baseStyle: React.CSSProperties = isVertical
      ? {
          display: "inline-block",
          width: thickness,
          height: "100%",
          alignSelf: "stretch",
          flexShrink: 0,
        }
      : {
          display: "block",
          width: "100%",
          height: thickness,
          flexShrink: 0,
        };

    const paintStyle: React.CSSProperties =
      variant === "fade"
        ? {
            backgroundColor: "transparent",
            backgroundImage: `linear-gradient(${
              isVertical ? "to bottom" : "to right"
            }, transparent, ${lineColor} 18%, ${lineColor} 82%, transparent)`,
          }
        : {
            backgroundColor: lineColor,
          };

    const spacingClass = spacingClassOfSpacing[spacing][
      isVertical ? "vertical" : "horizontal"
    ];

    // Tailwind の `bg-hairline` が定義されていれば、それを優先させたい場合は
    // 利用側で `className="bg-hairline"` を渡してください（その場合は背景色を上書きしません）。
    const hasCustomBgClass =
      !!className && /(^|\s)bg-/.test(className);

    const mergedStyle: React.CSSProperties = {
      ...baseStyle,
      ...(hasCustomBgClass
        ? { backgroundColor: undefined, backgroundImage: undefined }
        : paintStyle),
      ...style,
    };

    return (
      <span
        ref={ref}
        aria-hidden={role ? undefined : true}
        role={role}
        data-orchestra-hairline=""
        data-orientation={resolvedOrientation}
        data-variant={variant}
        className={joinClassNames(spacingClass, className)}
        style={mergedStyle}
        {...rest}
      />
    );
  }
);

export default Hairline;

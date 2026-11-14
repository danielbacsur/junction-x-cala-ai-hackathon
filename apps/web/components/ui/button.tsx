import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "small" | "default" | "large";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,box-shadow,transform] duration-150 ease-balanced active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  // The one yellow on the page: the action that moves the mandate forward.
  primary: "bg-yellow text-ink shadow-hairline hover:bg-yellow-deep",
  secondary: "bg-card text-ink shadow-hairline hover:shadow-lift",
  ghost: "text-ink-2 hover:bg-wash hover:text-ink",
};

const sizes: Record<Size, string> = {
  small: "h-8 px-3 text-sm",
  default: "h-10 px-4 text-sm",
  large: "h-12 px-6 text-base",
};

type Look = { variant?: Variant; size?: Size };

export const buttonClass = ({ variant = "primary", size = "default" }: Look = {}) =>
  `${base} ${variants[variant]} ${sizes[size]}`;

export function Button({ variant, size, className = "", type = "button", ...props }: ComponentProps<"button"> & Look) {
  return <button type={type} className={`${buttonClass({ variant, size })} ${className}`} {...props} />;
}

export function ButtonLink({ variant, size, className = "", ...props }: ComponentProps<typeof Link> & Look) {
  return <Link className={`${buttonClass({ variant, size })} ${className}`} {...props} />;
}

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(135deg,rgba(183,45,41,0.96),rgba(152,32,31,0.96))] hover:bg-[linear-gradient(135deg,rgba(203,108,101,0.98),rgba(183,45,41,0.98))] text-white border border-mystery-400 shadow-lg shadow-mystery-950/40",
  secondary:
    "bg-dark-800/95 hover:bg-dark-700 text-dark-100 border border-dark-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
  ghost:
    "bg-transparent hover:bg-dark-800/80 text-dark-200 hover:text-dark-50 border border-transparent",
  danger:
    "bg-red-950/45 hover:bg-red-900/60 text-red-200 border border-red-900/70",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm rounded",
  md: "px-4 py-2 text-sm rounded-md",
  lg: "px-6 py-3 text-base rounded-lg",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center gap-2 font-medium",
        "transition-colors duration-150 cursor-pointer",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mystery-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-900",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

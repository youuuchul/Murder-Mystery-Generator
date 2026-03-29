import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export default function Card({ hover = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-dark-700/80 bg-dark-900/88 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]",
        hover && "cursor-pointer transition-all duration-200 hover:border-mystery-500/70 hover:shadow-[0_18px_40px_rgba(23,15,18,0.48)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

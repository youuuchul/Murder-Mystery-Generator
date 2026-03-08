import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export default function Card({ hover = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "bg-dark-900 border border-dark-700 rounded-xl p-5",
        hover && "transition-all duration-200 hover:border-mystery-700 hover:shadow-lg hover:shadow-mystery-900/20 cursor-pointer",
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

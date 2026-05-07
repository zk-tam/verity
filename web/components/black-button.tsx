import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type BlackButtonProps = ComponentProps<typeof Link> & {
  disabled?: boolean;
};

export const BlackButton = ({ className, disabled, ...props }: BlackButtonProps) => {
  return (
    <Link
      className={cn(
        "bg-black/80 rounded-3xl p-3 px-4 text-white hover:bg-black transition-all duration-300 hover:shadow-[0_2px_10px_#ffffff50]",
        disabled && "opacity-70 pointer-events-none",
        className,
      )}
      {...props}
    />
  );
};

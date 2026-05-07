import { ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NeuButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
  variant?: "default" | "sm" | "lg";
}

const NeuButton = forwardRef<HTMLButtonElement, NeuButtonProps>(
  ({ children, className, variant = "default", ...props }, ref) => {
    const variants = {
      default: "text-lg px-8 md:px-10 py-2 py-3 md:py-4",
      sm: "text-sm px-3 sm:px-5 md:px-6 py-2",
      lg: "text-lg px-8 sm:px-10 py-4",
    };

    return (
      <div className="p-0.5 sm:p-1 bg-[#38322B] rounded-[30px] sm:rounded-[40px] md:rounded-[50px]">
        <button
          ref={ref}
          className={cn(
            // Base neumorphism styles
            "bg-[#38322B] rounded-[30px] sm:rounded-[40px] md:rounded-[50px] border-2 sm:border-3 md:border-4 border-[#ffffff20]",
            "text-[#fff] cursor-pointer",
            "transition-all duration-200 ease-in-out",
            // Default inset shadow - responsive
            "shadow-[inset_6px_6px_8px_#38322B20,inset_0_6px_8px_#ffffff70]",
            "sm:shadow-[inset_8px_8px_10px_#38322B20,inset_0_8px_10px_#ffffff70]",
            "md:shadow-[inset_10px_10px_10px_#38322B20,inset_0_10px_10px_#ffffff70]",
            // Hover and focus states - responsive
            "hover:border-[#fff]",
            "hover:text-shadow-glow",
            "hover:shadow-[inset_1px_1px_10px_#bcbcbc,inset_-1px_-1px_3px_#ffffff,1px_1px_3px_#bcbcbc,-1px_-1px_3px_#ffffff]",
            "hover:sm:shadow-[inset_2px_2px_15px_#bcbcbc,inset_-2px_-2px_4px_#ffffff,2px_2px_4px_#bcbcbc,-2px_-2px_4px_#ffffff]",
            "hover:md:shadow-[inset_2px_2px_20px_#bcbcbc,inset_-2px_-2px_5px_#ffffff,2px_2px_5px_#bcbcbc,-2px_-2px_5px_#ffffff]",
            "focus:shadow-[inset_1px_1px_3px_#bcbcbc,inset_-1px_-1px_3px_#ffffff,1px_1px_3px_#bcbcbc,-1px_-1px_3px_#ffffff]",
            "focus:sm:shadow-[inset_2px_2px_4px_#bcbcbc,inset_-2px_-2px_4px_#ffffff,2px_2px_4px_#bcbcbc,-2px_-2px_4px_#ffffff]",
            "focus:md:shadow-[inset_2px_2px_5px_#bcbcbc,inset_-2px_-2px_5px_#ffffff,2px_2px_5px_#bcbcbc,-2px_-2px_5px_#ffffff]",
            "focus:outline-none",
            "uppercase",
            // Disabled state
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
            // Size variants
            variants[variant],
            className
          )}
          {...props}
        >
          {children}
        </button>
      </div>
    );
  }
);

NeuButton.displayName = "NeuButton";

export { NeuButton };

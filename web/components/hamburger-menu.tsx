"use client";

import { Ellipsis, X } from "lucide-react";

interface HamburgerMenuProps {
  isOpen: boolean;
  onClick: () => void;
}

export function HamburgerMenu({ isOpen, onClick }: HamburgerMenuProps) {
  const handleClick = () => {
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className="relative z-50 flex h-10 w-10 min-[381px]:h-12 min-[381px]:w-12 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--glass-gradient-start))]/20 to-[hsl(var(--glass-gradient-end))]/20 backdrop-blur-md backdrop-saturate-150 border border-white/20 text-white shadow-[0_4px_8px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.1)] transition-all duration-300 hover:from-[hsl(var(--glass-gradient-start))]/30 hover:to-[hsl(var(--glass-gradient-end))]/30 md:hidden"
      aria-label={isOpen ? "Close menu" : "Open menu"}
      aria-pressed={isOpen}
    >
      {isOpen ? <X className="w-5 h-5" /> : <Ellipsis className="w-5 h-5" />}
    </button>
  );
}

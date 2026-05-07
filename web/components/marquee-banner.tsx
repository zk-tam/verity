"use client";

import { useEffect, useRef } from "react";

const styleId = "marquee-banner-keyframes";

interface MarqueeBannerProps {
  messages: string[];
  speed?: number; // pixels per second
}

export function MarqueeBanner({ messages, speed = 80 }: MarqueeBannerProps) {
  const marqueeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(var(--marquee-translate));
          }
        }
      `;
      document.head.appendChild(style);
    }

    const marquee = marqueeRef.current;
    if (!marquee) return;

    const items = marquee.querySelectorAll<HTMLElement>(".marquee-item");
    if (!items.length) return;

    const firstWidth = items[0].offsetWidth;
    const totalWidth = Array.from(items).reduce(
      (acc, item) => acc + item.offsetWidth,
      0
    );

    const duration = totalWidth / speed;

    marquee.style.setProperty("--marquee-duration", `${duration}s`);
    marquee.style.setProperty("--marquee-translate", `-${totalWidth}px`);
    marquee.style.setProperty("--marquee-gap", `${firstWidth}px`);
  }, [messages, speed]);

  return (
    <div className="fixed bottom-8 left-6 right-24 md:right-36 z-[90] overflow-hidden rounded-full bg-white/90 text-contrast shadow-sm border border-white/30">
      <div
        ref={marqueeRef}
        className="relative flex whitespace-nowrap"
      >
        <div
          className="marquee-content flex"
          style={{ animation: "marquee var(--marquee-duration) linear infinite" }}
        >
          {messages.map((message, idx) => (
            <span
              key={`${message}-${idx}`}
              className="marquee-item font-loos-extra-wide-medium inline-block px-6 py-2 text-sm md:text-base font-medium"
            >
              {message}
            </span>
          ))}
        </div>
        <div
          className="marquee-content flex"
          style={{
            marginLeft: "var(--marquee-gap)",
            animation: "marquee var(--marquee-duration) linear infinite",
          }}
        >
          {messages.map((message, idx) => (
            <span
              key={`${message}-dup-${idx}`}
              className="marquee-item font-loos-extra-wide-medium inline-block px-6 py-2 text-sm md:text-base font-medium"
            >
              {message}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import "./card-base.css";

interface CardHoloCardMetadata {
  name: string;
  image_large: string;
}

interface CardHoloProps {
  card: CardHoloCardMetadata;
  onClick?: () => void;
  badge?: string;
}

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value);
const adjust = (
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number,
  outputMax: number
) =>
  ((value - inputMin) / (inputMax - inputMin)) * (outputMax - outputMin) +
  outputMin;

type Pending = {
  rotate: { x: number; y: number };
  glare: { x: number; y: number; o: number };
  background: { x: number; y: number };
};

export function CardHolo({ card, onClick, badge }: CardHoloProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [interacting, setInteracting] = useState(false);
  const [loading, setLoading] = useState(true);

  const randomSeed = useRef({
    x: Math.random(),
    y: Math.random(),
  });

  const cosmosPosition = useRef({
    x: Math.floor(randomSeed.current.x * 734),
    y: Math.floor(randomSeed.current.y * 1280),
  });

  // Per-frame pointer state lives in refs so move events don't re-render React.
  // A single rAF callback flushes the latest values to CSS variables.
  const pendingRef = useRef<Pending | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    rafIdRef.current = null;
    const el = cardRef.current;
    const next = pendingRef.current;
    if (!el || !next) return;
    pendingRef.current = null;

    const dx = next.glare.x - 50;
    const dy = next.glare.y - 50;
    const fromCenter = clamp(Math.sqrt(dx * dx + dy * dy) / 50, 0, 1);

    const s = el.style;
    s.setProperty("--pointer-x", `${next.glare.x}%`);
    s.setProperty("--pointer-y", `${next.glare.y}%`);
    s.setProperty("--pointer-from-center", String(fromCenter));
    s.setProperty("--pointer-from-top", String(next.glare.y / 100));
    s.setProperty("--pointer-from-left", String(next.glare.x / 100));
    s.setProperty("--card-opacity", String(next.glare.o));
    s.setProperty("--rotate-x", `${next.rotate.x}deg`);
    s.setProperty("--rotate-y", `${next.rotate.y}deg`);
    s.setProperty("--background-x", `${next.background.x}%`);
    s.setProperty("--background-y", `${next.background.y}%`);
  }, []);

  const queueFlush = useCallback(() => {
    if (rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const interact = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const el = cardRef.current;
      if (!el) return;

      if (endTimerRef.current) {
        clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }

      // setState bails out via Object.is when value is unchanged — safe to
      // call on every move without re-rendering once interacting is true.
      setInteracting(true);

      let clientX: number, clientY: number;
      if ("touches" in e.nativeEvent && e.nativeEvent.touches.length > 0) {
        clientX = e.nativeEvent.touches[0].clientX;
        clientY = e.nativeEvent.touches[0].clientY;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }

      const rect = el.getBoundingClientRect();
      const absoluteX = clientX - rect.left;
      const absoluteY = clientY - rect.top;

      const percentX = clamp(round((100 / rect.width) * absoluteX));
      const percentY = clamp(round((100 / rect.height) * absoluteY));

      const centerX = percentX - 50;
      const centerY = percentY - 50;

      pendingRef.current = {
        background: {
          x: adjust(percentX, 0, 100, 37, 63),
          y: adjust(percentY, 0, 100, 33, 67),
        },
        rotate: {
          x: round(-(centerX / 3.5)),
          y: round(centerY / 2),
        },
        glare: {
          x: round(percentX),
          y: round(percentY),
          o: 1,
        },
      };

      queueFlush();
    },
    [queueFlush]
  );

  const interactEnd = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = setTimeout(() => {
      endTimerRef.current = null;
      setInteracting(false);
      pendingRef.current = {
        rotate: { x: 0, y: 0 },
        glare: { x: 50, y: 50, o: 0 },
        background: { x: 50, y: 50 },
      };
      queueFlush();
    }, 100);
  }, [queueFlush]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    };
  }, []);

  const handleImageLoad = () => setLoading(false);
  const handleClick = () => onClick?.();

  return (
    <div className="carousel-card-container">
      <div
        ref={cardRef}
        className={`card interactive ${interacting ? "interacting" : ""} ${
          loading ? "loading" : ""
        }`}
        data-rarity="trainer gallery rare holo"
        style={{
          ...({
            "--pointer-x": "50%",
            "--pointer-y": "50%",
            "--pointer-from-center": 0,
            "--pointer-from-top": 0.5,
            "--pointer-from-left": 0.5,
            "--card-opacity": 0,
            "--rotate-x": "0deg",
            "--rotate-y": "0deg",
            "--background-x": "50%",
            "--background-y": "50%",
            "--seedx": randomSeed.current.x,
            "--seedy": randomSeed.current.y,
            "--cosmosbg": `${cosmosPosition.current.x}px ${cosmosPosition.current.y}px`,
            "--card-scale": 1,
            "--translate-x": "0px",
            "--translate-y": "0px",
          } as React.CSSProperties),
        }}
      >
        <div className="card__translater">
          <button
            className="card__rotator"
            onClick={handleClick}
            onMouseMove={interact}
            onTouchMove={interact}
            onMouseLeave={interactEnd}
            onTouchEnd={interactEnd}
            onBlur={interactEnd}
            aria-label={`Expand the Pokemon Card; ${card.name}.`}
            tabIndex={0}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              position: "relative",
            }}
          >
            <Image
              className="card__back"
              src="https://tcg.pokemon.com/assets/img/global/tcg-card-back-2x.jpg"
              alt="The back of a Pokemon Card, a Pokeball in the center with Pokemon logo above and below"
              width={320}
              height={450}
              priority
            />
            <div
              className="card__front"
              style={
                {
                  "--mask":
                    "url(https://poke-holo.b-cdn.net/foils/swsh11/masks/upscaled/tg05_foil_holo_rainbow_2x.webp)",
                  "--foil":
                    "url(https://poke-holo.b-cdn.net/foils/swsh11/foils/upscaled/tg05_foil_holo_rainbow_2x.webp)",
                } as React.CSSProperties
              }
            >
              {badge && (
                <div className="card__front-badge">
                  {badge}
                </div>
              )}
              <Image
                src={card.image_large}
                alt={`Front design of the ${card.name} Pokemon Card, with the stats and info around the edge`}
                onLoad={handleImageLoad}
                width={320}
                height={450}
                priority
              />
              <div className="card__shine"></div>
              <div className="card__glare"></div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

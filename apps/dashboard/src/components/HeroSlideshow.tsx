"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import clsx from "clsx";

const SLIDE_INTERVAL_MS = 3000;

const SLIDES = [
  { src: "/landing/landing-1.png", width: 760, height: 905 },
  { src: "/landing/landing-2.png", width: 760, height: 906 },
  { src: "/landing/landing-3.png", width: 760, height: 906 },
  { src: "/landing/landing-4.png", width: 760, height: 906 },
  { src: "/landing/landing-5.png", width: 760, height: 906 },
  { src: "/landing/landing-6.png", width: 760, height: 695 },
];

/**
 * Landing hero slideshow: loops the 6 field cutouts with a 3s crossfade.
 * - Honors prefers-reduced-motion (static first frame, no timer).
 * - Pauses while hovered / focused so users can inspect a frame.
 * - Fixed-aspect box + object-contain: no layout shift between
 *   portrait cutouts and the wider 6th frame.
 */
export default function HeroSlideshow({ alt }: { alt: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reducedMotion, paused]);

  return (
    <div
      className="mx-auto w-[52vw] max-w-[190px] sm:w-full sm:max-w-[300px] md:max-w-[380px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative aspect-[760/906] h-auto w-full">
        {SLIDES.map((slide, i) => {
          const active = i === index;
          return (
            <Image
              key={slide.src}
              src={slide.src}
              alt={active ? alt : ""}
              aria-hidden={!active}
              fill
              sizes="(max-width: 639px) 52vw, (max-width: 768px) 78vw, 380px"
              priority={i === 0}
              loading={i === 0 ? undefined : "eager"}
              className={clsx(
                "object-contain transition-opacity duration-1000 ease-in-out",
                active ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
          );
        })}
      </div>
      {!reducedMotion && (
        <div className="mt-2 flex items-center justify-center gap-1.5" role="tablist" aria-label="Hero images">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.src}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show image ${i + 1} of ${SLIDES.length}`}
              onClick={() => setIndex(i)}
              className={clsx(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-5 bg-[var(--ink)]" : "w-1.5 bg-slate-300 hover:bg-slate-400",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

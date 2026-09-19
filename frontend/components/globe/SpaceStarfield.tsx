"use client";

import { useMemo } from "react";

interface Star {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: string;
  twinkleDuration: number;
  twinkleDelay: number;
}

export function SpaceStarfield() {
  // Deterministic dense starfield generation
  const stars: Star[] = useMemo(() => {
    const starList: Star[] = [];
    const count = 260;
    const colors = [
      "#ffffff",
      "#e0f2fe",
      "#bae6fd",
      "#fef3c7",
      "#ffffff",
      "#ffffff",
    ];

    for (let i = 0; i < count; i++) {
      // Deterministic pseudo-randomness for stable server/client hydration
      const seed = (i * 9301 + 49297) % 233280;
      const x = ((seed / 233280) * 100).toFixed(2);
      const seed2 = (seed * 9301 + 49297) % 233280;
      const y = ((seed2 / 233280) * 100).toFixed(2);
      const seed3 = (seed2 * 9301 + 49297) % 233280;
      const sizeRand = seed3 / 233280;
      const size = sizeRand > 0.9 ? 2.2 : sizeRand > 0.65 ? 1.5 : 1.0;
      const opacity = (0.25 + (seed % 65) / 100).toFixed(2);
      const color = colors[seed % colors.length];
      const twinkleDuration = +(2.5 + (seed % 40) / 10).toFixed(1);
      const twinkleDelay = +((seed % 30) / 10).toFixed(1);

      starList.push({
        id: i,
        x: Number(x),
        y: Number(y),
        size,
        opacity: Number(opacity),
        color,
        twinkleDuration,
        twinkleDelay,
      });
    }
    return starList;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none select-none z-0"
    >
      {/* Deep Space Foundation Gradients */}
      <div className="absolute inset-0 bg-[#040814]" />

      {/* Subtle Cosmic Nebula Sheens */}
      <div className="absolute top-0 right-1/4 w-[700px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.06)_0%,transparent_70%)] blur-3xl" />
      <div className="absolute top-1/3 left-1/6 w-[600px] h-[450px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.05)_0%,transparent_70%)] blur-3xl" />
      <div className="absolute bottom-10 right-1/3 w-[800px] h-[400px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.04)_0%,transparent_70%)] blur-3xl" />

      {/* Dense Multi-Tier Twinkling Starfield */}
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="star-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {stars.map((star) => (
          <circle
            key={star.id}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.size / 2}
            fill={star.color}
            opacity={star.opacity}
            filter={star.size > 1.8 ? "url(#star-glow)" : undefined}
            style={{
              animation: `pulse-star ${star.twinkleDuration}s ease-in-out infinite`,
              animationDelay: `${star.twinkleDelay}s`,
            }}
          />
        ))}
      </svg>

      {/* Smooth Bottom Vignette Fade into page background */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent via-[#06080d]/80 to-[#06080d]" />

      {/* Star Twinkle Keyframe Style */}
      <style jsx>{`
        @keyframes pulse-star {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.9);
          }
          50% {
            opacity: 0.95;
            transform: scale(1.15);
          }
        }
      `}</style>
    </div>
  );
}

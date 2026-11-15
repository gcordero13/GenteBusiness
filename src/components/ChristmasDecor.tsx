"use client";

import { useEffect, useState } from "react";

const SNOWFLAKES = [
  { left: "8%", size: 5, duration: 10, delay: 0 },
  { left: "20%", size: 3, duration: 13, delay: 1.5 },
  { left: "34%", size: 6, duration: 11, delay: 3 },
  { left: "48%", size: 4, duration: 14, delay: 0.5 },
  { left: "62%", size: 3, duration: 12, delay: 4 },
  { left: "74%", size: 5, duration: 15, delay: 2 },
  { left: "86%", size: 4, duration: 10.5, delay: 3.5 },
  { left: "14%", size: 3, duration: 16, delay: 5 },
  { left: "58%", size: 3, duration: 13.5, delay: 1 },
  { left: "92%", size: 5, duration: 11.5, delay: 2.5 },
] as const;

const LIGHT_COLORS = ["#ef4444", "#22c55e", "#fbbf24"] as const;
const BULB_COUNT = 14;
const ATTACH_Y = 10;

export function ChristmasDecor({ enabled }: { enabled: boolean }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  if (!enabled) return null;

  const bulbs = Array.from({ length: BULB_COUNT }, (_, i) => {
    const attachXPercent = `${(i / (BULB_COUNT - 1)) * 100}%`;
    const cordLength = i % 2 === 0 ? 14 : 22;
    return {
      attachXPercent,
      bulbY: ATTACH_Y + cordLength,
      color: LIGHT_COLORS[i % LIGHT_COLORS.length],
      swayDuration: 2.4 + (i % 5) * 0.4,
      swayDelay: -((i % 7) * 0.6),
      flickerDuration: 3 + (i % 6) * 1.1,
      flickerDelay: -((i % 5) * 0.7),
    };
  });

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, overflow: "hidden" }}
    >
      <svg width="100%" height={70} style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <radialGradient id="christmas-bulb-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff2c4" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff2c4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <polyline
          points={bulbs.map((b) => `${b.attachXPercent},${ATTACH_Y}`).join(" ")}
          fill="none"
          stroke="#3a3a3a"
          strokeWidth={1.5}
          opacity={0.6}
        />
        {bulbs.map((b, i) => (
          <g
            key={i}
            style={
              reducedMotion
                ? undefined
                : {
                    transformBox: "fill-box",
                    transformOrigin: "center top",
                    animation: `christmas-decor-sway ${b.swayDuration}s ease-in-out ${b.swayDelay}s infinite alternate`,
                  }
            }
          >
            <line x1={b.attachXPercent} y1={ATTACH_Y} x2={b.attachXPercent} y2={b.bulbY} stroke="#3a3a3a" strokeWidth={1} />
            <circle cx={b.attachXPercent} cy={b.bulbY} r={14} fill="url(#christmas-bulb-glow)" />
            <circle
              cx={b.attachXPercent}
              cy={b.bulbY}
              r={4.5}
              fill={b.color}
              style={
                reducedMotion
                  ? undefined
                  : { animation: `christmas-decor-flicker ${b.flickerDuration}s linear ${b.flickerDelay}s infinite` }
              }
            />
          </g>
        ))}
      </svg>
      {!reducedMotion &&
        SNOWFLAKES.map((flake, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "-5%",
              left: flake.left,
              width: flake.size,
              height: flake.size,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 0 3px rgba(255,255,255,0.8)",
              animation: `christmas-decor-fall ${flake.duration}s linear ${flake.delay}s infinite`,
            }}
          />
        ))}
      <style>{`
        @keyframes christmas-decor-fall {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: .9; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes christmas-decor-sway {
          from { transform: rotate(-3deg); }
          to { transform: rotate(3deg); }
        }
        @keyframes christmas-decor-flicker {
          0%, 5%, 40%, 47%, 100% { opacity: 1; }
          2% { opacity: .78; }
          41% { opacity: .62; }
          43% { opacity: .95; }
          45% { opacity: .7; }
        }
      `}</style>
    </div>
  );
}

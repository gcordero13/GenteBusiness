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
const BULB_COUNT = 16;

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

  const bulbs = Array.from({ length: BULB_COUNT }, (_, i) => ({
    cx: `${(i / (BULB_COUNT - 1)) * 100}%`,
    color: LIGHT_COLORS[i % LIGHT_COLORS.length],
    cy: i % 2 === 0 ? 6 : 16,
  }));

  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 40, overflow: "hidden" }}
    >
      <svg width="100%" height="24" style={{ position: "absolute", top: 0, left: 0 }}>
        <polyline
          points={bulbs.map((b) => `${b.cx},${b.cy}`).join(" ")}
          fill="none"
          stroke="#d4af37"
          strokeWidth={1.5}
          opacity={0.6}
        />
        {bulbs.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={4} fill={b.color} />
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
      `}</style>
    </div>
  );
}

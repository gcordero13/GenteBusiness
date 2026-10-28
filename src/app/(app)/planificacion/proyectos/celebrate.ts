import confetti from "canvas-confetti";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Resuelve el punto de origen del burst de confeti en coordenadas normalizadas
// (0-1) que espera canvas-confetti, a partir de la posición en pantalla del
// elemento que disparó la celebración (tarjeta, fila, control).
function originFromElement(el: Element | null): { x: number; y: number } {
  if (!el) return { x: 0.5, y: 0.5 };
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) / window.innerWidth,
    y: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

// Pulso CSS breve sobre el elemento (sin partículas) para cuando el usuario
// tiene activado "reducir movimiento" en su sistema operativo.
function staticPulse(el: Element | null): void {
  if (!el || !(el instanceof HTMLElement)) return;
  el.animate(
    [
      { boxShadow: "0 0 0 0 rgba(34,197,94,0.5)" },
      { boxShadow: "0 0 0 8px rgba(34,197,94,0)" },
    ],
    { duration: 500, easing: "ease-out" },
  );
}

// Llamar tras una actualización exitosa que haya llevado percentComplete de
// un valor distinto de 100 a exactamente 100. `anchorEl` es el elemento
// visual (tarjeta de Tablero, fila de Lista, control del modal) desde el que
// debe salir el confeti.
export function celebrateCompletion(anchorEl: Element | null): void {
  if (prefersReducedMotion()) {
    staticPulse(anchorEl);
    return;
  }
  const origin = originFromElement(anchorEl);
  confetti({
    particleCount: 60,
    spread: 55,
    startVelocity: 28,
    gravity: 1.1,
    scalar: 0.8,
    origin,
    colors: ["#04B1AF", "#22c55e", "#facc15", "#0b2447"],
  });
}

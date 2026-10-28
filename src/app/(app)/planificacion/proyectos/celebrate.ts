import confetti from "canvas-confetti";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// El layout de la app (AppShell.tsx) pone todo el contenido de página dentro
// de un único <main>, con el menú lateral fuera de él. El canvas por defecto
// de canvas-confetti cubre toda la ventana (incluyendo el menú), así que el
// burst debe quedar acotado al rectángulo de <main> en vez de a la ventana
// completa, o el confeti termina visualmente "encima" del menú lateral.
function contentBounds(): DOMRect {
  const main = document.querySelector("main");
  return main ? main.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

// Resuelve el punto de origen del burst de confeti en coordenadas normalizadas
// (0-1) relativas a `bounds`, a partir de la posición en pantalla del
// elemento que disparó la celebración (tarjeta, fila, control).
function originFromElement(el: Element | null, bounds: DOMRect): { x: number; y: number } {
  if (!el) return { x: 0.5, y: 0.5 };
  const rect = el.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2 - bounds.left) / bounds.width,
    y: (rect.top + rect.height / 2 - bounds.top) / bounds.height,
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
  const bounds = contentBounds();
  const origin = originFromElement(anchorEl, bounds);

  // Un canvas propio, acotado a <main>, en vez del canvas global de
  // canvas-confetti (que cubre toda la ventana, incluyendo el menú lateral).
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.left = `${bounds.left}px`;
  canvas.style.top = `${bounds.top}px`;
  canvas.style.width = `${bounds.width}px`;
  canvas.style.height = `${bounds.height}px`;
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "60";
  document.body.appendChild(canvas);

  const burst = confetti.create(canvas, { resize: false, useWorker: false });
  const done = burst({
    particleCount: 60,
    spread: 55,
    startVelocity: 28,
    gravity: 1.1,
    scalar: 0.8,
    origin,
    colors: ["#04B1AF", "#22c55e", "#facc15", "#0b2447"],
  });
  Promise.resolve(done).finally(() => {
    burst.reset();
    canvas.remove();
  });
}

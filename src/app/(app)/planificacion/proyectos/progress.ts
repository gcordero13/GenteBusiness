// Plain module, no "use client" - this is imported by both client
// components (TableroView, ListaView, JerarquiaView, TareaDetailModal,
// TareasTabs) AND a Server Component (proyectos/[id]/page.tsx, for the
// project-level progress bar). It used to live inside TableroView.tsx,
// which crashed the server component with "This page couldn't load" the
// moment it tried to call it directly - importing a plain function from a
// "use client" module turns it into a client reference when crossing into
// server code, which can only be rendered as JSX, not called like a normal
// function.

// Progress bars across every view use this same ramp - confirmed with the
// user: the fill should read as more "intense" the closer a task is to
// done, not a flat color regardless of %. Opacity-only (not a hue shift)
// so it stays readable in both themes and doesn't clash with estado/task
// colors shown alongside it.
export function progressOpacity(percent: number): number {
  return 0.35 + (percent / 100) * 0.65;
}

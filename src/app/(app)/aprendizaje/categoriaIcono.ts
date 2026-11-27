import { BookOpen, Landmark, MonitorPlay } from "lucide-react";
import type { CursoCategory } from "@/lib/aprendizaje/types";

/** The icon of each Aprende category (Cursos, Tutoriales, Historias). */
export const CATEGORIA_ICONO: Record<CursoCategory, typeof BookOpen> = {
  curso: BookOpen,
  tutorial: MonitorPlay,
  historia: Landmark,
};

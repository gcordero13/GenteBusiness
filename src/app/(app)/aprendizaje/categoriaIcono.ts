import { BookOpen, Landmark } from "lucide-react";
import type { CursoCategory } from "@/lib/aprendizaje/types";

/** The icon of each course category (tutorials have their own cards). */
export const CATEGORIA_ICONO: Record<CursoCategory, typeof BookOpen> = {
  curso: BookOpen,
  historia: Landmark,
};

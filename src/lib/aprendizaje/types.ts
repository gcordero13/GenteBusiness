export type CursoCategory = "curso" | "historia";
export type CursoStatus = "borrador" | "publicado" | "archivado";

/** A file stored in SharePoint, referenced by Graph drive/item ids. */
export interface DriveFileRef {
  driveId: string;
  itemId: string;
}

export interface LeccionArchivo extends DriveFileRef {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
}

export interface Leccion {
  id: string;
  position: number;
  title: string;
  body: string | null;
  videoUrl: string | null;
  videoFile: DriveFileRef | null;
  archivos: LeccionArchivo[];
  completed: boolean;
}

/** A course's evaluation settings. questionsPerAttempt null = no evaluation. */
export interface EvalSettings {
  questionsPerAttempt: number | null;
  passingScore: number;
  maxAttempts: number | null;
}

export interface CursoDetail {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  status: CursoStatus;
  cover: DriveFileRef | null;
  lecciones: Leccion[];
  completedAt: string | null;
  evaluacion: EvalSettings;
}

export interface CatalogCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
  cover: DriveFileRef | null;
  leccionCount: number;
  completedLecciones: number;
  completedAt: string | null;
}

export interface GestionCursoRow {
  id: string;
  title: string;
  category: CursoCategory;
  status: CursoStatus;
  leccionCount: number;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<CursoCategory, string> = {
  curso: "Cursos y tutoriales",
  historia: "Historia",
};

export const STATUS_LABELS: Record<CursoStatus, string> = {
  borrador: "Borrador",
  publicado: "Publicado",
  archivado: "Archivado",
};

/** Same look as the shadcn Input, for native <select>/<textarea> in the Aprendizaje forms. */
export const FIELD_CLASS_NAME =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/** Permission-checked URL that redirects to the file's short-lived SharePoint download link. */
export function archivoUrl(ref: DriveFileRef): string {
  return `/api/aprendizaje/archivo/${encodeURIComponent(ref.driveId)}/${encodeURIComponent(ref.itemId)}`;
}

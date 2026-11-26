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
  /** The lesson's quiz, or null when it has none (then it's completed with "Marcar como vista"). */
  quiz: LeccionQuiz | null;
}

/** A lesson quiz: N random questions per person, worth `weight` % of the course grade. */
export interface LeccionQuiz {
  questionsPerAttempt: number;
  weight: number;
}

/** Course-wide evaluation rules; the quizzes themselves live on each lesson. */
export interface EvalSettings {
  /** Minimum course grade (weighted quiz scores) to complete the course. */
  passingScore: number;
  /** Attempts allowed per lesson quiz; null = unlimited. */
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
  anunciarProximamente: boolean;
  /** Module key this course is the tutorial of (e.g. "planificacion"), or null. */
  tutorialModulo: string | null;
  /** Pop the tutorial up at login for people with that module. */
  anunciarAlIniciar: boolean;
  /** Who signs this course's certificate. */
  firma: CursoFirma;
}

/** The certificate's signer; all empty prints a blank line with "Gestión Humana". */
export interface CursoFirma {
  nombre: string | null;
  cargo: string | null;
  /** Signature image (PNG/JPG) in SharePoint. */
  imagen: DriveFileRef | null;
}

/** A platform module a course can be the tutorial of. */
export interface ModuloOption {
  key: string;
  label: string;
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
  /** The person has started it (an inscripción exists). */
  enrolled: boolean;
  /** At least one lesson has a quiz. */
  hasEvaluacion: boolean;
  /** The person's course grade (weighted quiz scores); null if the course has no quizzes or wasn't started. */
  nota: number | null;
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

export const CATEGORY_SHORT_LABELS: Record<CursoCategory, string> = {
  curso: "Curso",
  historia: "Historia",
};

export interface PerfilAprendizaje {
  name: string;
  position: string | null;
  department: string | null;
  photoUrl: string | null;
}

export interface ProximoCurso {
  id: string;
  title: string;
  description: string | null;
  category: CursoCategory;
}

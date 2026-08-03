export const MAINTENANCE_CHECKLIST_ITEMS = [
  { key: "restore_point_created", label: "Punto de restauración creado" },
  { key: "temp_files_cleaned", label: "Limpieza de archivos temporales" },
  { key: "disk_defragmented", label: "Desfragmentación de disco" },
  { key: "antivirus_updated", label: "Antivirus actualizado" },
  { key: "windows_updated", label: "Actualización de Windows" },
  { key: "agenda_installed", label: "Instalación de Gente Sánchez Business (Agenda)" },
  { key: "apps_match_profile", label: "Aplicaciones corresponden al perfil del usuario" },
  { key: "wallpaper_installed", label: "Fondo de pantalla corporativo instalado" },
  { key: "keyboard_cleaned", label: "Limpieza física de teclado" },
  { key: "screen_cleaned", label: "Limpieza física de pantalla" },
] as const;

export type MaintenanceChecklistKey = (typeof MAINTENANCE_CHECKLIST_ITEMS)[number]["key"];

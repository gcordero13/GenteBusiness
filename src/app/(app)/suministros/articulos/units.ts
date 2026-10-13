// Standard unit-of-measure catalog for supply articles, confirmed with the
// user so "Unidad" is picked from a fixed list instead of free text -
// keeps the data consistent for reporting and for the CSV import/export.
export interface UnitOption {
  label: string;
  abbr: string;
  example: string;
}

export const UNIT_OPTIONS: UnitOption[] = [
  { label: "Unidad", abbr: "UND", example: "Mouse, teclado, monitor, silla" },
  { label: "Pieza", abbr: "PZA", example: "Repuestos, componentes" },
  { label: "Paquete", abbr: "PQT", example: "Hojas, vasos, servilletas" },
  { label: "Caja", abbr: "CJA", example: "Tóner, bolígrafos, papel" },
  { label: "Resma", abbr: "RMA", example: "Papel para impresora" },
  { label: "Fardo", abbr: "FDO", example: "Papel higiénico, servilletas" },
  { label: "Rollo", abbr: "RLL", example: "Papel, cable, cinta adhesiva" },
  { label: "Metro", abbr: "M", example: "Cable eléctrico, canaletas" },
  { label: "Metro cuadrado", abbr: "M²", example: "Materiales de revestimiento" },
  { label: "Litro", abbr: "L", example: "Productos de limpieza, líquidos" },
  { label: "Galón", abbr: "GAL", example: "Pintura, productos de limpieza" },
  { label: "Mililitro", abbr: "ML", example: "Líquidos en pequeñas cantidades" },
  { label: "Kilogramo", abbr: "KG", example: "Materiales por peso" },
  { label: "Gramo", abbr: "G", example: "Productos de poco peso" },
  { label: "Par", abbr: "PAR", example: "Guantes, calzado de seguridad" },
  { label: "Juego", abbr: "JGO", example: "Juegos de herramientas" },
  { label: "Kit", abbr: "KIT", example: "Kits de instalación o mantenimiento" },
  { label: "Bolsa", abbr: "BOL", example: "Tornillos, bridas, materiales pequeños" },
  { label: "Sobre", abbr: "SOB", example: "Sobres de oficina" },
  { label: "Botella", abbr: "BOT", example: "Agua, productos de limpieza" },
  { label: "Lata", abbr: "LAT", example: "Pintura, lubricantes" },
];

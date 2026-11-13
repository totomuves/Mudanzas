import { CONDITION_LABEL } from "@/lib/format";
import type { Condition } from "@/lib/types";

/** "style:nórdico" -> { kind: "style", value: "nórdico" } */
export function splitTrait(trait: string) {
  const i = trait.indexOf(":");
  return { kind: trait.slice(0, i), value: trait.slice(i + 1) };
}

const ROOM_LABEL: Record<string, string> = {
  living: "el living", comedor: "el comedor", cocina: "la cocina", dormitorio: "el dormitorio", baño: "el baño",
  oficina: "la oficina", infantil: "niños", exterior: "patio y terraza", lavandería: "la lavandería",
};

/** Texto para mostrar un rasgo aprendido. */
export function traitLabel(trait: string, categoryNames: Record<string, string> = {}) {
  const { kind, value } = splitTrait(trait);
  switch (kind) {
    case "category":
      return categoryNames[value] ?? value;
    case "style":
      return `Estilo ${value}`;
    case "material":
      return `De ${value}`;
    case "color":
      return `Color ${value}`;
    case "room":
      return `Para ${ROOM_LABEL[value] ?? value}`;
    case "size":
      return `Tamaño ${value}`;
    case "condition":
      return CONDITION_LABEL[value as Condition] ?? value;
    default:
      return value;
  }
}

export const TRAIT_GROUPS: { kind: string; title: string }[] = [
  { kind: "style", title: "Estilos" },
  { kind: "material", title: "Materiales" },
  { kind: "color", title: "Colores" },
  { kind: "room", title: "Espacios" },
  { kind: "size", title: "Tamaño" },
  { kind: "condition", title: "Estado" },
];

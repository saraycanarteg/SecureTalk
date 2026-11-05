// Matriz de permisos por rol, nunca por usuario. Documentada en docs/matriz-roles-permisos.md.
// Un Map y no un objeto: acciones como "constructor" no encuentran nada heredado.
const ACTION_PERMISSIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ['steganography.analyze', ['ADMIN', 'ANALYST']],
  ['steganography.results.read', ['ADMIN', 'ANALYST']],
]);

// undefined significa accion desconocida, que siempre se deniega.
export function rolesAllowedFor(action: string): readonly string[] | undefined {
  return ACTION_PERMISSIONS.get(action);
}

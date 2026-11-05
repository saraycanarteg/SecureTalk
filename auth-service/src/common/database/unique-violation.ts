import { QueryFailedError } from 'typeorm';

const POSTGRES_UNIQUE_VIOLATION = '23505';

// Devuelve la restriccion violada. Se confia en la BD y no en una consulta previa
// porque dos peticiones simultaneas podrian pasar esa consulta.
export function uniqueViolationConstraint(error: unknown): string | undefined {
  if (!(error instanceof QueryFailedError)) {
    return undefined;
  }
  const driverError = error.driverError as { code?: string; constraint?: string };
  return driverError.code === POSTGRES_UNIQUE_VIOLATION ? driverError.constraint : undefined;
}

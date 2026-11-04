import type { AnalysisAction, AnalysisStatus } from './entities/analysis.entity.js';

// Politica aplicada segun la clasificacion. Un resultado sospechoso es un indicio, no una prueba.
const ACTION_BY_STATUS: Record<AnalysisStatus, AnalysisAction> = {
  sin_indicios: 'ninguna',
  no_concluyente: 'advertencia',
  sospechoso: 'cuarentena',
  error: 'rechazo',
};

export function resolveAction(status: AnalysisStatus): AnalysisAction {
  return ACTION_BY_STATUS[status];
}

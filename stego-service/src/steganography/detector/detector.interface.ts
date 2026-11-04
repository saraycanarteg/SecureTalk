import type { AnalysisStatus } from '../entities/analysis.entity.js';

export const DETECTOR = Symbol('DETECTOR');

export interface DetectorResult {
  technique: string;
  status: AnalysisStatus;
  indicators: Record<string, unknown>;
  limitations: string;
}

export interface Detector {
  analyze(filePath: string): Promise<DetectorResult>;
}

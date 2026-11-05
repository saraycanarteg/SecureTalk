import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import type { AnalysisStatus } from '../entities/analysis.entity.js';
import type { AnalyzableImage, ColorChannel } from '../image/decoded-image.js';
import { decodeImage } from '../image/image-decoder';
import { chiSquareSurvival } from './chi-square';
import { Detector, DetectorResult } from './detector.interface';

export const TECHNIQUE = 'lsb_statistical_analysis';
export const SUSPICIOUS_THRESHOLD = 0.95;
export const CLEAN_THRESHOLD = 0.05;

// Tambien se mide el inicio del canal: un mensaje corto insertado en orden
// solo iguala los pares de valores en la parte de la imagen que ocupa.
const PREFIX_FRACTIONS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1];

// Equivale a 64x64 pixeles. Con menos muestras la estadistica no es fiable.
export const MIN_WINDOW_SAMPLES = 4096;

// Un par sin este minimo de muestras esperadas no aporta a una prueba chi-cuadrado.
const MIN_EXPECTED_COUNT = 5;

// Un mensaje real no se aleja tanto del equilibrio entre bits. Fuera de este rango la
// proporcion no se debe a una insercion: por ejemplo, una imagen con todos sus valores pares.
const MIN_EVEN_RATIO = 1 / 3;
const MAX_EVEN_RATIO = 2 / 3;

const BASE_LIMITATIONS =
  'Resultado indicativo, no concluyente: un resultado sospechoso es un indicio, no una prueba. ' +
  'Solo se analiza el bit menos significativo de los canales de color en PNG y BMP sin perdida. ' +
  'Puede no detectar cargas pequenas o dispersas y puede dar falsos positivos en degradados ' +
  'digitales o imagenes de ruido uniforme.';

interface ChiSquareResult {
  statistic: number;
  degrees: number;
  pValue: number;
}

interface ChannelIndicators {
  samples: number;
  chi_square: number | null;
  degrees_of_freedom: number | null;
  p_value: number | null;
  max_p_value: number | null;
  lsb_ones_ratio: number;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;

// Ataque chi-cuadrado de Westfeld y Pfitzmann. Reemplazar el LSB tiende a igualar las
// frecuencias de cada par de valores (2k, 2k+1), asi que un p-valor cercano a 1 significa que
// los pares estan igualados. El valor esperado usa la proporcion observada de valores pares en
// lugar de 1/2: asi tambien se reconocen los mensajes sin cifrar, cuyos bits no estan equilibrados.
export function chiSquareOfPairs(
  histogram: Uint32Array,
): ChiSquareResult | null {
  const pairs: [number, number][] = [];
  let evenTotal = 0;
  let total = 0;
  for (let value = 0; value < histogram.length; value += 2) {
    const even = histogram[value];
    const count = even + histogram[value + 1];
    if (count / 2 >= MIN_EXPECTED_COUNT) {
      pairs.push([even, count]);
      evenTotal += even;
      total += count;
    }
  }
  if (pairs.length < 2) {
    return null;
  }

  const evenRatio = Math.min(
    MAX_EVEN_RATIO,
    Math.max(MIN_EVEN_RATIO, evenTotal / total),
  );
  const statistic = pairs.reduce((sum, [even, count]) => {
    const expected = count * evenRatio;
    return sum + (even - expected) ** 2 / expected;
  }, 0);
  const degrees = pairs.length - 1;
  return { statistic, degrees, pValue: chiSquareSurvival(statistic, degrees) };
}

function analyzeChannel(
  image: AnalyzableImage,
  channel: ColorChannel,
): ChannelIndicators {
  const { samples, bytesPerPixel } = image;
  const pixelCount = image.width * image.height;
  const boundaries = PREFIX_FRACTIONS.map((fraction) =>
    Math.floor(pixelCount * fraction),
  );

  const histogram = new Uint32Array(256);
  let maxPValue: number | null = null;
  let whole: ChiSquareResult | null = null;
  let next = 0;

  for (let i = 0, position = channel.offset; i < pixelCount; i++) {
    histogram[samples[position]]++;
    position += bytesPerPixel;
    if (i + 1 !== boundaries[next]) {
      continue;
    }
    next++;

    const result =
      i + 1 >= MIN_WINDOW_SAMPLES ? chiSquareOfPairs(histogram) : null;
    if (result && (maxPValue === null || result.pValue > maxPValue)) {
      maxPValue = result.pValue;
    }
    if (next === boundaries.length) {
      whole = result;
    }
  }

  let ones = 0;
  for (let value = 1; value < histogram.length; value += 2) {
    ones += histogram[value];
  }

  return {
    samples: pixelCount,
    chi_square: whole && round(whole.statistic),
    degrees_of_freedom: whole && whole.degrees,
    p_value: whole && round(whole.pValue),
    max_p_value: maxPValue === null ? null : round(maxPValue),
    lsb_ones_ratio: round(ones / pixelCount),
  };
}

function classify(score: number | null): AnalysisStatus {
  if (score === null) {
    return 'no_concluyente';
  }
  if (score >= SUSPICIOUS_THRESHOLD) {
    return 'sospechoso';
  }
  return score < CLEAN_THRESHOLD ? 'sin_indicios' : 'no_concluyente';
}

function inconclusiveReason(score: number | null): string {
  return score === null
    ? 'Muestra insuficiente: la imagen es muy pequena o tiene muy pocos valores distintos. '
    : 'El indicador quedo entre los dos umbrales. ';
}

@Injectable()
export class LsbChiSquareDetector implements Detector {
  async analyze(filePath: string): Promise<DetectorResult> {
    const image = await decodeImage(await readFile(filePath));
    const imageInfo = {
      format: image.format,
      width: image.width,
      height: image.height,
    };

    if (!image.analyzable) {
      return {
        technique: TECHNIQUE,
        status: 'no_concluyente',
        indicators: { image: imageInfo },
        limitations: `${image.reason}. ${BASE_LIMITATIONS}`,
      };
    }

    const channels = Object.fromEntries(
      image.channels.map((channel) => [
        channel.name,
        analyzeChannel(image, channel),
      ]),
    );
    const scores = Object.values(channels)
      .map((channel) => channel.max_p_value)
      .filter((value) => value !== null);
    const score = scores.length > 0 ? Math.max(...scores) : null;
    const status = classify(score);

    return {
      technique: TECHNIQUE,
      status,
      indicators: {
        method: 'chi_square_westfeld_pfitzmann',
        anomaly_score: score,
        threshold: SUSPICIOUS_THRESHOLD,
        lower_threshold: CLEAN_THRESHOLD,
        image: imageInfo,
        channels,
      },
      limitations:
        status === 'no_concluyente'
          ? `${inconclusiveReason(score)}${BASE_LIMITATIONS}`
          : BASE_LIMITATIONS,
    };
  }
}

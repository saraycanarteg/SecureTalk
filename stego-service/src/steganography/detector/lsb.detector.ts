import { readFile } from 'node:fs/promises';

import { Injectable } from '@nestjs/common';

import type { AnalysisStatus } from '../entities/analysis.entity.js';
import type { AnalyzableImage, ColorChannel } from '../image/decoded-image.js';
import { decodeImage } from '../image/image-decoder';
import { chiSquareSurvival } from './chi-square';
import { Detector, DetectorResult } from './detector.interface';
import {
  createClassCounts,
  estimatePayloadRate,
  PAIR_CLASSES,
} from './sample-pairs';

export const TECHNIQUE = 'lsb_statistical_analysis';

// Chi-cuadrado: p-valor a partir del cual los pares de valores se consideran igualados.
export const SUSPICIOUS_THRESHOLD = 0.95;
export const CLEAN_THRESHOLD = 0.05;

// Pares de muestras: proporcion estimada de muestras usadas por el mensaje. El maximo medido
// en imagenes sin carga fue 0.058 en la imagen completa y 0.073 en una porcion inicial.
export const PAYLOAD_RATE_THRESHOLD = 0.08;
export const CLEAN_PAYLOAD_RATE = 0.05;
export const PREFIX_PAYLOAD_RATE_THRESHOLD = 0.15;

// Tambien se mide el inicio del canal: un mensaje corto insertado en orden
// solo se nota en la parte de la imagen que ocupa.
const PREFIX_FRACTIONS = [1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1];
const MIN_CHI_SQUARE_FRACTION = 1 / 16;

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
  'Puede no detectar cargas muy pequenas y puede equivocarse en imagenes con patrones inusuales, ' +
  'como degradados digitales o ruido uniforme.';

const REASON_INSUFFICIENT =
  'Muestra insuficiente: la imagen es muy pequena o tiene muy pocos valores distintos. ';
const REASON_UNCONFIRMED =
  'Los pares de valores estan igualados, pero las muestras vecinas no lo confirman; es habitual en degradados digitales o ruido uniforme. ';
const REASON_BETWEEN_THRESHOLDS =
  'Los indicadores quedaron entre los umbrales. ';

interface ChiSquareResult {
  statistic: number;
  degrees: number;
  pValue: number;
}

interface ChannelScan {
  whole: ChiSquareResult | null;
  maxPValue: number | null;
  rates: number[];
}

interface Classification {
  status: AnalysisStatus;
  evidence: string[];
  reason: string;
}

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const mean = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

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

// Recorre el canal una vez y mide cada porcion inicial al llegar a su limite. Con reversed
// empieza por el final del archivo: una herramienta que trabaja con la imagen ya decodificada
// escribe en la primera fila visible, que en un BMP normal es la ultima guardada.
function scanChannel(
  image: AnalyzableImage,
  channel: ColorChannel,
  boundaries: number[],
  reversed: boolean,
): ChannelScan {
  const { samples, bytesPerPixel, width, height } = image;
  const pixelCount = width * height;
  const step = reversed ? -bytesPerPixel : bytesPerPixel;
  const rowStep = step * width;
  const minChiSquareSamples = pixelCount * MIN_CHI_SQUARE_FRACTION;

  const histogram = new Uint32Array(256);
  const classCounts = createClassCounts();
  const rates: number[] = [];
  let whole: ChiSquareResult | null = null;
  let maxPValue: number | null = null;
  let next = 0;
  let column = 0;
  let position =
    channel.offset + (reversed ? (pixelCount - 1) * bytesPerPixel : 0);

  for (let i = 0; i < pixelCount; i++, position += step) {
    const value = samples[position];
    histogram[value]++;
    if (column !== 0) {
      classCounts[PAIR_CLASSES[(samples[position - step] << 8) | value]]++;
    }
    if (i >= width) {
      classCounts[PAIR_CLASSES[(samples[position - rowStep] << 8) | value]]++;
    }
    column = column + 1 === width ? 0 : column + 1;
    if (i + 1 !== boundaries[next]) {
      continue;
    }
    next++;

    rates.push(estimatePayloadRate(classCounts));
    if (i + 1 >= minChiSquareSamples) {
      const result = chiSquareOfPairs(histogram);
      if (result && (maxPValue === null || result.pValue > maxPValue)) {
        maxPValue = result.pValue;
      }
      if (i + 1 === pixelCount) {
        whole = result;
      }
    }
  }
  return { whole, maxPValue, rates };
}

function onesRatio(image: AnalyzableImage, channel: ColorChannel): number {
  const { samples, bytesPerPixel, width, height } = image;
  const pixelCount = width * height;
  let ones = 0;
  for (let i = 0, position = channel.offset; i < pixelCount; i++) {
    ones += samples[position] & 1;
    position += bytesPerPixel;
  }
  return ones / pixelCount;
}

function classify(
  score: number | null,
  rate: number | null,
  prefixRate: number | null,
): Classification {
  const evidence: string[] = [];
  if (
    rate !== null &&
    prefixRate !== null &&
    (rate >= PAYLOAD_RATE_THRESHOLD ||
      prefixRate >= PREFIX_PAYLOAD_RATE_THRESHOLD)
  ) {
    evidence.push('sample_pairs');
    if (score !== null && score >= SUSPICIOUS_THRESHOLD) {
      evidence.push('chi_square');
    }
    return { status: 'sospechoso', evidence, reason: '' };
  }

  if (score === null || rate === null) {
    return { status: 'no_concluyente', evidence, reason: REASON_INSUFFICIENT };
  }
  if (score >= SUSPICIOUS_THRESHOLD) {
    return { status: 'no_concluyente', evidence, reason: REASON_UNCONFIRMED };
  }
  if (score >= CLEAN_THRESHOLD || rate >= CLEAN_PAYLOAD_RATE) {
    return {
      status: 'no_concluyente',
      evidence,
      reason: REASON_BETWEEN_THRESHOLDS,
    };
  }
  return { status: 'sin_indicios', evidence, reason: '' };
}

@Injectable()
export class LsbDetector implements Detector {
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

    const pixelCount = image.width * image.height;
    const boundaries = PREFIX_FRACTIONS.map((fraction) =>
      Math.floor(pixelCount * fraction),
    ).filter((boundary) => boundary >= MIN_WINDOW_SAMPLES);

    const scanAll = (reversed: boolean) =>
      image.channels.map((channel) =>
        scanChannel(image, channel, boundaries, reversed),
      );
    const directions = image.bottomUp
      ? [scanAll(false), scanAll(true)]
      : [scanAll(false)];
    const forward = directions[0];

    // Se promedian los canales en cada porcion: una sola medida por canal varia demasiado.
    const meanRates = directions.map((scans) =>
      boundaries.map((_, i) => mean(scans.map((scan) => scan.rates[i]))),
    );
    const hasWhole = boundaries.includes(pixelCount);
    const rate = hasWhole ? meanRates[0][boundaries.length - 1] : null;
    const prefixRates = meanRates.flatMap((rates) =>
      hasWhole ? rates.slice(0, -1) : rates,
    );
    const prefixRate =
      rate === null
        ? null
        : prefixRates.length > 0
          ? Math.max(...prefixRates)
          : 0;

    const pValues = directions
      .flat()
      .map((scan) => scan.maxPValue)
      .filter((value) => value !== null);
    const score = pValues.length > 0 ? round(Math.max(...pValues)) : null;

    const channels = Object.fromEntries(
      image.channels.map((channel, i) => {
        const { whole, maxPValue, rates } = forward[i];
        return [
          channel.name,
          {
            samples: pixelCount,
            chi_square: whole && round(whole.statistic),
            degrees_of_freedom: whole && whole.degrees,
            p_value: whole && round(whole.pValue),
            max_p_value: maxPValue === null ? null : round(maxPValue),
            payload_rate: hasWhole ? round(rates[rates.length - 1]) : null,
            lsb_ones_ratio: round(onesRatio(image, channel)),
          },
        ];
      }),
    );

    const { status, evidence, reason } = classify(score, rate, prefixRate);
    return {
      technique: TECHNIQUE,
      status,
      indicators: {
        method: 'chi_square_westfeld_pfitzmann+sample_pair_analysis',
        anomaly_score: score,
        threshold: SUSPICIOUS_THRESHOLD,
        lower_threshold: CLEAN_THRESHOLD,
        estimated_payload_rate: rate === null ? null : round(rate),
        payload_rate_threshold: PAYLOAD_RATE_THRESHOLD,
        max_prefix_payload_rate: prefixRate === null ? null : round(prefixRate),
        prefix_payload_rate_threshold: PREFIX_PAYLOAD_RATE_THRESHOLD,
        evidence,
        image: imageInfo,
        channels,
      },
      limitations: `${reason}${BASE_LIMITATIONS}`,
    };
  }
}

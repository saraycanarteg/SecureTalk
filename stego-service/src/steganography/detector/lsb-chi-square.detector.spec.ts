import { createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPng, buildRgbPng, PNG_COLOR } from '../../../test/support/images';
import { AnalyzableImage } from '../image/decoded-image';
import { decodeImage } from '../image/image-decoder';
import {
  chiSquareOfPairs,
  CLEAN_THRESHOLD,
  LsbChiSquareDetector,
  MIN_WINDOW_SAMPLES,
  SUSPICIOUS_THRESHOLD,
} from './lsb-chi-square.detector';

const SAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'samples');
const sample = (name: string) => join(SAMPLES_DIR, name);

describe('LsbChiSquareDetector', () => {
  const detector = new LsbChiSquareDetector();

  let dir: string;
  const analyzeBuffer = (content: Buffer) => {
    const path = join(dir, 'imagen');
    writeFileSync(path, content);
    return detector.analyze(path);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'securetalk-detector-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('muestras originales', () => {
    it.each(['original.png', 'original.bmp'])(
      '%s no presenta indicios',
      async (name) => {
        const result = await detector.analyze(sample(name));

        expect(result.status).toBe('sin_indicios');
        expect(result.indicators.anomaly_score).toBeLessThan(CLEAN_THRESHOLD);
      },
    );
  });

  describe('muestras con mensaje oculto', () => {
    it.each([
      'lsb-100.png',
      'lsb-100.bmp',
      'lsb-25.png',
      'lsb-texto-plano-25.png',
    ])('%s resulta sospechosa', async (name) => {
      const result = await detector.analyze(sample(name));

      expect(result.status).toBe('sospechoso');
      expect(result.indicators.anomaly_score).toBeGreaterThanOrEqual(
        SUSPICIOUS_THRESHOLD,
      );
    });

    it('la muestra guarda un mensaje real y solo cambia el bit menos significativo', async () => {
      const decode = async (name: string) =>
        (await decodeImage(readFileSync(sample(name)))) as AnalyzableImage;
      const original = await decode('original.png');
      const stego = await decode('lsb-100.png');

      expect(stego.samples.length).toBe(original.samples.length);
      expect(
        stego.samples.every(
          (value, i) => (value & 0xfe) === (original.samples[i] & 0xfe),
        ),
      ).toBe(true);

      const encrypted = Buffer.alloc(64);
      for (let bit = 0; bit < encrypted.length * 8; bit++) {
        encrypted[bit >> 3] |= (stego.samples[bit] & 1) << (7 - (bit & 7));
      }
      const key = createHash('sha256').update('securetalk-muestras').digest();
      const decipher = createDecipheriv('aes-256-ctr', key, Buffer.alloc(16));
      expect(decipher.update(encrypted).toString()).toContain(
        'Mensaje de prueba oculto',
      );
    });

    it('limitacion conocida: una carga dispersa del 10 % no se detecta', async () => {
      const result = await detector.analyze(sample('lsb-disperso-10.png'));

      expect(result.status).toBe('sin_indicios');
    });
  });

  describe('limitaciones y casos limite', () => {
    it('limitacion conocida: un degradado perfecto da un falso positivo', async () => {
      // Cada valor aparece el mismo numero de veces, igual que tras una insercion.
      const gradient = buildRgbPng(256, 256, (x) => [x, x, x]);

      const result = await analyzeBuffer(gradient);

      expect(result.status).toBe('sospechoso');
    });

    it('una imagen de un solo color no alcanza para concluir', async () => {
      const result = await analyzeBuffer(
        buildRgbPng(100, 100, () => [120, 80, 40]),
      );

      expect(result.status).toBe('no_concluyente');
      expect(result.indicators.anomaly_score).toBeNull();
      expect(result.limitations).toContain('Muestra insuficiente');
    });

    it('una imagen con pocos pixeles no alcanza para concluir', async () => {
      const side = Math.floor(Math.sqrt(MIN_WINDOW_SAMPLES)) - 1;

      const result = await analyzeBuffer(buildRgbPng(side, side));

      expect(result.status).toBe('no_concluyente');
    });

    it('una imagen con todos sus valores pares no se confunde con una insercion', async () => {
      const result = await analyzeBuffer(
        buildRgbPng(128, 128, (x, y) => [
          (x * 2) & 0xfe,
          (y * 2) & 0xfe,
          (x + y) & 0xfe,
        ]),
      );

      expect(result.status).toBe('sin_indicios');
    });

    it('una variante integra no analizable no es concluyente y explica el motivo', async () => {
      const palette = buildPng(2, 1, Buffer.from([0, 1, 2]), {
        colorType: PNG_COLOR.PALETTE,
      });

      const result = await analyzeBuffer(palette);

      expect(result).toMatchObject({
        status: 'no_concluyente',
        technique: 'lsb_statistical_analysis',
      });
      expect(result.limitations).toContain('PNG con paleta');
    });

    it('propaga el error si el archivo no se puede decodificar', async () => {
      await expect(
        analyzeBuffer(Buffer.from('no-es-imagen')),
      ).rejects.toThrow();
    });
  });

  describe('indicadores', () => {
    it('sigue el formato del Anexo C y calcula las metricas por canal', async () => {
      const { indicators, technique, limitations } = await detector.analyze(
        sample('lsb-100.png'),
      );

      expect(technique).toBe('lsb_statistical_analysis');
      expect(limitations).toContain('Resultado indicativo, no concluyente');
      expect(indicators).toMatchObject({
        method: 'chi_square_westfeld_pfitzmann',
        anomaly_score: expect.any(Number),
        threshold: SUSPICIOUS_THRESHOLD,
        lower_threshold: CLEAN_THRESHOLD,
        image: { format: 'png', width: 512, height: 384 },
      });
      const channels = indicators.channels as Record<string, any>;
      expect(Object.keys(channels)).toEqual(['r', 'g', 'b']);
      expect(channels.r).toEqual({
        samples: 512 * 384,
        chi_square: expect.any(Number),
        degrees_of_freedom: expect.any(Number),
        p_value: expect.any(Number),
        max_p_value: expect.any(Number),
        lsb_ones_ratio: expect.any(Number),
      });
      expect(channels.r.lsb_ones_ratio).toBeCloseTo(0.5, 1);
    });

    it('se puede guardar como JSON sin perder valores', async () => {
      const { indicators } = await analyzeBuffer(
        buildRgbPng(100, 100, () => [1, 2, 3]),
      );

      expect(JSON.parse(JSON.stringify(indicators))).toEqual(indicators);
    });

    it('detecta una insercion en un solo canal', async () => {
      const png = await decodeImage(readFileSync(sample('original.png')));
      const { samples, width, height } = png as AnalyzableImage;
      const blueOnly = Buffer.from(samples);
      const random = createHash('sha512');
      let bits = Buffer.alloc(0);
      for (let i = 0; bits.length * 8 < width * height; i++) {
        bits = Buffer.concat([bits, random.copy().update(String(i)).digest()]);
      }
      for (let i = 0; i < width * height; i++) {
        const blue = i * 3 + 2;
        blueOnly[blue] =
          (blueOnly[blue] & 0xfe) | ((bits[i >> 3] >> (i & 7)) & 1);
      }

      const stride = width * 3;
      const scanlines = Buffer.alloc(height * (stride + 1));
      for (let row = 0; row < height; row++) {
        blueOnly.copy(
          scanlines,
          row * (stride + 1) + 1,
          row * stride,
          (row + 1) * stride,
        );
      }

      const result = await analyzeBuffer(buildPng(width, height, scanlines));

      expect(result.status).toBe('sospechoso');
    });
  });
});

describe('chiSquareOfPairs', () => {
  const histogramOf = (entries: Record<number, number>) => {
    const histogram = new Uint32Array(256);
    for (const [value, count] of Object.entries(entries)) {
      histogram[Number(value)] = count;
    }
    return histogram;
  };

  it('calcula el estadistico de Westfeld-Pfitzmann sobre los pares', () => {
    // Proporcion observada 1/2: (60-50)^2/50 + (40-50)^2/50 = 4.
    const result = chiSquareOfPairs(
      histogramOf({ 10: 60, 11: 40, 20: 40, 21: 60 }),
    );

    expect(result).toMatchObject({ statistic: 4, degrees: 1 });
  });

  it('da un p-valor de 1 con pares perfectamente iguales', () => {
    const result = chiSquareOfPairs(
      histogramOf({ 10: 50, 11: 50, 20: 50, 21: 50 }),
    );

    expect(result).toMatchObject({ statistic: 0, pValue: 1 });
  });

  it('da un p-valor cercano a 0 con pares muy desiguales', () => {
    const result = chiSquareOfPairs(
      histogramOf({ 10: 1000, 11: 10, 20: 10, 21: 1000 }),
    );

    expect(result?.pValue).toBeLessThan(0.001);
  });

  it('ignora los pares con muy pocas muestras', () => {
    const result = chiSquareOfPairs(
      histogramOf({ 10: 50, 11: 50, 20: 50, 21: 50, 30: 3, 31: 1 }),
    );

    expect(result?.degrees).toBe(1);
  });

  it('no calcula nada con menos de dos pares validos', () => {
    expect(chiSquareOfPairs(histogramOf({ 10: 100, 11: 100 }))).toBeNull();
    expect(chiSquareOfPairs(new Uint32Array(256))).toBeNull();
  });
});

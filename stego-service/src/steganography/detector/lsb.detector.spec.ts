import { createDecipheriv, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildBmp,
  buildPng,
  buildRgbPng,
  PNG_COLOR,
} from '../../../test/support/images';
import { AnalyzableImage } from '../image/decoded-image';
import { decodeImage } from '../image/image-decoder';
import {
  chiSquareOfPairs,
  CLEAN_PAYLOAD_RATE,
  CLEAN_THRESHOLD,
  LsbDetector,
  MIN_WINDOW_SAMPLES,
  PAYLOAD_RATE_THRESHOLD,
  PREFIX_PAYLOAD_RATE_THRESHOLD,
  SUSPICIOUS_THRESHOLD,
} from './lsb.detector';

const SAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'samples');
const sample = (name: string) => join(SAMPLES_DIR, name);

const decodeSample = async (name: string) =>
  (await decodeImage(readFileSync(sample(name)))) as AnalyzableImage;

function toScanlines(samples: Buffer, width: number, height: number) {
  const stride = width * 3;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let row = 0; row < height; row++) {
    samples.copy(
      scanlines,
      row * (stride + 1) + 1,
      row * stride,
      (row + 1) * stride,
    );
  }
  return scanlines;
}

function pseudoRandomBits(count: number) {
  const random = createHash('sha512');
  let bits = Buffer.alloc(0);
  for (let i = 0; bits.length * 8 < count; i++) {
    bits = Buffer.concat([bits, random.copy().update(String(i)).digest()]);
  }
  return (i: number) => (bits[i >> 3] >> (i & 7)) & 1;
}

describe('LsbDetector', () => {
  const detector = new LsbDetector();

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
        const { status, indicators } = await detector.analyze(sample(name));

        expect(status).toBe('sin_indicios');
        expect(indicators.anomaly_score).toBeLessThan(CLEAN_THRESHOLD);
        expect(indicators.estimated_payload_rate).toBeLessThan(
          CLEAN_PAYLOAD_RATE,
        );
        expect(indicators.evidence).toEqual([]);
      },
    );
  });

  describe('muestras con mensaje oculto', () => {
    it.each([
      ['lsb-100.png', 0.9, 1],
      ['lsb-100.bmp', 0.9, 1],
      ['lsb-25.png', 0.2, 0.3],
      ['lsb-texto-plano-25.png', 0.15, 0.3],
      ['lsb-disperso-10.png', 0.08, 0.13],
    ])(
      '%s resulta sospechosa y estima la carga real',
      async (name, min, max) => {
        const { status, indicators } = await detector.analyze(sample(name));

        expect(status).toBe('sospechoso');
        expect(indicators.evidence).toContain('sample_pairs');
        expect(indicators.estimated_payload_rate).toBeGreaterThanOrEqual(min);
        expect(indicators.estimated_payload_rate).toBeLessThanOrEqual(max);
      },
    );

    it('detecta un mensaje del 2 % por las porciones iniciales', async () => {
      const { status, indicators } = await detector.analyze(
        sample('lsb-2.png'),
      );

      expect(status).toBe('sospechoso');
      expect(indicators.estimated_payload_rate).toBeLessThan(
        PAYLOAD_RATE_THRESHOLD,
      );
      expect(indicators.max_prefix_payload_rate).toBeGreaterThanOrEqual(
        indicators.prefix_payload_rate_threshold as number,
      );
    });

    it('detecta un mensaje corto sin cifrar y no devuelve su contenido', async () => {
      const result = await detector.analyze(sample('lsb-texto-corto.png'));

      expect(result.status).toBe('sospechoso');
      expect(result.indicators.evidence).toEqual(['lsb_plaintext']);
      expect(result.indicators.plaintext_run).toBeGreaterThanOrEqual(16);
      expect(JSON.stringify(result)).not.toContain('Mensaje secreto');
    });

    it('la insercion completa tambien la confirma chi-cuadrado', async () => {
      const { indicators } = await detector.analyze(sample('lsb-100.png'));

      expect(indicators.evidence).toEqual(['sample_pairs', 'chi_square']);
      expect(indicators.anomaly_score).toBeGreaterThanOrEqual(
        SUSPICIOUS_THRESHOLD,
      );
    });

    it('la muestra guarda un mensaje real y solo cambia el bit menos significativo', async () => {
      const original = await decodeSample('original.png');
      const stego = await decodeSample('lsb-100.png');

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

    it('detecta una insercion en un solo canal', async () => {
      const { samples, width, height } = await decodeSample('original.png');
      const blueOnly = Buffer.from(samples);
      const bitAt = pseudoRandomBits(width * height);
      for (let i = 0; i < width * height; i++) {
        const blue = i * 3 + 2;
        blueOnly[blue] = (blueOnly[blue] & 0xfe) | bitAt(i);
      }

      const result = await analyzeBuffer(
        buildPng(width, height, toScanlines(blueOnly, width, height)),
      );

      expect(result.status).toBe('sospechoso');
    });

    it('en un BMP detecta un mensaje en la primera fila visible, al final del archivo', async () => {
      const { samples, width, height } = await decodeSample('original.bmp');
      const stored = Buffer.from(samples);
      const bytes = Math.floor(stored.length * 0.03);
      const bitAt = pseudoRandomBits(bytes);
      const lastRow = (height - 1) * width * 3;
      for (let i = 0; i < bytes; i++) {
        // Recorre las filas desde la ultima guardada, que es la primera visible.
        const row = Math.floor(i / (width * 3));
        const position = lastRow - row * width * 3 + (i % (width * 3));
        stored[position] = (stored[position] & 0xfe) | bitAt(i);
      }

      const result = await analyzeBuffer(buildBmp(width, height, stored));

      expect(result.status).toBe('sospechoso');
    });

    it('limitacion conocida: una carga dispersa del 3 % no se detecta', async () => {
      const result = await detector.analyze(sample('lsb-disperso-3.png'));

      expect(result.status).toBe('sin_indicios');
    });
  });

  describe('umbral segun el tamano de la imagen', () => {
    const noisyImage = (width: number, height: number) =>
      buildRgbPng(width, height, (x, y) => {
        const value = (x * 37 + y * 101 + ((x * y) % 13)) & 0xff;
        return [value, value ^ 0x15, value ^ 0x2a];
      });

    it('exige mas evidencia con pocos pixeles que con muchos', async () => {
      const small = await analyzeBuffer(noisyImage(128, 128));
      const large = await detector.analyze(sample('original.png'));

      expect(small.indicators.payload_rate_threshold).toBeGreaterThan(
        large.indicators.payload_rate_threshold as number,
      );
      expect(large.indicators.payload_rate_threshold).toBe(
        PAYLOAD_RATE_THRESHOLD,
      );
    });

    it('informa que porcion estuvo mas cerca de su propio umbral', async () => {
      const { indicators } = await detector.analyze(sample('lsb-2.png'));

      expect(indicators.prefix_payload_rate_threshold).toBeGreaterThanOrEqual(
        PREFIX_PAYLOAD_RATE_THRESHOLD,
      );
      expect(indicators.max_prefix_payload_rate).toBeGreaterThan(
        indicators.estimated_payload_rate as number,
      );
    });
  });

  describe('limitaciones y casos limite', () => {
    it('un degradado perfecto no se clasifica como sospechoso', async () => {
      // Cada valor aparece el mismo numero de veces, igual que tras una insercion.
      const result = await detector.analyze(sample('limites/degradado.png'));

      expect(result.status).toBe('no_concluyente');
      expect(result.indicators.anomaly_score).toBeGreaterThanOrEqual(
        SUSPICIOUS_THRESHOLD,
      );
      expect(result.indicators.estimated_payload_rate).toBeLessThan(
        CLEAN_PAYLOAD_RATE,
      );
      expect(result.limitations).toContain('no lo confirman');
    });

    it('una imagen de un solo color no alcanza para concluir', async () => {
      const result = await detector.analyze(sample('limites/un-color.png'));

      expect(result.status).toBe('no_concluyente');
      expect(result.indicators.anomaly_score).toBeNull();
      expect(result.limitations).toContain('Muestra insuficiente');
    });

    it('una imagen con pocos pixeles no alcanza para concluir', async () => {
      const side = Math.floor(Math.sqrt(MIN_WINDOW_SAMPLES)) - 1;

      const result = await analyzeBuffer(buildRgbPng(side, side));

      expect(result.status).toBe('no_concluyente');
      expect(result.indicators.estimated_payload_rate).toBeNull();
    });

    it('una imagen con todos sus valores pares no se confunde con una insercion', async () => {
      const result = await analyzeBuffer(
        buildRgbPng(128, 128, (x, y) => [
          (x * 2) & 0xfe,
          (y * 2) & 0xfe,
          (x + y) & 0xfe,
        ]),
      );

      expect(result.status).not.toBe('sospechoso');
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
        method:
          'chi_square_westfeld_pfitzmann+sample_pair_analysis+lsb_plaintext',
        anomaly_score: expect.any(Number),
        threshold: SUSPICIOUS_THRESHOLD,
        lower_threshold: CLEAN_THRESHOLD,
        estimated_payload_rate: expect.any(Number),
        payload_rate_threshold: PAYLOAD_RATE_THRESHOLD,
        max_prefix_payload_rate: expect.any(Number),
        prefix_payload_rate_threshold: expect.any(Number),
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
        payload_rate: expect.any(Number),
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

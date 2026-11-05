import {
  createClassCounts,
  estimatePayloadRate,
  PAIR_CLASSES,
} from './sample-pairs';

const SAME_GROUP = 1;
const KIND_X = 2;
const KIND_Y = 4;

const classOf = (u: number, v: number) => PAIR_CLASSES[(u << 8) | v];

// Arma los contadores: x e y fuera del mismo grupo, mas pares iguales del mismo grupo.
const countsOf = (x: number, y: number, equal: number) => {
  const counts = createClassCounts();
  counts[KIND_X] = x;
  counts[KIND_Y] = y;
  counts[SAME_GROUP] = equal;
  return counts;
};

describe('analisis de pares de muestras', () => {
  it('clasifica cada par segun el orden y la paridad del segundo valor', () => {
    // v par y u < v, o v impar y u > v: X. Lo contrario: Y.
    expect(classOf(3, 4) & KIND_X).toBe(KIND_X);
    expect(classOf(6, 5) & KIND_X).toBe(KIND_X);
    expect(classOf(5, 4) & KIND_Y).toBe(KIND_Y);
    expect(classOf(4, 5) & KIND_Y).toBe(KIND_Y);
  });

  it('marca los pares del mismo grupo y no clasifica los valores iguales', () => {
    expect(classOf(4, 5) & SAME_GROUP).toBe(SAME_GROUP);
    expect(classOf(3, 4) & SAME_GROUP).toBe(0);
    expect(classOf(7, 7)).toBe(SAME_GROUP);
  });

  it('cubre todos los pares posibles', () => {
    expect(PAIR_CLASSES.length).toBe(65536);
    expect(classOf(0, 0)).toBe(SAME_GROUP);
    expect(classOf(255, 255)).toBe(SAME_GROUP);
    expect(classOf(0, 255) & KIND_X).toBe(0);
    expect(classOf(255, 0) & KIND_Y).toBe(KIND_Y);
  });

  it('da una carga nula cuando X e Y son iguales', () => {
    expect(estimatePayloadRate(countsOf(300, 300, 400))).toBeCloseTo(0, 10);
  });

  it('resuelve la ecuacion cuadratica con la raiz menor', () => {
    // Con 300 X, 375 Y y 200 iguales: 100 p^2 - 275 p + 75 = 0, con raices 0.3 y 2.45.
    const rate = estimatePayloadRate(countsOf(300, 375, 200));

    expect(rate).toBeCloseTo(
      (275 - Math.sqrt(275 ** 2 - 4 * 100 * 75)) / 200,
      10,
    );
  });

  it('se mantiene entre 0 y 1', () => {
    expect(estimatePayloadRate(countsOf(90, 10, 10))).toBe(0);

    // Sin raices reales usa el vertice de la parabola.
    const counts = createClassCounts();
    counts[SAME_GROUP | KIND_Y] = 100;
    expect(estimatePayloadRate(counts)).toBe(1);
  });

  it('no divide entre cero sin pares del mismo grupo', () => {
    expect(estimatePayloadRate(createClassCounts())).toBe(0);
  });
});

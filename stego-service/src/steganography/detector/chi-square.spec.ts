import { chiSquareSurvival } from './chi-square';

describe('chiSquareSurvival', () => {
  // Valores de las tablas de la distribucion chi-cuadrado.
  it.each([
    [3.841459, 1, 0.05],
    [6.634897, 1, 0.01],
    [18.307, 10, 0.05],
    [2.558, 10, 0.99],
    [124.342, 100, 0.05],
    [77.929, 100, 0.95],
  ])(
    'chi2=%f con %i grados de libertad da %f',
    (statistic, degrees, expected) => {
      expect(chiSquareSurvival(statistic, degrees)).toBeCloseTo(expected, 3);
    },
  );

  it('devuelve 1 con un estadistico nulo', () => {
    expect(chiSquareSurvival(0, 5)).toBe(1);
  });

  it('tiende a 0 con un estadistico enorme, sin devolver NaN', () => {
    expect(chiSquareSurvival(1e7, 127)).toBe(0);
  });

  it('disminuye a medida que crece el estadistico', () => {
    const values = [10, 50, 100, 150, 200].map((statistic) =>
      chiSquareSurvival(statistic, 127),
    );

    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

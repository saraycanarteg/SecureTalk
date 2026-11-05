const MAX_ITERATIONS = 1000;
const EPSILON = 3e-14;
const MIN_POSITIVE = 1e-300;

const LANCZOS = [
  76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
  1.208650973866179e-3, -5.395239384953e-6,
];

function logGamma(x: number): number {
  const shifted = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  const series = LANCZOS.reduce(
    (sum, coefficient, i) => sum + coefficient / (x + i + 1),
    1.000000000190015,
  );
  return -shifted + Math.log((2.506628274631 * series) / x);
}

// Serie de la funcion gamma incompleta inferior regularizada P(a, x), para x < a + 1.
function lowerGammaSeries(a: number, x: number): number {
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n <= MAX_ITERATIONS; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * EPSILON) {
      break;
    }
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

// Fraccion continua de la funcion gamma incompleta superior regularizada Q(a, x), para x >= a + 1.
function upperGammaFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / MIN_POSITIVE;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < MIN_POSITIVE) {
      d = MIN_POSITIVE;
    }
    c = b + an / c;
    if (Math.abs(c) < MIN_POSITIVE) {
      c = MIN_POSITIVE;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) {
      break;
    }
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

// Probabilidad de obtener un valor igual o mayor en una distribucion chi-cuadrado.
export function chiSquareSurvival(statistic: number, degrees: number): number {
  if (statistic <= 0) {
    return 1;
  }
  const a = degrees / 2;
  const x = statistic / 2;
  return x < a + 1 ? 1 - lowerGammaSeries(a, x) : upperGammaFraction(a, x);
}

const SAME_GROUP = 1;
const KIND_X = 2;
const KIND_Y = 4;
const CLASS_COUNT = 8;

// Clasifica un par de muestras vecinas (u, v). En una imagen natural X e Y son casi iguales;
// al reemplazar los LSB esa igualdad se rompe en una medida que depende de la carga.
function classifyPair(u: number, v: number): number {
  const group = u >> 1 === v >> 1 ? SAME_GROUP : 0;
  if (u === v) {
    return group;
  }
  return group | (((v & 1) === 0 ? u < v : u > v) ? KIND_X : KIND_Y);
}

// Clase de cada par posible, indexada por (u << 8) | v. Una imagen puede tener decenas de
// millones de pares: consultar una tabla evita comparar y ramificar en cada uno.
export const PAIR_CLASSES = Uint8Array.from({ length: 65536 }, (_, index) =>
  classifyPair(index >> 8, index & 0xff),
);

export const createClassCounts = () => new Uint32Array(CLASS_COUNT);

// Analisis de pares de muestras de Dumitrescu, Wu y Wang: la proporcion de muestras usadas
// por el mensaje es la raiz menor de (sameGroup / 2) p^2 + (2x - total) p + (y - x) = 0.
export function estimatePayloadRate(classCounts: Uint32Array): number {
  let total = 0;
  let sameGroup = 0;
  let x = 0;
  let y = 0;
  for (let pairClass = 0; pairClass < CLASS_COUNT; pairClass++) {
    const count = classCounts[pairClass];
    total += count;
    sameGroup += pairClass & SAME_GROUP ? count : 0;
    x += pairClass & KIND_X ? count : 0;
    y += pairClass & KIND_Y ? count : 0;
  }

  const a = sameGroup / 2;
  if (a === 0) {
    return 0;
  }
  const b = 2 * x - total;
  const c = y - x;
  const discriminant = b * b - 4 * a * c;
  const root =
    discriminant < 0 ? -b / (2 * a) : (-b - Math.sqrt(discriminant)) / (2 * a);
  return Math.max(0, Math.min(1, root));
}

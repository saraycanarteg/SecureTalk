# Análisis esteganográfico de STEGO

STEGO busca indicios de datos ocultos en el bit menos significativo (LSB) de imágenes PNG y BMP. El resultado es **indicativo**: `sospechoso` significa que la imagen presenta un patrón compatible con una inserción LSB, no que contenga un mensaje.

## Método

Se combinan tres análisis, porque cada uno cubre lo que los otros no ven:

| Análisis | Qué detecta | `evidence` |
|---|---|---|
| Chi-cuadrado de Westfeld y Pfitzmann [1] | Pares de valores igualados por una inserción de alta densidad | `chi_square` |
| Pares de muestras (SPA) de Dumitrescu, Wu y Wang [2] | Inserciones dispersas o parciales, y además estima su tamaño | `sample_pairs` |
| Texto en claro en los primeros LSB | Mensajes cortos sin cifrar, que las estadísticas no alcanzan a ver | `lsb_plaintext` |

### Chi-cuadrado

Reemplazar los LSB cambia cada valor solo dentro de su par `(2k, 2k+1)`, así que una inserción tiende a igualar las frecuencias de los dos valores de cada par. Para cada canal de color:

```
S = Σ (n_2k - m_k · r)² / (m_k · r)        m_k = n_2k + n_(2k+1)
p = P(χ²_(K-1) ≥ S)
```

| Símbolo | Significado |
|---|---|
| `n_2k` | Veces que aparece el valor par del par `k` |
| `m_k` | Muestras del par `k` |
| `r` | Proporción observada de valores pares, limitada a [1/3, 2/3] |
| `K` | Pares con al menos 5 muestras esperadas |

Un `p` cercano a 1 indica pares igualados. La suma solo recorre el valor par de cada par y, tras una inserción con `r = 1/2`, cada término vale en promedio 1/2. Por eso `S` queda alrededor de `(K-1)/2` y `p` se acerca a 1. Es propio del método, no una prueba de hipótesis que "confirme" un mensaje.

Se usa `r` observada en lugar de 1/2 porque un mensaje sin cifrar no tiene bits equilibrados: con 1/2, el método no detectó texto plano en ninguna de las 48 imágenes medidas.

### Pares de muestras

Se recorren los pares de muestras vecinas `(u, v)`, en horizontal y en vertical:

- **X:** `v` par y `u < v`, o `v` impar y `u > v`.
- **Y:** `v` par y `u > v`, o `v` impar y `u < v`.

En una imagen natural X e Y son casi iguales, y al reemplazar LSB esa igualdad se rompe en una medida que depende de la carga. La proporción de muestras usadas por el mensaje, `p`, es la raíz menor de:

```
(C / 2) · p² + (2X - N) · p + (Y - X) = 0
```

`C` son los pares con `⌊u/2⌋ = ⌊v/2⌋` y `N` el total. El resultado es `estimated_payload_rate`, la media de los canales de color.

El método estima bien la carga real: con 10 %, 25 % y 50 % de capacidad en posiciones al azar, la mediana medida en 48 imágenes fue 0.102, 0.252 y 0.504.

Se calcula sobre toda la imagen y también sobre su inicio (1/64, 1/32, 1/16, 1/8, 1/4 y 1/2 de los píxeles), porque un mensaje corto insertado en orden solo se nota en la parte que ocupa. El indicador `max_prefix_payload_rate` informa la porción más cercana a su propio umbral.

### Texto en claro

Muchas herramientas escriben el mensaje sin cifrar al inicio de la imagen. Se leen los primeros 128 bytes de LSB en varios órdenes (RGB en el orden visible, canales en el orden del archivo y cada canal por separado, con cada byte en los dos sentidos) y se busca la mayor racha de texto legible, admitiendo una cabecera binaria antes del mensaje.

Una racha cuenta si tiene al menos 6 símbolos distintos y un 70 % de letras, dígitos y espacios. Las letras del español en UTF-8 cuentan como un carácter.

El servicio **nunca devuelve ni registra el texto**: solo informa la longitud de la racha en `plaintext_run`.

### Recorrido de la imagen

- **Canal alfa:** queda fuera. Si es constante fija un bit de cada byte, y eso hace que datos sin mensaje parezcan texto: fue un falso positivo real durante la calibración.
- **BMP:** se analiza desde los dos extremos. Una herramienta que escribe sobre el archivo empieza por la fila inferior, y una que trabaja con la imagen decodificada, por la primera fila visible.

## Clasificación y política

Se aplica la primera condición que se cumpla:

| Condición | `status` | `action` | Archivo |
|---|---|---|---|
| Pares de muestras supera su umbral, o racha de texto de 16 caracteres o más | `sospechoso` | `cuarentena` | Se mueve a la carpeta aislada |
| Muestras insuficientes o variante no analizable | `no_concluyente` | `advertencia` | Se elimina |
| Chi-cuadrado ≥ 0.95 sin respaldo de pares de muestras | `no_concluyente` | `advertencia` | Se elimina |
| Chi-cuadrado entre 0.05 y 0.95, o carga estimada ≥ 0.05 | `no_concluyente` | `advertencia` | Se elimina |
| Todo lo demás | `sin_indicios` | `ninguna` | Se elimina |
| Falla el análisis | `error` | `rechazo` | Se elimina |

Chi-cuadrado no basta por sí solo para `sospechoso`: un degradado digital tiene pares iguales sin ningún mensaje. Cuando los dos análisis coinciden, `evidence` incluye ambos.

El archivo nunca se ejecuta ni se publica por HTTP. En cuarentena conserva su nombre aleatorio sin extensión, en una carpeta con permisos `0700` y con permisos de archivo `0400`.

### Parámetros

| Parámetro | Valor | Justificación |
|---|---|---|
| Carga estimada sospechosa | 0.08 | Máximo medido en imágenes sin carga: 0.058. Detecta la inserción dispersa al 10 % en 48 de 48 |
| Carga en una porción inicial | 0.15 | Máximo medido en imágenes sin carga: 0.073 |
| Ajuste por tamaño | Con menos de 150 000 píxeles, el umbral crece como `0.08 · √(150000 / n)` | El error de la estimación crece como 1/√n. Sin este ajuste, los gráficos pequeños daban más falsos positivos |
| Carga sin indicios | 0.05 | Lo que queda entre 0.05 y el umbral es `no_concluyente` |
| Chi-cuadrado | 0.95 y 0.05 | Niveles habituales. El rango medio no fuerza una decisión |
| Racha de texto | 16 caracteres | Máximo medido en imágenes sin carga: 11 |
| Muestras mínimas por medición | 4096 (64×64 px) | Con menos, la estadística no es fiable |

### Límites de procesamiento

Se aplican antes de analizar. El archivo rechazado no se guarda ni genera un registro de análisis.

| Comprobación | Límite | Respuesta |
|---|---|---|
| Tamaño del archivo | 10 MB | 413 |
| Píxeles declarados, antes de descomprimir | 16 millones | 413 |
| Datos descomprimidos | El tamaño exacto que indica la cabecera; más datos detienen la descompresión | 400 |
| Extensión, tipo de contenido o firma real | Solo PNG y BMP, y deben coincidir entre sí | 415 |
| Archivo vacío, truncado, con CRC incorrecto, datos dañados o contenido tras el final de la imagen | No admitido | 400 |

## Resultados

Los valores son reales y se reproducen con los comandos de la última sección.

### T09: muestras de `/samples`

Escena sintética de 512×384 px generada por `scripts/generate-stego-samples.mjs`. χ² y LSB en 1 corresponden al canal R.

| Muestra | `anomaly_score` | Carga estimada | Inicio / umbral | Racha | χ² | LSB en 1 | `status` | `evidence` |
|---|---|---|---|---|---|---|---|---|
| `original.png` | 0.000168 | 0.0043 | 0.009 / 0.15 | 0 | 147.88 | 0.5001 | `sin_indicios` | - |
| `original.bmp` | 0.000749 | 0.0048 | 0.014 / 0.15 | 0 | 147.88 | 0.5001 | `sin_indicios` | - |
| `lsb-100.png` | 0.999993 | 0.9992 | 0.986 / 0.15 | 7 | 31.47 | 0.4994 | `sospechoso` | `sample_pairs`, `chi_square` |
| `lsb-100.bmp` | 0.999966 | 0.9814 | 0.998 / 0.15 | 0 | 28.66 | 0.4987 | `sospechoso` | `sample_pairs`, `chi_square` |
| `lsb-25.png` | 0.996274 | 0.2299 | 0.967 / 0.15 | 7 | 139.27 | 0.4990 | `sospechoso` | `sample_pairs`, `chi_square` |
| `lsb-texto-plano-25.png` | 0.999957 | 0.1876 | 0.600 / 0.15 | 128 | 264.87 | 0.4889 | `sospechoso` | las tres |
| `lsb-disperso-10.png` | 0.001349 | 0.1007 | 0.114 / 0.15 | 7 | 118.28 | 0.4999 | `sospechoso` | `sample_pairs` |
| `lsb-2.png` | 0.014470 | 0.0192 | 0.545 / 0.395 | 7 | 131.14 | 0.5001 | `sospechoso` | `sample_pairs` |
| `lsb-texto-corto.png` | 0.000143 | 0.0045 | 0.010 / 0.15 | 32 | 148.42 | 0.5001 | `sospechoso` | `lsb_plaintext` |
| `lsb-disperso-3.png` | 0.000360 | 0.0320 | 0.036 / 0.15 | 0 | 137.94 | 0.5002 | `sin_indicios` | - |
| `limites/degradado.png` | 1 | 0.0039 | 0.004 / 0.171 | 0 | 0 | 0.5000 | `no_concluyente` | - |

Lecturas para la sustentación:

- **Original frente a carga completa:** χ² cae de 147.88 a 31.47, y la carga estimada sube de 0.004 a 0.999.
- **La carga estimada se acerca a la real:** 0.23 para 25 % y 0.10 para 10 %.
- **`lsb-disperso-10.png`:** chi-cuadrado no lo ve (0.0013), pero pares de muestras sí. Por eso se usan los dos.
- **`lsb-texto-corto.png`:** ninguna estadística lo ve. Son solo 32 bytes en toda la imagen, y lo delata la racha de texto.
- **`limites/degradado.png`:** chi-cuadrado da 1, pero pares de muestras da 0.004. No se marca como sospechoso.
- **La proporción de LSB no sirve para decidir:** vale cerca de 0.50 con y sin mensaje. Se informa, pero no interviene.
- **`lsb-disperso-3.png` es un fallo real:** tiene un mensaje y sale `sin_indicios`. Por eso `sin_indicios` no garantiza que una imagen esté limpia.

### Calibración con imágenes reales

Se usaron 24 fondos de pantalla de Windows, en formato JPEG, convertidos a PNG a 1024, 512 y 256 px de ancho. Se desconoce si contienen mensajes, y no son fotografías de cámara sin procesar. La carga se insertó en copias temporales que no forman parte del repositorio.

| Variante | 48 imágenes de 1024 y 512 px | 24 imágenes de 256 px |
|---|---|---|
| | `sospechoso` / `no_concluyente` / `sin_indicios` | `sospechoso` / `no_concluyente` / `sin_indicios` |
| **Original, sin carga insertada** | **0** / 14 / 34 | **0** / 16 / 8 |
| Secuencial cifrada, 100 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Secuencial cifrada, 25 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Secuencial cifrada, 10 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Secuencial cifrada, 5 % | 48 / 0 / 0 | 1 / 19 / 4 |
| Secuencial cifrada, 2 % | 38 / 4 / 6 | 0 / 18 / 6 |
| Secuencial cifrada, 1 % | 24 / 13 / 11 | 0 / 17 / 7 |
| Texto plano, 100 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Texto plano, 25 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Texto corto, 30 bytes | 48 / 0 / 0 | 24 / 0 / 0 |
| Dispersa cifrada, 100 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Dispersa cifrada, 50 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Dispersa cifrada, 25 % | 48 / 0 / 0 | 24 / 0 / 0 |
| Dispersa cifrada, 10 % | 48 / 0 / 0 | 1 / 23 / 0 |
| Dispersa cifrada, 5 % | 10 / 27 / 11 | 0 / 22 / 2 |

Las imágenes pequeñas tienden a `no_concluyente`: con pocos píxeles el servicio exige más evidencia antes de marcar algo como sospechoso.

### Herramientas reales

Se insertaron mensajes con herramientas de terceros en 9 imágenes, dentro de un contenedor desechable. Los mensajes de texto fueron de 29, 47 (con tildes y eñe) y unos 550 caracteres.

| Herramienta | Carga | `sospechoso` | `no_concluyente` | `sin_indicios` | `evidence` |
|---|---|---|---|---|---|
| `stegano` (`lsb.hide`) | Tres mensajes de texto | **27 / 27** | 0 | 0 | `lsb_plaintext` |
| `stego-lsb` | Tres mensajes de texto | **27 / 27** | 0 | 0 | `lsb_plaintext` |
| `stego-lsb` | Bytes aleatorios, 25 % | **9 / 9** | 0 | 0 | `sample_pairs`, `chi_square` |
| `steghide` | 2 KB, 10 % y 25 % | **0 / 27** | 5 | 22 | - |
| Misma imagen BMP, sin carga | Ninguna | 0 / 9 | 1 | 8 | - |

`steghide` no se detecta, y es una limitación esperable: no reemplaza LSB, sino que intercambia valores entre píxeles para conservar las estadísticas de la imagen. Los análisis de STEGO están diseñados para inserción por reemplazo de LSB.

### Falsos positivos en gráficos

Se analizaron 700 PNG y BMP del sistema (iconos, miniaturas y recursos de aplicaciones), sin carga conocida y con al menos 16 384 píxeles.

| `sospechoso` | `no_concluyente` | `sin_indicios` |
|---|---|---|
| 13 (1.9 %) | 54 | 633 |

Los 13 son gráficos generados por computadora, en su mayoría miniaturas y fondos con patrones, donde se rompe el supuesto de que X e Y son iguales. Ninguno fue por texto en claro.

**Tamaño de la muestra:** estas cifras orientan los parámetros, pero no son tasas de error generales.

## Limitaciones

Medidas en este proyecto:

- **Técnicas que conservan las estadísticas:** `steghide` no se detecta (0 de 27), como tampoco se espera detectar otras que no sean reemplazo de LSB, como LSB *matching*.
- **Cargas muy pequeñas:** en imágenes de 1024 y 512 px, una carga dispersa del 5 % se detecta en 10 de 48. Un mensaje cifrado del 1 % en orden se detecta en 24 de 48.
- **Mensajes cifrados muy cortos:** sin texto legible ni carga suficiente para las estadísticas, no se detectan.
- **Texto muy corto:** por debajo de 16 caracteres, la señal de texto no se activa.
- **Imágenes pequeñas:** suelen dar `no_concluyente`. A 256 px, la carga dispersa del 10 % casi nunca llega a `sospechoso`.
- **Falsos positivos:** 1.9 % en gráficos generados por computadora y ninguno en las imágenes tipo fotografía medidas.

Por diseño de la técnica:

- Solo se analiza el LSB de los canales de color, no el canal alfa ni otras capas de bits.
- **Variantes no analizables:** PNG con paleta, de 1, 2, 4 o 16 bits, o entrelazado, y BMP de paleta, 16 bits, comprimido o con `BITFIELDS`. Se validan y dan `no_concluyente` con el motivo.
- **Otros lugares donde ocultar datos:** los metadatos PNG (`tEXt`, `zTXt`, `iTXt`) y los fotogramas adicionales de APNG no se analizan. Los datos anexados tras el final de la imagen se rechazan con 400.
- **Formatos con pérdida:** JPEG y similares no se admiten. La técnica requiere PNG o BMP sin pérdida, y recomprimir una imagen destruye una carga LSB.
- **Alcance del resultado:** estima el tamaño de la carga, pero no extrae el mensaje ni identifica la herramienta usada.

## Cómo reproducir

```bash
# Muestras: producen siempre los mismos bytes
node scripts/generate-stego-samples.mjs

# Pruebas: T09 está en test/stego-detection.e2e-spec.ts; T10 y T12, en test/stego.e2e-spec.ts
docker compose -f docker-compose.test.yml up -d --wait stego-db-test
cd stego-service
npm ci
npm test
npm run test:e2e
npm run build

# Calibración, en Windows. Requiere los fondos de C:\Windows\Web
cd ..
powershell -File docs/evidencias/calibracion/convertir-fondos.ps1
node docs/evidencias/calibracion/medir.cjs docs/evidencias/calibracion/corpus

# Herramientas reales: ver docs/evidencias/herramientas/
```

## Referencias

[1] Westfeld, A., y Pfitzmann, A. (2000). Attacks on Steganographic Systems: Breaking the Steganographic Utilities EzStego, Jsteg, Steganos, and S-Tools, and Some Lessons Learned. En *Information Hiding* (LNCS 1768, pp. 61-76). Springer.

[2] Dumitrescu, S., Wu, X., y Wang, Z. (2003). Detection of LSB Steganography via Sample Pair Analysis. *IEEE Transactions on Signal Processing*, 51(7), 1995-2007.

[3] OWASP Foundation. (s. f.). *File Upload Cheat Sheet*. https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

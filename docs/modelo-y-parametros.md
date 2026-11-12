# Modelo de cálculo · GeoFlujo Agro

## Propósito y límites

La calculadora compara configuraciones de transporte y manipulación **para un único producto fresco** (Mango Tommy en el piloto). No calcula precios de venta, utilidades, calidad físico-química, vida útil restante, capacidad de centros de acopio ni cumplimiento sanitario o fitosanitario. No es un optimizador de rutas ni representa por ahora una red multiproductor. El objetivo es **costear recorridos definidos por el usuario**.

Se revisaron el borrador conceptual de escenarios logísticos suministrado y el libro `Modelo_Inicial_Calculadora_Escenarios_Logisticos_Agropecuarios_revision(1).xlsx`. El libro de referencia usa 9 pestañas (`00_Tablero`, `01_Guia`, `02_Productos`, `03_Estados_Mercados`, `04_Parametros`, `05_Escenarios`, `06_Calculo`, `07_Resultados`, `08_Fuentes`). **El MVP no reproduce toda la complejidad del libro**.

## Datos solicitados (mínimos)

| Campo | Unidad | Quién lo ingresa | Cómo se usa |
|---|---|---|---|
| Producto | Catálogo | Selección (piloto fijo) | Selecciona los parámetros pertinentes |
| Cantidad despachada | kg | Usuario | Masa inicial y tamaño de flota |
| Origen | coordenadas | Mapa o arrastre | Extremo inicial del trazado |
| Destino | coordenadas | Mapa o arrastre | Extremo final del trazado |
| Centro intermedio | coordenadas | Mapa, opcional | Añade un tramo y operaciones |
| Vehículo | catálogo | Usuario | Capacidad en kg, costo por km |
| Canal | directo o mayorista | Usuario | Selecciona tasa de pérdida de referencia |
| Método de transporte | km o cotización | Usuario | Cálculos excluyentes |
| Peajes por viaje | COP | Usuario | Suma explícita por tramo; **no detectados automáticamente** |

El usuario puede cambiar en «Parámetros técnicos» las tarifas operativas, las tasas de merma, el empaque, la capacidad del vehículo y la tarifa vial. Cada valor se almacena en el navegador y puede transferirse en un archivo JSON.

## Secuencia calculada

**Sin acopio:**

1. Despacho inicial `Q0`.
2. Selección/acondicionamiento opcional a `Q0 × tarifa_sel`.
3. Cargue a `Q0 × tarifa_cargue`.
4. Transporte con `Q0` y número de viajes por capacidad del vehículo.
5. Descargue en destino a `Q0 × tarifa_descargue`.
6. Aplicación de merma comercial `m_m` al recibir: `Q_recibida = Q0 × (1 - m_m)`.

**Con acopio:**

1. Selección y cargue inicial de `Q0`.
2. Transporte origen → acopio con `Q0`.
3. Descargue en acopio y consolidación, cada uno valorado sobre `Q0`.
4. Merma de acopio: `Q1 = Q0 × (1 - m_a)`.
5. Cargue de `Q1` y transporte acopio → destino con `Q1`.
6. Descargue en destino sobre `Q1`.
7. Merma de mercado: `Q_recibida = Q1 × (1 - m_m)`.

Por tanto: `merma_total = Q0 - Q_recibida`, distribuida explícitamente entre acopio y recepción final. El motor verifica `Q0 = recibido + merma_total`.

## Fórmulas

Para cada tramo `j` con masa de entrada `Q_j`:

- Viajes: `N_j = MAX(1, CEIL(Q_j / capacidad_vehiculo_kg))`.
- Tarifa por km: `C_j = N_j × [ D_j × tarifa_km × f_retorno + peajes_j ]` donde `f_retorno = 2` si se solicita retorno vacío y `1` si no.
- Cotización manual: `C_j = N_j × [ cotizacion_j + peajes_j ]`. La cotización **no se multiplica por retorno**.
- Empaque: `C_empaque = CEIL(Q0 / kg_por_canastilla) × COP_por_canastilla`, una sola vez.
- Operaciones: suma de `kg_entrada × COP_por_kg` según la etapa.
- `C_total = SUMA(C_transporte_j) + SUMA(C_operaciones) + C_empaque`.
- `C_kg_recibido = C_total / Q_recibida`.
- `C_kg_despachado = C_total / Q0`.

Se toma el tiempo OSRM de ida por tramo y se suman tiempos de ida; también se registra tiempo-vehículo `SUMA(trips × horas tramo)`. **No se calculan tiempos de carga ni cronogramas de ventanas comerciales todavía**.

## Ruta geográfica

- El usuario hace clic o arrastra un nodo en Leaflet (OpenStreetMap).
- Se consulta OSRM para calcular la geometría, kilómetros y minutos de cada tramo.
- Si OSRM no responde, se utiliza `Haversine × 1,25` y velocidad de 42 km/h **como contingencia no vial**, con línea punteada y advertencia visible.
- El costo por km varía con la distancia de esa ruta calculada, pero una cotización manual no varía automáticamente con la geometría.
- Las coordenadas iniciales de Espinal, Melgar y Tunja son **referencias urbanas didácticas**, no puntos de instalaciones verificadas.
- La aplicación no descubre peajes de forma automática; esa función puede incorporarse después, con reglas para sentido, concesión, categoría y vigencia.

## Caso de control del Excel

Para `Q0=5.500 kg`, una ruta conceptual de `276,934 km`, cotización de transporte `726.932,564 COP`, peajes `132.700 COP` y operaciones de `74 + 25 + 20 COP/kg`:

- Merma directa: `2,44 %` → `Q_recibida=5.365,8 kg`.
- Costo de operaciones: `654.500 COP`.
- Costo transporte y peajes: `859.632,564 COP`.
- Total parcial: `1.514.132,564 COP`.
- Costo por kg recibido: `282,182072... COP/kg`.

La prueba `tests/engine.test.js` verifica estos valores. El mapa en vivo puede devolver **otra distancia**, por lo que para reproducir el costo de referencia se debe seleccionar el método de *cotización manual* en vez de tarifa por km.

## Gestión de fuentes

- `SRC_COSTOS`: archivo de trabajo, no tarifa pública actualizada.
- `SRC_ESC_TOLIMA`: ruta/peajes y caso de calibración del libro.
- `SRC_CAL_LAB_2026`: proxy de mano de obra de selección de 74 COP/kg, no cotización observada.
- `SRC_DANE_MANGO_TUNJA_2019`: referencia histórica de comercio del mango, no merma universal ni indicador actual.
- `SRC_AGROSAVIA_MANGO_2025`: soporte técnico del empaque para mango, con costo de canastilla pendiente.
- `SRC_SUPUESTO`: referencia provisional de merma de 1 % en acopio.

Las fuentes externas futuras (DANE/SIPSA, SICE-TAC, AGROSAVIA, compradores y operadores) se incorporarán como **capas trazables** con fuente, fecha, vigencia y nivel de confianza, no como parámetros actualizados automáticamente sin verificación.

## Riesgos que siguen abiertos

1. El modelo asume que la totalidad de la masa inicial está disponible para despacho y que la merma comercial ocurre en la entrega (en la realidad puede suceder antes).
2. Los peajes se introducen manualmente; un peaje de la ruta directa no debe copiarse automáticamente a la primera milla del acopio.
3. Se limita capacidad del vehículo a kilogramos, sin validar volumen, apilamiento, refrigeración ni restricciones por tipo de vía.
4. Con `N>1` el modelo calcula viajes necesarios y costo total, pero no resuelve su calendarización.
5. La ruta y el precio de transporte no acreditan factibilidad contractual, sanitaria o de acceso a mercados.
6. Los resultados sin empaque monetizado deben rotularse como costos parciales.

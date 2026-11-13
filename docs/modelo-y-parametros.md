# GeoFlujo Mango — modelo de cálculo

## Alcance

La unidad de análisis es un despacho de **mango fresco Tommy Atkins**, listo para salir del origen. Se distingue la cantidad neta de mango del peso de las unidades de empaque. La operación contiene dos nodos (origen y destino), un arco de ida y otro de regreso de toda la flota. El rechazo por deterioro de transporte se registra al recibir el producto, **sin pérdidas de masa en origen**.

## Entradas y restricciones físicas

- Q0: kilogramos netos despachados.
- q: capacidad neta en kg de cada empaque.
- N = techo(Q0/q): unidades enteras de empaque.
- P: peso bruto = Q0 + N × tara por empaque.
- V: volumen exterior = N × largo × ancho × alto.
- La capacidad en empaques por vehículo es el mínimo entre: límite por peso para empaque lleno; límite por volumen útil; posiciones de piso enteras por orientación, multiplicadas por capas permitidas por altura y apilamiento.
- Vehículos = techo(N / empaques admitidos por vehículo). No se supone fraccionamiento físico de empaques.

La cantidad de vehículos en el viaje de regreso es **idéntica** a la de ida. Los embalajes recuperados se distribuyen entre ellos. Si los empaques no son retornables o el usuario elige no recuperarlos, los vehículos siguen regresando.

## Costos en nodos

- Cargue obligatorio = Q0 × tarifa de cargue COP/kg.
- Descargue obligatorio = Q0 × tarifa de descargue COP/kg. Se descarga también la fruta que posteriormente será rechazada.
- Empaque: si su compra está incluida en el precio de la fruta, no se añade de nuevo como adquisición; si es retornable y la compra se costea, se reparte su precio entre los usos estimados. El lavado de los empaques retornados y reposición esperada son conceptos independientes, de acuerdo con la parametrización.
- Almacenamiento opcional = posiciones de estiba × tarifa mensual × días facturables / días de facturación por mes. La aproximación de posiciones se basa en huella exterior y altura de apilamiento.

## Arcos de ida y regreso

El servicio de rutas OSRM devuelve geometrias, km y minutos. Al fallar se calcula una aproximación geodésica explícita. Una estimación recta no acredita la vía ni identifica peajes.

El costo físico por vehículo considera:

1. Combustible calculado con precio ACPM, kilómetros ponderados por porcentaje de terreno plano/ondulado/montañoso, rendimientos por terreno, superficie y factor del vehículo.
2. Mantenimiento y repuestos por km.
3. Llantas por km.
4. Insumos y lubricantes por km.
5. Importe fijo por disponer el vehículo para la operación completa.
6. Costo por las horas de manejo, cargue, descargue y espera que comprometen el vehículo.
7. Equipo de refrigeración, cuando se usa, durante el recorrido de ida, espera y preenfriamiento.
8. Peajes por sentido y categoría.

Se diferencia el combustible de ida con carga de la condición de retorno (vacío o con empaques). Los demás importes se distribuyen por segmento de ida y regreso sin duplicar el cargo fijo por servicio.

El modelo de costos **no aplica descuentos adicionales por distancia**. El costo promedio por km puede bajar porque se distribuye el costo fijo de servicio entre más kilómetros. La función analítica de sensibilidad es F + v × D, o su versión normalizada C(D)/C0 = beta + (1 − beta) × D/D0.

El perfil porcentual del terreno se modifica en la pestaña avanzada y debe sumar 100 %. **No es una inferencia automática de superficie o topografía a partir de la ruta OSRM.** El análisis vial clasifica los costos por el perfil configurado, sin presentar las condiciones como verificadas.

## Peajes

Se cargan estaciones de referencia regional y se identifican por proximidad a la geometría vial OSRM. Se muestran como candidatos, no como cobros confirmados. Las tarifas y el sentido deben revisarse. El usuario puede editar tarifas, excluir peajes en ida o regreso y sustituir su suma por un importe manual.

Si el precio comercial del transporte ya incorpora peajes, estos no se añaden de nuevo. Si incluye regreso, tampoco se añade otro costo atribuible de vuelta, aunque el costo físico calculado permanezca visible.

## Cotización comercial

De manera alternativa al costo generalizado propio, el usuario puede introducir una cotización por vehículo para la ida. El sistema la multiplica por el número de vehículos y registra si incluye peajes y/o retorno. La cotización reemplaza, no se suma al importe técnico de ida.

Los componentes porcentuales del costo generalizado muestran el presupuesto técnico calculado, **no una desagregación real de la contabilidad del transportador** cuando se emplea una cotización externa.

## Rechazo atribuible al transporte

El rechazo es un porcentaje sobre Q0 aplicado al llegar al destino:

- Q_rechazado = Q0 × m / 100.
- Q_aceptado = Q0 − Q_rechazado.
- Costo por kg despachado = costo total / Q0.
- Costo por kg aceptado = costo total / Q_aceptado.

La tasa inicial de 2,3 % es un valor aproximado basado en un estudio académico de cadena frutícola, no una tasa observada para toda ruta de mango Tommy. Es editable. No se usan adicionalmente pérdidas comerciales globales, lo cual evitaría doble conteo.

## Parámetros, fuentes y vigencia

La pestaña advanced.html permite editar cada dimensión, su tarifa y la fuente conceptual de procedencia. Los grupos de referencias abarcan UC Davis para madurez/temperatura, AGROSAVIA para manejo de mango, fichas de fabricante/comercio para canastillas, estudios sobre rendimiento por terreno, referencia regional de peajes y SICE-TAC como marco de costo eficiente.

No se representa el resultado oficial de SICE-TAC ni se certifica circulación en todo tramo vial. Los precios monetarios y consumos iniciales pueden cambiar según proveedor, fecha, vehículo, territorio y contrato.

## Operación de la aplicación

Los parámetros se guardan en almacenamiento local del navegador y se sincronizan entre la pestaña de cálculo y la de edición avanzada. Los modelos completos se pueden exportar o importar en JSON. La herramienta es un sitio estático desplegado en GitHub Pages.

## Interfaz y validaciones de la versión actual

- Los puntos de origen y destino y la cantidad empiezan vacíos. La aplicación no infiere nombres ni utiliza municipios precargados.
- Al escoger lugares se registran coordenadas verificables mediante búsqueda en Colombia, clic o arrastre, y se solicita nombre inverso cuando el servicio esté disponible. Si no lo está, se visualizan las coordenadas.
- El mapa se centra en la Región Central si no hay puntos, en un punto si solamente existe uno, y en el recorrido seleccionado cuando existen dos. Se redimensiona al cambiar del paso 3 al resultado.
- OSRM puede devolver varias alternativas reales; no se fabrican rutas adicionales. Solo la ruta de ida seleccionada entra en el cálculo, mientras el regreso se consulta por separado. Cambiar la ruta recalcula inmediatamente distancia, duración, peajes candidatos y costo logístico.
- Los parámetros avanzados se editan dentro de un panel lateral y se confirman como un conjunto válido. El motor de cálculo permanece separado de la interfaz. El paso actual, las coordenadas y la alternativa elegida se conservan al aplicar los cambios.
- Las nuevas operaciones eliminan la información del despacho, pero mantienen el catálogo técnico personalizado. El panel avanzado permite restaurar sus valores de referencia cuando se desee.
- El diseño usa azul institucional #1C2343 y blanco como paleta dominante; acentos #09A4DE, #0D8944 y #FCC300. Aplica patrones de jerarquía, controles legibles, retroalimentación y movimiento reducido según Apple Human Interface Guidelines, sin usar componentes Apple ni sugerir afiliación.

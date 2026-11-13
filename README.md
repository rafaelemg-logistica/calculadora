# GeoFlujo Mango

Calculadora cartográfica de costos logísticos para **mango fresco**.

**Aplicación:** https://rafaelemg-logistica.github.io/calculadora/

## Flujo guiado

1. Mango: cantidad neta de mango Tommy Atkins despachada (campo vacío al iniciar una operación) y madurez.
2. Preparación: empaque, inclusión de su costo y almacenamiento opcional. El cargue es obligatorio.
3. Recorrido: origen y destino inicialmente vacíos, búsqueda geográfica explícita, marcadores arrastrables, nombres obtenidos por geocodificación inversa y selección de ruta vial cuando existen alternativas.
4. Retorno: regreso de **todos los vehículos** y recuperación de empaques, con control de costos ya incluidos en el servicio.

El resultado presenta mapa de ida y regreso, kilómetros, tiempo, número de vehículos, empaques, rechazo atribuible al transporte al recibir, costos de ida, retorno, peajes, servicios y costo por kg aceptado. Cuando OSRM proporciona rutas alternativas verdaderas, se muestran sus geometrías, distancias, tiempos y costos calculados. Seleccionar una alternativa sustituye el tramo de ida que utiliza el motor.

**Parámetros avanzados** abre un panel lateral integrado. Los cambios se editan sin afectar aún la operación y se confirman con **Aplicar cambios y recalcular**. El panel conserva las respuestas, ubicaciones, ruta seleccionada y paso actual. La vista ocupa toda la pantalla en celulares. El catálogo técnico se gestiona desde `advanced.html?embed=1`, dentro del panel.

## Método de cálculo

- El mango neto despachado no se descuenta antes del transporte.
- Las canastillas se cuentan enteras: cantidad neta / capacidad por empaque, redondeando al entero superior.
- La capacidad del vehículo considera tara, peso bruto, volumen y número máximo de empaques apilados.
- La flota requerida y sus viajes de ida regresan completamente; la cantidad de empaques recuperados se distribuye entre todos los vehículos.
- El combustible se calcula mediante km, precio ACPM, rendimiento por terreno, condición de carga y configuración vehicular. El perfil de terrenos es una aproximación editable y no una clasificación automática OSRM.
- Los demás costos del vehículo son fijos por servicio o variables por km/tiempo. Cuando el transporte es refrigerado se agregan los costos incrementales de su equipo.
- Los peajes se calculan por sentido y categoría, con posibilidad de revisión de las coincidencias geográficas.
- El rechazo se calcula en destino sobre mango neto despachado, sin descontarlo del transporte o descargue.
- El costo de retorno se muestra físicamente aunque el valor contratado ya lo incluya, evitando duplicarlo en el costo atribuible.
- El costo por kg aceptado divide el costo total atribuible entre la cantidad de mango aceptada.

La distancia puede reducir el costo **promedio** por km al repartir el costo fijo, sin que por eso disminuya normalmente el costo total. No se aplica un descuento porcentual adicional por kilometraje.

## Referencias y límites

Las dimensiones iniciales del empaque (60 × 40 × 25 cm, tara 1,9 kg), su capacidad de 20 kg y las condiciones de conservación se apoyan en referencias técnicas/comerciales. La vida útil de canastillas, lavado, repuestos, tiempo vehicular, refrigeración, rechazo y composición del costo son aproximaciones configurables.

Se utiliza SICE-TAC como **referencia metodológica**, sin afirmar que el cálculo propio sea el resultado oficial del sistema ni un flete negociado. Los peajes provienen de una base regional de referencia y su proximidad a la geometría no demuestra el cobro. Las rutas estimadas se diferencian de las viales.

## Estructura

- index.html: asistente paso a paso y resultado cartográfico.
- advanced.html: edición técnica cargada dentro del panel lateral, con confirmación de cambios.
- src/config.js: catálogo de parámetros y fuentes.
- src/mango-engine.js: motor de cantidades, restricciones y costos.
- src/mango-app.js: asistente, mapa y selección interactiva de rutas con recálculo.
- src/advanced.js: edición y sincronización.
- src/routing.js, src/route-choice.js y src/tolls.js: alternativas OSRM, selección de ruta que afecta el cálculo y peajes.
- src/geocode.js: búsqueda de lugares y geocodificación inversa.
- src/hig.css: diseño Apple HIG con colores institucionales RAP-E 2024.
- assets/peajes-region-central.geojson: estaciones de referencia regional.
- docs/modelo-y-parametros.md: ecuaciones y reglas.

Para servir localmente, ejecutar python3 -m http.server 5173 y abrir http://localhost:5173/. El comando npm test ejecuta las verificaciones automáticas. La publicación a GitHub Pages se realiza desde la rama main.

La configuración se guarda localmente y se puede importar/exportar como JSON.

## Licencia

MIT. Este desarrollo abierto no implica aval institucional automático.

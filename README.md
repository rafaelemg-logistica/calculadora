# GeoFlujo Agro — Calculadora cartográfica de escenarios logísticos

**Prototipo independiente para producto fresco.** Permite seleccionar origen, destino y un centro de acopio opcional, trazar recorridos en OpenStreetMap/OSRM y estimar costos, cantidades recibidas y mermas por etapa. El piloto usa **Mango Tommy** y datos de trabajo del archivo Excel suministrado.

## Probar localmente

El proyecto es un sitio estático, no necesita instalar dependencias ni un backend.

```bash
python3 -m http.server 5173
```

Abrir <http://localhost:5173>. Se requiere conexión a Internet para cargar Leaflet, teselas OSM y el servicio OSRM. Si el servidor de rutas no responde, el cálculo utiliza una **estimación explícitamente rotulada**.

Pruebas del motor:

```bash
node --test tests/*.test.js
```

## Primera versión

- Mapa central: clic para ubicar, arrastre para mover los puntos y visualización de tramos.
- Configuraciones: venta directa, mercado mayorista y mayorista con acopio.
- Datos de entrada breves: kg despachados, vehículo, canal, nodos y tipo de costo de transporte.
- Tarifas, mermas y empaques editables en opciones avanzadas.
- Peajes por tramo ingresados manualmente (no detectados automáticamente).
- Resultados: total COP, COP/kg recibido, kg entregados, merma, tiempo/distancia y desglose.
- Comparación directo vs. con acopio usando los mismos parámetros y coordenadas.
- Importación/exportación JSON y almacenamiento local, sin cuentas.

## Archivos principales

- `src/catalog.js`: catálogo y fuentes de parámetros de referencia.
- `src/engine.js`: motor de cálculo determinista.
- `src/routing.js`: distancia y geometría vial, fallback diferenciado.
- `src/app.js`: experiencia cartográfica y formularios.
- `src/styles.css`: interfaz adaptable a escritorio y móvil.
- `tests/engine.test.js`: pruebas del control del Excel y reglas.
- `docs/modelo-y-parametros.md`: fórmulas, secuencia y limitaciones.
- `docs/decisiones.md`: decisiones metodológicas y preguntas.
- `docs/plan-trabajo.md`: fases y tareas pendientes.

## Publicar en GitHub Pages

1. Crear un repositorio nuevo denominado `calculadora` en la cuenta `rafaelemg-logistica` (preferiblemente **público** si se quiere una URL pública).
2. Mantener los archivos y subcarpetas de la aplicación en la raíz de la rama `main`.
3. En **Settings → Pages**, seleccionar **Build and deployment → Source: GitHub Actions**.
4. El workflow `.github/workflows/ci-pages.yml` ejecuta pruebas y publica el sitio al realizar push a `main`.
5. Abrir la URL que indique GitHub Pages, típicamente `https://rafaelemg-logistica.github.io/calculadora/`.

El código se mantiene en `rafaelemg-logistica/calculadora`; la publicación requiere configurar GitHub Pages con origen GitHub Actions.

## Límites y advertencias

- No es una tarifa oficial, cotización comercial ni una plataforma de optimización de red.
- Los costos del libro y su pérdida 2019 **requieren actualización**. La tarifa de acondicionamiento de 74 COP/kg es un **proxy**.
- El empaque tiene costo base de **cero por falta de dato**, por eso se reporta costo **parcial**.
- No se comprueba vida útil, frío, volumen, categorías de peaje, capacidad real del centro de acopio ni requisitos comerciales.
- Los nodos iniciales son referencias urbanas y didácticas, **no infraestructura georreferenciada verificada**.
- El servidor de demostración OSRM y las teselas comunitarias OSM no ofrecen niveles de servicio garantizados; comprobar políticas de uso si se escala a uso intensivo.

## Licencia

MIT. Este desarrollo no implica aval institucional automático de RAP-E Región Central.

# Plan de trabajo · GeoFlujo Agro (producto fresco)

## Etapa 1 · Especificación y trazabilidad

**Estado:** versión inicial construida.

- [x] Definir flujo desde kg despachados hasta kg recibidos.
- [x] Separar geografía, operaciones y resultados.
- [x] Crear catálogo editable de tarifas, capacidades, mermas y empaque.
- [x] Identificar fuentes y carácter provisional de parámetros.
- [ ] Confirmar con actores reglas de merma y costo cotizado.

## Etapa 2 · Aplicación cartográfica mínima

**Estado:** prototipo preparado para instalar/publicar.

- [x] Mapa Leaflet, tres nodos (origen, acopio, destino).
- [x] Origen y destino seleccionables, puntos arrastrables.
- [x] Geometría vial mediante OSRM, con fallback señalizado.
- [x] Costeo por tramo, peajes manuales, operaciones en nodos.
- [x] Indicadores y desglose comprensible.
- [x] Comparación directa vs. con acopio.
- [x] Exportación e importación JSON.
- [x] Pruebas automatizadas del caso del Excel.
- [ ] Publicación en nuevo repositorio GitHub Pages.

## Etapa 3 · Calibración con fuente comprobable

- [ ] Validar tramos, peajes por vehículo y sentidos de cobro.
- [ ] Contrastar costos de transporte con transportadores/SICE-TAC.
- [ ] Confirmar costos y tiempos reales de carga, acondicionamiento y recepción.
- [ ] Parametrizar empaques y volumen utilizable.
- [ ] Diferenciar tasas de pérdida por punto y producto con evidencia.
- [ ] Construir ficha específica de mercado (calidad, lotes, ventanas, requisitos).

## Etapa 4 · Escenarios avanzados

- [ ] Guardar múltiples escenarios y compararlos en un mismo mapa.
- [ ] Integrar varios productores y consolidación de oferta con balance de masa.
- [ ] Añadir restricción volumétrica y disponibilidad de flota.
- [ ] Añadir opciones de carga refrigerada cuando producto/mercado lo requiera.
- [ ] Incorporar costos/tiempos de espera y viajes de retorno observados.
- [ ] Preparar exportación CSV y hoja resumen.

## Criterios para aceptar la primera versión

1. Modificar un nodo cambia la distancia de la ruta y el costo kilométrico cuando OSRM está disponible.
2. Cambiar la cantidad o la capacidad vehicular actualiza viajes y costos.
3. La aplicación distingue acopio y destino, sin duplicar mermas.
4. Los resultados del control del Excel se reproducen con la cotización manual, dentro del redondeo.
5. Una ruta estimada aparece identificada como tal, no como vial real.
6. Los supuestos sin fuente o monetización generan advertencia visible.
7. El código funciona como sitio estático sin claves de API ni servidor propio.

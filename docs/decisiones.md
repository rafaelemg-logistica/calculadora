# Decisiones metodológicas del MVP

| Decisión | Aprobación de trabajo | Consecuencia |
|---|---|---|
| Productor define despacho inicial | Sí | Se estima lo recibido, no el mínimo requerido en destino |
| Producto fresco | Sí | No se incluyen transformaciones ni rendimientos industriales |
| Mapear origen y destino | Sí | La distancia cambia cuando se mueven los puntos |
| Acopio opcional | Sí | Suma descarga, consolidación, nueva carga y merma separada |
| Comparar venta directa y mayorista | Sí, con tasas distintas | No se interpreta como comparación de rentabilidad |
| Vehículo seleccionado por usuario | Sí | No existe optimización automática de flota |
| Transporte por distancia o cotización | Sí, métodos excluyentes | Evita doble conteo de tarifa/km y cotización |
| Peajes por tramo | Manual hasta validación espacial | No se asegura que los peajes de ejemplo coincidan con cada ruta |
| Vida útil/calidad | Fuera del MVP | Resultados de costo no implican factibilidad |
| Volumen del empaque | Fuera del MVP | Número de viajes limitado por peso |
| Almacenamiento de escenarios | Local + JSON | El usuario conserva archivos y no requiere servidor |
| Exportaciones | JSON, fase inicial | CSV / PDF en fase posterior |

## Preguntas de validación con actores

- ¿El dato de entrada más habitual es el **kg despachado** o la **cantidad que exige el comprador**?
- ¿Qué significa exactamente una tarifa de transporte cotizada: incluye peajes, espera, cargue, retorno o solo recorrido?
- ¿Cuál es la unidad relevante del servicio: viaje, tonelada, hora, kilómetro o una combinación?
- ¿En qué eslabón se produce realmente la merma: selección, acopio, transporte o recepción? ¿Se cuenta una sola vez?
- ¿Qué canales usan canastilla retornable y cómo se valora reutilización y recuperación?
- ¿Es viable transportar todo el lote en los vehículos seleccionados considerando **peso, volumen y vía**?
- ¿Cómo varían tiempos de espera y requisitos de recepción entre mercados? ¿Cuáles son obligatorios, no solo costos?
- ¿Qué rutas de primera milla y centros de acopio representan instalaciones y prácticas reales?

Las respuestas modificarán parámetros y reglas; no conviene programar la optimización multiproductor antes de resolverlas.

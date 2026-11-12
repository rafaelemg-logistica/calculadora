/**
 * Parámetros tomados del libro de trabajo suministrado. NO son tarifas
 * vigentes certificadas. Mantener su fuente, estado y fecha al calibrarlos.
 */
export const DEFAULT_PARAMETERS = {
  version: 1,
  product: {
    id: 'P_MANGO', name: 'Mango Tommy (fresco)', unit: 'kg',
    source: '02_Productos del libro inicial', status: 'POR_VALIDAR'
  },
  vehicles: [
    { id: 'V1', tollCategory: 'I', name: 'LUV / pickup', capacityKg: 1300, costPerKm: 958, source: 'SRC_COSTOS' },
    { id: 'V2', tollCategory: 'III', name: 'Camión liviano 2 ejes', capacityKg: 3500, costPerKm: 1817, source: 'SRC_COSTOS' },
    { id: 'V3', tollCategory: 'IV', name: 'Camión C2 mediano', capacityKg: 7000, costPerKm: 2443, source: 'SRC_COSTOS' },
    { id: 'V4', tollCategory: 'V', name: 'Camión C3 doble troque', capacityKg: 14000, costPerKm: 3453, source: 'SRC_COSTOS' },
    { id: 'V5', tollCategory: 'V', name: 'Tractocamión C2S2', capacityKg: 18000, costPerKm: 3786, source: 'SRC_COSTOS' },
    { id: 'V6', tollCategory: 'VI', name: 'Tractocamión C3S2', capacityKg: 30000, costPerKm: 4322, source: 'SRC_COSTOS' }
  ],
  operations: {
    selectionPerKg: { value: 74, source: 'SRC_CAL_LAB_2026', status: 'PROXY' },
    loadingPerKg: { value: 25, source: 'SRC_COSTOS', status: 'POR_VALIDAR' },
    unloadingPerKg: { value: 20, source: 'SRC_COSTOS', status: 'POR_VALIDAR' },
    consolidationPerKg: { value: 35, source: 'SRC_COSTOS', status: 'POR_VALIDAR' }
  },
  losses: {
    direct: { value: 0.0244, source: 'SRC_DANE_MANGO_TUNJA_2019', status: 'SUPUESTO_DE_CANAL' },
    wholesale: { value: 0.0521, source: 'SRC_DANE_MANGO_TUNJA_2019', status: 'HISTORICO' },
    atCenter: { value: 0.01, source: 'SRC_SUPUESTO', status: 'SUPUESTO' }
  },
  packaging: {
    kgPerCrate: 20, crateCost: 0, source: 'SRC_AGROSAVIA_MANGO_2025',
    status: 'COSTO_SIN_VALIDAR'
  },
  routing: {fallbackDistanceMultiplier: 1.25, fallbackSpeedKmh: 42}
};

export const DEFAULT_SCENARIO = {
  version: 1,
  name: 'Espinal → Tunja · mango Tommy',
  dispatchKg: 5500,
  vehicleId: 'V3',
  channel: 'direct', // direct | wholesale
  viaCenter: false,
  applySelection: true,
  includeEmptyReturn: false,
  transportMethod: 'km', // km | quote
  tollMode: 'auto', // auto | manual; candidatos por proximidad a la ruta OSRM
  tollOverrides: {}, // { [idPeaje]: {enabled, rateCOP} }
  quoteIncludesTolls: false, // evita sumar peajes a una cotización integral
  // Tarifa del Excel, solo para reproducir el escenario al seleccionar cotización.
  quotes: [726932.564],
  centerQuotes: [0, 0],
  // Si un tramo se divide al añadir acopio, estos valores deben revisarse.
  tolls: [132700],
  centerTolls: [0, 0],
  nodes: {
    origin: {name: 'Espinal (referencia urbana)', lat: 4.1496, lng: -74.8840},
    center: {name: 'Acopio ilustrativo (Melgar)', lat: 4.2030, lng: -74.6436},
    destination: {name: 'Tunja (referencia urbana)', lat: 5.5353, lng: -73.3678}
  }
};

export const SOURCE_REGISTRY = [
  {id:'SRC_COSTOS', title:'Costos.xlsx, archivo operativo del ejercicio', date:'Sin fecha acreditada', status:'Por actualizar'},
  {id:'SRC_ESC_TOLIMA', title:'Análisis Escenario Prueba Tolima.xlsx', date:'Sin fecha acreditada', status:'Calibración'},
  {id:'SRC_AGROSAVIA_MANGO_2025', title:'AGROSAVIA · manual de cosecha y poscosecha del mango', date:'2025', status:'Revisar aplicabilidad'},
  {id:'SRC_DANE_MANGO_TUNJA_2019', title:'DANE SIPSA · Costos de comercialización del mango Tommy', date:'2019', status:'Referencia histórica'},
  {id:'SRC_CAL_LAB_2026', title:'Cálculo de trabajo · acondicionamiento manual', date:'2026', status:'Proxy no cotizado'},
  {id:'SRC_SUPUESTO', title:'Supuesto del ejercicio metodológico', date:'2026', status:'Sin observación empírica'}
];

export function cloneDefaults() {
  return {parameters: structuredClone(DEFAULT_PARAMETERS), scenario:structuredClone(DEFAULT_SCENARIO)};
}

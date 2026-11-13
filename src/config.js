/**
 * GeoFlujo Mango · configuración inicial de referencia.
 * Las tarifas estimadas no equivalen a cotizaciones ni a resultados oficiales de SICE-TAC.
 */
export const STORAGE_KEY = 'geoflujo-mango-v4';
export const CHANNEL_NAME = 'geoflujo-mango-parametros';
export const INSTANCE_ID = Math.random().toString(36).slice(2);

export const DEFAULTS = {
  schema: 'geoflujo-mango/v4',
  scenario: {
    dispatchKg: null,
    ripeness: 'verde',
    packagingId: 'canastilla',
    packagingIncluded: true,
    storageEnabled: false,
    storageHours: 24,
    vehicleId: 'C2',
    preservation: 'ambiente',
    returnPackaging: true,
    returnShare: 1,
    returnIncluded: false,
    origin: {name:'',lat:null,lng:null},
    destination: {name:'',lat:null,lng:null}
  },
  parameters: {
    product: {variety:'Tommy Atkins',humidityPct:92,
      temperature:{verde:13,pinton:11,maduro:10},rejectPct:2.3},
    packaging: [
      {id:'canastilla',name:'Canastilla plástica ventilada',capacityKg:20,
       tareKg:1.9,lengthM:.60,widthM:.40,heightM:.25,maxStack:10,
       purchaseCOP:20208,cycles:100,washingCOP:500,replacementPct:0.5,returnable:true,
       reference:'AGROSAVIA / Viplast / referencia comercial Estra'},
      {id:'caja',name:'Caja de cartón para fruta',capacityKg:20,
       tareKg:1.1,lengthM:.60,widthM:.40,heightM:.25,maxStack:7,
       purchaseCOP:4500,cycles:1,washingCOP:0,replacementPct:0,returnable:false,
       reference:'Estimación de cálculo, ajustable'}
    ],
    vehicles: [
      {id:'LIV',name:'Camión liviano · furgón',payloadKg:3500,volumeM3:18,
       lengthM:4.2,widthM:2.05,heightM:2.1,tollCategory:'II',costFactor:.82,
       coldCapable:true,coldFuelLh:.9,coldEquipmentCOPH:2600},
      {id:'C2',name:'Camión C2 · mediano',payloadKg:7000,volumeM3:34,
       lengthM:5.8,widthM:2.3,heightM:2.5,tollCategory:'IV',costFactor:1,
       coldCapable:true,coldFuelLh:1,coldEquipmentCOPH:3000},
      {id:'C3',name:'Camión C3 · doble troque',payloadKg:14000,volumeM3:50,
       lengthM:7.6,widthM:2.4,heightM:2.65,tollCategory:'V',costFactor:1.48,
       coldCapable:true,coldFuelLh:1.5,coldEquipmentCOPH:4300},
      {id:'TRACTO',name:'Tractocamión · semirremolque',payloadKg:30000,volumeM3:67,
       lengthM:12.5,widthM:2.4,heightM:2.55,tollCategory:'VI',costFactor:2,
       coldCapable:true,coldFuelLh:1.8,coldEquipmentCOPH:5200}
    ],
    nodeCosts: {loadingPerKg:25,unloadingPerKg:20,loadingHours:1.5,
      unloadingHours:1.5,waitingHours:0.5,
      dryStorageCOPPerPalletMonth:35000,coldStorageCOPPerPalletMonth:80000,
      palletFootprintM2:1.2,storageBillingDaysPerMonth:30},
    transport: {
      dieselCOPPerGallon:11616,
      baseFuelKmPerGallon:{flat:12.7,rolling:10.1,mountain:7.81},
      terrainMix:{flat:.5,rolling:.3,mountain:.2},
      roadSurface:'pavimentada',surfaceFuelFactor:{pavimentada:1,afirmada:1.2},
      repairsCOPPerKm:350,tiresCOPPerKm:200,lubricantsCOPPerKm:100,
      serviceFixedCOP:100000,vehicleTimeCOPPerH:17000,
      routeMultiplier:1,
      refrigeratedPreCoolH:1,
      fallbackDistanceMultiplier:1.25,fallbackSpeedKmh:42,
      tollMode:'auto',manualTollOutbound:0,manualTollReturn:0,
      tollOverrides:{},
      allowQuote:false,quoteCOP:0,quoteIncludesTolls:false,quoteIncludesReturn:false
    }
  }
};

export const PARAMETER_SOURCES = [
  ['Mango / conservación','UC Davis Postharvest: temperaturas según madurez, humedad relativa 90–95 %','Referencia técnica'],
  ['Empaque / 20 kg','Manual AGROSAVIA y RAP-E sobre manejo del mango','Referencia técnica'],
  ['Empaque / medidas y tara','Ficha de canastilla Viplast 60 × 40 × 25 cm y 1,9 kg','Referencia de fabricante'],
  ['Empaque / adquisición','Referencia comercial Estra 2026; ciclos, lavado y reposición estimados','Mixta'],
  ['Vehículos / capacidades','Capacidades y dimensiones configurables para cálculo de ocupación','Estimación del modelo'],
  ['Transporte / combustible','Rendimientos por terreno de referencia histórica, ajustables por vehículo','Estimación del modelo'],
  ['ACPM / Bogotá','Referencia de precio publicado octubre-noviembre de 2026: COP 11.616/galón','Referencia de mercado'],
  ['Transporte / otros costos','Mantenimiento, llantas, lubricantes, tiempo y disposición: estimaciones explícitas','Estimación del modelo'],
  ['Refrigeración','Consumo de equipo y tarifa horaria ajustados por configuración; validar con proveedor','Estimación del modelo'],
  ['Rechazo / transporte','2,3 %: aproximación basada en estudio académico de cadena frutícola, no medición de un trayecto','Estimación del modelo'],
  ['Peajes / mapa','Base de referencia regional desde GeoFlujo; proximidad a geometría OSRM','Referencia cartográfica'],
  ['SICE-TAC','Marco metodológico de costo eficiente, sin equivaler a tarifa oficial calculada en la app','Referencia metodológica']
];

const clone=x=>JSON.parse(JSON.stringify(x));
export function defaults(){return clone(DEFAULTS);}
export function validCoordinates(p){
 return Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)
   &&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
}
export function readyToCalculate(s){
 return Number.isFinite(s?.scenario?.dispatchKg)&&s.scenario.dispatchKg>0
  &&validCoordinates(s.scenario.origin)&&validCoordinates(s.scenario.destination);
}
export function validateState(s){
 const dispatch=s?.scenario?.dispatchKg;
 const quantityValid=dispatch===null||(Number.isFinite(dispatch)&&dispatch>0);
 const pt=p=>p&&typeof p.name==='string'
   &&((p.lat===null&&p.lng===null)||validCoordinates(p));
 return Boolean(s?.schema==='geoflujo-mango/v4'
  &&quantityValid&&pt(s.scenario?.origin)&&pt(s.scenario?.destination)
  &&Array.isArray(s.parameters?.vehicles)&&Array.isArray(s.parameters?.packaging)
  &&!!s.parameters?.transport&&!!s.parameters?.product);
}
/**
 * Validación numérica del catálogo antes de aplicar un cambio avanzado.
 * Rechaza NaN, dimensiones nulas, tasas incoherentes y mezcla vial sin normalizar.
 */
export function validateParameters(p){
 if(!p||!Array.isArray(p.packaging)||!Array.isArray(p.vehicles)
    ||!p.product||!p.nodeCosts||!p.transport)throw Error('Faltan categorías de parámetros.');
 const nonneg=(v,name)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0)
  throw Error('Revisa '+name+': debe ser un número no negativo.');};
 const positive=(v,name)=>{nonneg(v,name);if(v===0)throw Error(name+' debe ser mayor que cero.');};
 const t=p.transport;
 positive(p.product.humidityPct,'Humedad relativa');
 if(p.product.humidityPct>100)throw Error('La humedad relativa no puede superar el 100 %.');
 nonneg(p.product.rejectPct,'Rechazo por transporte');
 if(p.product.rejectPct>=100)throw Error('El rechazo debe ser inferior a 100 %.');
 for(const [k,v] of Object.entries(p.product.temperature)){
   nonneg(v,'Temperatura '+k);
   if(v>40)throw Error('La temperatura configurada supera 40 °C.');
 }
 for(const x of p.packaging){
   for(const k of ['capacityKg','lengthM','widthM','heightM','cycles','maxStack'])positive(x[k],'Empaque '+x.name+' / '+k);
   for(const k of ['tareKg','purchaseCOP','washingCOP','replacementPct'])nonneg(x[k],'Empaque '+x.name+' / '+k);
   if(x.replacementPct>100)throw Error('La reposición no puede superar 100 %.');
   if(!Number.isInteger(x.maxStack)||!Number.isInteger(x.cycles))throw Error('Apilamiento y usos deben ser enteros.');
 }
 for(const x of p.vehicles){
   for(const k of ['payloadKg','volumeM3','lengthM','widthM','heightM','costFactor'])positive(x[k],'Vehículo '+x.name+' / '+k);
   for(const k of ['coldFuelLh','coldEquipmentCOPH'])nonneg(x[k],'Vehículo '+x.name+' / '+k);
   if(!['I','II','III','IV','V','VI','VII'].includes(x.tollCategory))throw Error('Categoría de peaje desconocida.');
 }
 for(const [k,v] of Object.entries(p.nodeCosts)){
   if(typeof v==='number')nonneg(v,'Operaciones / '+k);
 }
 positive(p.nodeCosts.palletFootprintM2,'Área de estiba');
 positive(p.nodeCosts.storageBillingDaysPerMonth,'Días de facturación');
 for(const k of ['dieselCOPPerGallon','fallbackDistanceMultiplier','fallbackSpeedKmh','routeMultiplier'])
   positive(t[k],'Transporte / '+k);
 for(const k of ['repairsCOPPerKm','tiresCOPPerKm','lubricantsCOPPerKm','serviceFixedCOP',
   'vehicleTimeCOPPerH','refrigeratedPreCoolH','manualTollOutbound','manualTollReturn','quoteCOP'])
   nonneg(t[k],'Transporte / '+k);
 for(const [k,v] of Object.entries(t.baseFuelKmPerGallon))positive(v,'Rendimiento '+k);
 for(const [k,v] of Object.entries(t.surfaceFuelFactor))positive(v,'Superficie '+k);
 const shares=Object.values(t.terrainMix);
 shares.forEach((v,i)=>nonneg(v,'Terreno '+i));
 if(Math.abs(shares.reduce((a,b)=>a+b,0)-1)>0.0001)
   throw Error('Los porcentajes de tipo de terreno deben sumar 100 %.');
 if(!['pavimentada','afirmada'].includes(t.roadSurface))throw Error('Superficie vial no válida.');
 if(!['auto','manual'].includes(t.tollMode))throw Error('Método de peajes no válido.');
 return true;
}
export function loadState(){
 try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY));if(validateState(data))return data;}
 catch{/* Almacenamiento restringido en algunos navegadores. */}
 return defaults();
}
export function storeState(state){
 if(!validateState(state))throw new Error('La configuración no es válida.');
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
 catch{/* La aplicación puede funcionar sin persistencia. */}
 try{const channel=new BroadcastChannel(CHANNEL_NAME);channel.postMessage({event:'changed',source:INSTANCE_ID});channel.close();}
 catch{/* Algunos navegadores no disponen de este canal. */}
}
export function resetState(){const model=defaults();storeState(model);return model;}

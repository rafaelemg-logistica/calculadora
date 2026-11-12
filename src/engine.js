import {tollSelection} from './tolls.js';
/** Motor determinista, independiente del mapa y de servicios externos. */
const finiteNonnegative = (value, name) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}: debe ser un número mayor o igual a cero`);
  return value;
};
const checkRate = (rate, name) => {
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) throw new Error(`${name}: la tasa debe estar entre 0 y menos de 100 %`);
  return rate;
};
const money = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
const amount = (name,value) => ({name, amountCOP:money(value)});

/**
 * @param {object} options
 * @param {Array<{distanceKm:number,durationMin:number,source:string}>} options.legs
 * @returns {object} quantities, costs, indicators, warnings, and ledger
 */
export function calculateScenario({scenario, parameters, legs}) {
  if (!scenario || !parameters || !Array.isArray(legs)) throw new Error('Faltan datos del escenario.');
  const expectedLegs = scenario.viaCenter ? 2 : 1;
  if (legs.length !== expectedLegs) throw new Error(`Se requieren ${expectedLegs} tramos logísticos.`);
  const initialKg = finiteNonnegative(+scenario.dispatchKg, 'Cantidad despachada');
  if (initialKg <= 0) throw new Error('La cantidad despachada debe ser mayor que cero.');
  const vehicle = parameters.vehicles.find(item => item.id === scenario.vehicleId);
  if (!vehicle || !Number.isFinite(vehicle.capacityKg) || vehicle.capacityKg <= 0) throw new Error('Vehículo sin capacidad válida.');
  finiteNonnegative(vehicle.costPerKm, 'Tarifa COP/km');
  const op=parameters.operations;
  const rates = Object.fromEntries(Object.entries(op).map(([key,p]) => [key,finiteNonnegative(+p.value,key)]));
  const marketLoss = checkRate(parameters.losses[scenario.channel]?.value, 'Merma de mercado');
  const centerLoss = checkRate(parameters.losses.atCenter.value, 'Merma de acopio');
  const pack = parameters.packaging;
  const crateKg = +pack.kgPerCrate;
  if (!(crateKg>0)) throw new Error('La capacidad del empaque debe ser mayor que cero.');
  const crateCost = finiteNonnegative(+pack.crateCost, 'Costo de canastilla');
  const returnFactor = scenario.includeEmptyReturn ? 2 : 1;
  const ledger=[]; const warnings=[];
  let kg=initialKg, logisticsLossKg=0, transportCOP=0, freightCOP=0, tollCOP=0, handlingCOP=0, distanceKm=0, elapsedHours=0, vehicleHours=0, vehicleTripCount=0;
  if (scenario.applySelection) {
    const selection = kg * rates.selectionPerKg;
    handlingCOP+=selection;ledger.push(amount('Selección/acondicionamiento en origen',selection));
  }
  const loadOrigin = kg*rates.loadingPerKg;
  handlingCOP+=loadOrigin;ledger.push(amount('Cargue en origen',loadOrigin));
  const crateCount = Math.ceil(initialKg/crateKg);
  const packagingCOP = crateCount*crateCost;
  ledger.push(amount('Empaque (una sola vez)',packagingCOP));
  const legResults=[];
  for (let i=0; i<legs.length; i++) {
    const leg=legs[i];
    finiteNonnegative(+leg.distanceKm, `Distancia del tramo ${i+1}`);
    finiteNonnegative(+leg.durationMin, `Duración del tramo ${i+1}`);
    const trips = Math.max(1, Math.ceil(kg / vehicle.capacityKg));
    const tollValues = scenario.viaCenter ? scenario.centerTolls ?? [] : scenario.tolls ?? [];
    const quoteValues = scenario.viaCenter ? scenario.centerQuotes ?? [] : scenario.quotes ?? [];
    const manualTollPerTrip=finiteNonnegative(+(tollValues[i]??0),`Peajes tramo ${i+1}`);
    const suggestion=tollSelection(leg.tollCandidates??[],scenario.tollOverrides??{});
    const automatic=scenario.tollMode==='auto';
    const tollPerTrip=automatic?suggestion.perTrip:manualTollPerTrip;
    const quotePerTrip=finiteNonnegative(+(quoteValues[i]??0),`Cotización tramo ${i+1}`);
    const distanceCostPerTrip=leg.distanceKm*vehicle.costPerKm*returnFactor;
    // Una cotización integral puede incluir ya los peajes; no sumarlos dos veces.
    const basePerTrip=scenario.transportMethod==='quote'?quotePerTrip:distanceCostPerTrip;
    const quotedWithTolls=scenario.transportMethod==='quote'&&scenario.quoteIncludesTolls===true;
    const billedTollPerTrip=quotedWithTolls?0:tollPerTrip;
    const freight=trips*basePerTrip;
    const tollCharge=trips*billedTollPerTrip;
    const cost=freight+tollCharge;
    transportCOP+=cost;freightCOP+=freight;tollCOP+=tollCharge;
    distanceKm+=leg.distanceKm;
    elapsedHours+=leg.durationMin/60;
    vehicleHours+=leg.durationMin/60*trips;
    vehicleTripCount+=trips;
    ledger.push(amount(`Transporte tramo ${i+1} (${trips} viaje${trips>1?'s':''})`,freight));
    ledger.push(amount(`Peajes tramo ${i+1}`,tollCharge));
    legResults.push({index:i+1,inputKg:kg,trips,distanceKm:leg.distanceKm,durationMin:leg.durationMin,
      freightCOP:money(freight),tollCOP:money(tollCharge),tollPerTrip:money(tollPerTrip),
      detectedTolls:automatic?suggestion.entries:[],costCOP:money(cost),source:leg.source});
    if(leg.source!=='osrm') warnings.push(`Tramo ${i+1}: trazado estimado, requiere validación vial.`);
    if(automatic&&leg.source!=='osrm')warnings.push(`Tramo ${i+1}: peajes automáticos no verificables sin geometría vial; usar modo manual si se conocen.`);
    if(automatic&&leg.source==='osrm'&&!suggestion.entries.length)warnings.push(`Tramo ${i+1}: ningún peaje identificado por proximidad; no confirma que sea un corredor libre de cobro.`);
    if(automatic&&suggestion.missing.length)warnings.push(`Tramo ${i+1}: falta tarifa para categoría ${vehicle.tollCategory??'?'} en ${suggestion.missing.join(', ')}.`);
    if(quotedWithTolls&&tollPerTrip>0)warnings.push(`Tramo ${i+1}: peajes mostrados como referencia, no sumados porque la cotización declara incluirlos.`);
    if(automatic&&suggestion.entries.length)warnings.push(`Tramo ${i+1}: peajes candidatos por proximidad espacial; revisar sentido, categoría y tarifa vigente.`);
    if(scenario.transportMethod==='quote' && quotePerTrip===0) warnings.push(`Tramo ${i+1}: cotización ingresada en $0; actualizar para evitar subestimación.`);
    if(i===0 && scenario.viaCenter) {
      const unloading=kg*rates.unloadingPerKg;
      const consolidation=kg*rates.consolidationPerKg;
      const centerLossKg=kg*centerLoss;
      kg-=centerLossKg;logisticsLossKg+=centerLossKg;
      const reloading=kg*rates.loadingPerKg;
      handlingCOP+=unloading+consolidation+reloading;
      ledger.push(amount('Descargue en acopio',unloading));
      ledger.push(amount('Consolidación en acopio',consolidation));
      ledger.push(amount('Cargue desde acopio',reloading));
      ledger.push({name:'Merma en acopio (kg)',value:money(centerLossKg),kind:'mass'});
    }
  }
  const unloadDestination=kg*rates.unloadingPerKg;
  handlingCOP+=unloadDestination;
  ledger.push(amount('Descargue en destino',unloadDestination));
  const marketLossKg=kg*marketLoss;
  kg-=marketLossKg;logisticsLossKg+=marketLossKg;
  ledger.push({name:'Merma en destino (kg)',value:money(marketLossKg),kind:'mass'});
  const totalCOP=transportCOP+handlingCOP+packagingCOP;
  if(!crateCost)warnings.push('Costo de empaque sin monetizar: el costo total es parcial.');
  if(scenario.includeEmptyReturn)warnings.push('Retorno aproximado: se duplica el costo kilométrico; no la cotización ni los peajes.');
  if(scenario.viaCenter)warnings.push('Acopio ilustrativo: ubicación, capacidad, peajes por tramo y merma requieren verificación de campo.');
  if(scenario.transportMethod==='km')warnings.push('Tarifa COP/km referencial del Excel: contrastar con cotización y costos reales.');
  if(scenario.channel==='wholesale')warnings.push('Merma mayorista de referencia histórica 2019; validar para la operación actual.');
  const balanceError=initialKg-kg-logisticsLossKg;
  return {
    initialKg, deliveredKg:kg, logisticsLossKg, balanceErrorKg:balanceError,
    totalCOP:money(totalCOP), costPerDeliveredKg:kg>0?totalCOP/kg:null,
    costPerDispatchedKg:totalCOP/initialKg, transportCOP:money(transportCOP),freightCOP:money(freightCOP),tollCOP:money(tollCOP),
    handlingCOP:money(handlingCOP), packagingCOP:money(packagingCOP),crateCount,
    distanceKm, elapsedHours, vehicleHours, vehicleTripCount, vehicleId:vehicle.id,
    ledger,legs:legResults,warnings
  };
}

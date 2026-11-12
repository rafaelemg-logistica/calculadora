import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneDefaults} from '../src/catalog.js';
import {calculateScenario} from '../src/engine.js';
import {haversineKm,lineFallback} from '../src/routing.js';

const fixture=()=>{
 const {scenario,parameters}=cloneDefaults();
 return {scenario,parameters,legs:[{distanceKm:276.934,durationMin:4.93*60,source:'osrm'}]};
};
test('Replica costo y balance E1 del Excel con cotización manual',()=>{
 const f=fixture();f.scenario.transportMethod='quote';
 const r=calculateScenario(f);
 assert.ok(Math.abs(r.totalCOP-1514132.564)<0.001);
 assert.ok(Math.abs(r.deliveredKg-5365.8)<1e-8);
 assert.ok(Math.abs(r.logisticsLossKg-134.2)<1e-8);
 assert.ok(Math.abs(r.costPerDeliveredKg-282.1820723843602)<1e-8);
 assert.equal(r.vehicleTripCount,1);
 assert.ok(Math.abs(r.balanceErrorKg)<1e-8);
});
test('Replica merma E2 mayorista y muestra diferencia del canal',()=>{
 const f=fixture();f.scenario.channel='wholesale';f.scenario.transportMethod='quote';
 const r=calculateScenario(f);
 assert.ok(Math.abs(r.deliveredKg-5213.45)<1e-8);
 assert.ok(Math.abs(r.logisticsLossKg-286.55)<1e-8);
 assert.equal(r.totalCOP,1514132.564);
});
test('La tarifa por km responde a la distancia real del tramo',()=>{
 const f=fixture();
 const base=calculateScenario(f);
 const modified=calculateScenario({...f,legs:[{...f.legs[0],distanceKm:f.legs[0].distanceKm+10}]});
 assert.equal(Math.round(modified.transportCOP-base.transportCOP),24430);
});
test('La cotización alternativa no se duplica al seleccionar retorno vacío',()=>{
 const f=fixture();f.scenario.transportMethod='quote';
 const base=calculateScenario(f);f.scenario.includeEmptyReturn=true;
 const returnResult=calculateScenario(f);
 assert.equal(returnResult.totalCOP,base.totalCOP);
 assert.ok(returnResult.warnings.some(w=>w.includes('Retorno aproximado')));
});
test('El acopio aplica merma después del primer tramo, modificando la carga del segundo',()=>{
 const f=fixture();f.scenario.viaCenter=true;f.scenario.channel='wholesale';
 f.legs=[{distanceKm:80,durationMin:90,source:'osrm'},{distanceKm:250,durationMin:300,source:'osrm'}];
 const r=calculateScenario(f);
 assert.equal(r.legs.length,2);
 assert.equal(r.legs[0].inputKg,5500);
 assert.equal(r.legs[1].inputKg,5445);
 assert.ok(Math.abs(r.deliveredKg-5445*(1-.0521))<1e-8);
 assert.ok(Math.abs(r.initialKg-r.deliveredKg-r.logisticsLossKg)<1e-7);
 assert.ok(r.handlingCOP>0);
});
test('Más kg que capacidad del vehículo exige varios viajes',()=>{
 const f=fixture();f.scenario.dispatchKg=15000;
 const r=calculateScenario(f);
 assert.equal(r.legs[0].trips,3);
});
test('La carga de empaque se hace una sola vez por kg despachados',()=>{
 const f=fixture();f.parameters.packaging.crateCost=750;
 const r=calculateScenario(f);
 assert.equal(r.crateCount,275);
 assert.equal(r.packagingCOP,206250);
});
test('La merma no debe superar 100 % y el modelo rechaza capacidad cero',()=>{
 const f=fixture();f.parameters.losses.direct.value=1;
 assert.throws(()=>calculateScenario(f),/tasa/);
 f.parameters.losses.direct.value=.02;f.parameters.vehicles[2].capacityKg=0;
 assert.throws(()=>calculateScenario(f),/capacidad/);
});
test('El fallback no afirma que una línea recta sea vía real',()=>{
 const a={lat:4.1496,lng:-74.8840},b={lat:5.5353,lng:-73.3678};
 assert.ok(haversineKm(a,b)>0);
 const f=lineFallback(a,b,{fallbackDistanceMultiplier:1.25,fallbackSpeedKmh:42});
 assert.equal(f.source,'estimate');
 assert.equal(f.coordinates.length,2);
});

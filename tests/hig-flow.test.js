import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaults,validateState,readyToCalculate,validateParameters} from '../src/config.js';
import {normalizeOsrmRoutes,hasPoint,haversineKm} from '../src/routing.js';
import {routeKey,alternativeResult,applyParameters,selectAlternative} from '../src/route-choice.js';
import {placeLabel,fallbackCoordinateLabel} from '../src/geocode.js';

const from={name:'Espinal',lat:4.1496,lng:-74.884};
const to={name:'Tunja',lat:5.5353,lng:-73.3678};
const leg=(id,km,minutes)=>({
 id,source:'osrm',distanceKm:km,durationMin:minutes,
 coordinates:[[from.lat,from.lng],[4.8,-74.3],[to.lat,to.lng]]
});
const loadModel=()=>{
 const model=defaults();model.scenario.dispatchKg=3500;
 model.scenario.origin={...from};model.scenario.destination={...to};
 return model;
};

test('Inicio nuevo sin kilos ni municipios precargados',()=>{
 const m=defaults();
 assert.equal(m.scenario.dispatchKg,null);
 assert.equal(m.scenario.origin.name,'');
 assert.equal(m.scenario.destination.name,'');
 assert.equal(m.scenario.origin.lat,null);
 assert.equal(m.scenario.destination.lng,null);
 assert.equal(validateState(m),true);
 assert.equal(readyToCalculate(m),false);
});
test('Origen y destino completos habilitan cálculo y cambian la clave cuando se mueven',()=>{
 const m=loadModel();
 assert.equal(readyToCalculate(m),true);
 const current=routeKey(m.scenario.origin,m.scenario.destination);
 assert.ok(current);
 m.scenario.destination.lng+=.03;
 assert.notEqual(routeKey(m.scenario.origin,m.scenario.destination),current);
 assert.equal(hasPoint({name:'origen',lat:null,lng:null}),false);
 assert.ok(haversineKm(from,to)>0);
});
test('OSRM solo expone las dos alternativas reales de su respuesta',()=>{
 const geometry=[[-74.88,4.14],[-74.5,4.8],[-73.36,5.53]];
 const routes=normalizeOsrmRoutes({code:'Ok',routes:[
  {distance:210000,duration:14400,geometry:{coordinates:geometry}},
  {distance:290000,duration:17500,geometry:{coordinates:geometry}}
 ]});
 assert.equal(routes.length,2);
 assert.equal(routes[1].distanceKm,290);
 assert.equal(routes[1].source,'osrm');
 assert.equal(normalizeOsrmRoutes({code:'Ok',routes:[{distance:20000}]}).length,0);
 assert.equal(normalizeOsrmRoutes({code:'NoRoute',routes:[]}).length,0);
});
test('Cambiar de alternativa afecta realmente distancia, tiempo y costo logístico',()=>{
 const model=loadModel();
 const options=[leg('osrm-0',210,240),leg('osrm-1',305,400)];
 const returning=leg('return',212,250);
 const a=alternativeResult(model,options,returning,0);
 const b=alternativeResult(model,options,returning,1);
 assert.equal(selectAlternative(options,1).id,'osrm-1');
 assert.equal(a.outboundKm,210);
 assert.equal(b.outboundKm,305);
 assert.notEqual(a.outboundHours,b.outboundHours);
 assert.ok(b.outwardAttributedCOP>a.outwardAttributedCOP);
 assert.ok(b.totalCOP>a.totalCOP);
});
test('Aplicar parámetros avanzados recalcula sin alterar origen, destino ni ruta elegida',()=>{
 const model=loadModel();
 const routes=[leg('osrm-0',210,240),leg('osrm-1',305,400)];
 const returning=leg('return',212,250);
 const selectedIndex=1;
 const initial=alternativeResult(model,routes,returning,selectedIndex);
 const draft=structuredClone(model.parameters);
 draft.nodeCosts.loadingPerKg+=12;
 const updated=applyParameters(model,draft,validateParameters);
 const final=alternativeResult(updated,routes,returning,selectedIndex);
 assert.deepEqual(updated.scenario,model.scenario);
 assert.equal(routes[selectedIndex].id,'osrm-1');
 assert.equal(final.outboundKm,initial.outboundKm);
 assert.equal(final.totalCOP-initial.totalCOP,3500*12);
});
test('No se aceptan porcentajes o capacidades incoherentes en parámetros avanzados',()=>{
 const p=defaults().parameters;
 p.terrainMix={flat:.9,rolling:.2,mountain:.1};
 assert.throws(()=>validateParameters(p),/sumar 100/);
 p.terrainMix={flat:.5,rolling:.3,mountain:.2};
 p.packaging[0].widthM=0;
 assert.throws(()=>validateParameters(p),/mayor que cero/);
});
test('Geocodificación muestra municipio y departamento o coordenadas',()=>{
 assert.equal(placeLabel({address:{town:'Espinal',state:'Tolima'}}),'Espinal, Tolima');
 assert.equal(placeLabel({},4.1496,-74.884),fallbackCoordinateLabel(4.1496,-74.884));
});
test('La pantalla integra los parámetros y no abre otra pestaña',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="advanced-overlay"/);
 assert.match(html,/id="advanced-frame"/);
 assert.match(html,/id="route-alternatives"/);
 assert.match(html,/Ingrese la cantidad/);
 assert.doesNotMatch(html,/href="\.\/advanced\.html" target="_blank"/);
});

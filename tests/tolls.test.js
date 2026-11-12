import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTollCatalog,matchTollsToRoute,tollSelection,distanceToSegmentM} from '../src/tolls.js';

const catalog={
 type:'FeatureCollection',features:[
  {type:'Feature',geometry:{type:'Point',coordinates:[-74.10,4.60]},
   properties:{id:'T1',name:'Prueba centro',sector:'Sector demostrativo',operator:'INVIAS',
     direction:'Ambos sentidos',rate_I:12000,rate_IV:18000,rate_VI:0}},
  {type:'Feature',geometry:{type:'Point',coordinates:[-77,5]},
   properties:{id:'T2',name:'Lejos',rate_IV:10000}}
 ]
};
const road={source:'osrm',coordinates:[[4.5,-74.2],[4.6,-74.1],[4.7,-74.0]]};

test('Catálogo geográfico parsea tarifas por categoría y localización',()=>{
 const tolls=parseTollCatalog(catalog);
 assert.equal(tolls.length,2);
 assert.equal(tolls[0].rates.IV,18000);
 assert.equal(tolls[0].rates.VI,null);
});
test('Detecta solamente estaciones próximas a la geometría vial',()=>{
 const tolls=parseTollCatalog(catalog);
 const matched=matchTollsToRoute(road,tolls,'IV');
 assert.equal(matched.length,1);
 assert.equal(matched[0].name,'Prueba centro');
 assert.equal(matched[0].rateCOP,18000);
 assert.ok(matched[0].distanceM<=160);
});
test('Nunca atribuye peajes automáticamente a una contingencia estimada',()=>{
 const tolls=parseTollCatalog(catalog);
 assert.deepEqual(matchTollsToRoute({...road,source:'estimate'},tolls,'IV'),[]);
 assert.deepEqual(matchTollsToRoute({source:'osrm',coordinates:[[4.5,-74.2],[4.7,-74.0]]},tolls,'IV'),[]);
});
test('La ausencia de tarifa positiva no significa cobro cero confirmado',()=>{
 const tolls=parseTollCatalog(catalog);
 const matched=matchTollsToRoute(road,tolls,'VI');
 const selection=tollSelection(matched);
 assert.equal(selection.perTrip,0);
 assert.deepEqual(selection.missing,['Prueba centro']);
});
test('Se puede modificar la tarifa o excluir la estación del cálculo',()=>{
 const selected=matchTollsToRoute(road,parseTollCatalog(catalog),'IV');
 assert.equal(tollSelection(selected).perTrip,18000);
 assert.equal(tollSelection(selected,{T1:{rateCOP:25000}}).perTrip,25000);
 assert.equal(tollSelection(selected,{T1:{enabled:false}}).perTrip,0);
});
test('La distancia es métrica y se proyecta sobre el segmento',()=>{
 const measurement=distanceToSegmentM([4.6,-74.1],[4.5,-74.2],[4.7,-74]);
 assert.ok(measurement.distanceM<1);
});
test('Se incorpora la base regional de 58 estaciones sin duplicados',()=>{
 const json=JSON.parse(readFileSync(new URL('../assets/peajes-region-central.geojson',import.meta.url)));
 const parsed=parseTollCatalog(json);
 assert.equal(parsed.length,58);
 assert.equal(new Set(parsed.map(x=>x.id)).size,58);
});

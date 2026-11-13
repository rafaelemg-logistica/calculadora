import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateState} from '../src/config.js';
import {calculateMango,vehicleCapacity,distanceAdjustment} from '../src/mango-engine.js';

function setup(){
 const model=defaults(),leg={distanceKm:200,durationMin:240,source:'osrm',coordinates:[
  [4.14,-74.88],[4.5,-74.4],[5.5,-73.37]],tollCandidates:[]};
 model.scenario.dispatchKg=5500;
 return {model,routes:{outbound:{...leg},returning:{...leg}}};
}
const run=s=>calculateMango(s.model,s.routes);
test('La configuración de mango se encuentra estructurada y es válida',()=>{
 assert.equal(validateState(defaults()),true);
});
test('Carga 5.500 kg netos, 275 canastillas y una flota ida/regreso',()=>{
 const s=setup(),r=run(s);
 assert.equal(r.dispatchedKg,5500);
 assert.equal(r.unitCount,275);
 assert.equal(r.totalTareKg,522.5);
 assert.equal(r.trucks,1);
 assert.equal(r.returnedTrucks,1);
 assert.equal(r.returnedUnits,275);
 assert.ok(Math.abs(r.grossVolumeM3-16.5)<1e-8);
});
test('Rechazo de mango únicamente al recibir, sin descontarlo antes del transporte',()=>{
 const s=setup(),r=run(s);
 assert.equal(r.rejectedKg,126.5);
 assert.equal(r.acceptedKg,5373.5);
 assert.equal(r.loadingCOP,5500*25);
 assert.equal(r.unloadingCOP,5500*20);
 assert.ok(r.carriedGross[0]>5500);
 assert.ok(r.perAcceptedKg>r.perDispatchedKg);
});
test('Tres vehículos de ida requieren tres vehículos de regreso',()=>{
 const s=setup();s.model.scenario.dispatchKg=14000;
 const r=run(s);
 assert.equal(r.trucks,3);
 assert.equal(r.returnedTrucks,3);
 assert.equal(r.returnedUnits,700);
 assert.ok(r.carriedGross.every(g=>g<=s.model.parameters.vehicles[1].payloadKg));
 assert.ok(r.returnLoads.every(n=>n<=r.perVehicleCapacity));
});
test('Restricción de apilamiento puede dominar peso y volumen',()=>{
 const s=setup(),box=s.model.parameters.packaging[0],v=s.model.parameters.vehicles[1];
 box.maxStack=1;
 const cap=vehicleCapacity(box,v);
 assert.equal(cap.positions,45);
 assert.equal(cap.unitsPerVehicle,45);
 assert.equal(run(s).trucks,Math.ceil(275/45));
});
test('Una caja incompatible con el vehículo se rechaza sin producir costos falsos',()=>{
 const s=setup();s.model.parameters.packaging[0].widthM=9;
 assert.throws(()=>run(s),/no admite una unidad/);
});
test('Al crecer la distancia aumenta el costo total; puede reducirse el COP/km promedio',()=>{
 const a=setup(),b=setup();
 b.routes.outbound.distanceKm=400;b.routes.returning.distanceKm=400;
 b.routes.outbound.durationMin=480;b.routes.returning.durationMin=480;
 const x=run(a),y=run(b);
 assert.ok(y.totalCOP>x.totalCOP);
 assert.ok(y.transportAttributedCOP/(y.outboundKm+y.returnKm)<
  x.transportAttributedCOP/(x.outboundKm+x.returnKm));
 assert.equal(distanceAdjustment(200,200,30),1);
 assert.equal(distanceAdjustment(400,200,30),1.7);
});
test('Frío incrementa costo y rechaza carrocería incompatible',()=>{
 const s=setup(),plain=run(s);
 s.model.scenario.preservation='refrigerado';
 assert.ok(run(s).totalCOP>plain.totalCOP);
 s.model.parameters.vehicles[1].coldCapable=false;
 assert.throws(()=>run(s),/no tiene conservación refrigerada/);
});
test('Cotización se multiplica por vehículos y no duplica peajes incluidos',()=>{
 const s=setup();s.model.scenario.dispatchKg=14000;
 const t=s.model.parameters.transport;
 t.allowQuote=true;t.quoteCOP=600000;t.quoteIncludesTolls=true;
 t.tollMode='manual';t.manualTollOutbound=80000;t.manualTollReturn=60000;
 t.quoteIncludesReturn=true;
 const r=run(s);
 assert.equal(r.trucks,3);
 assert.equal(r.outwardAttributedCOP,1800000);
 assert.equal(r.returnAttributedCOP,0);
});
test('Retorno obligatorio sin empaques: todos los vehículos vuelven vacíos',()=>{
 const s=setup();s.model.scenario.dispatchKg=14000;
 s.model.scenario.returnPackaging=false;
 const r=run(s);
 assert.equal(r.returnedTrucks,3);
 assert.equal(r.returnedUnits,0);
 assert.ok(r.returnedGross.every(x=>x===0));
 assert.ok(r.returnCostPhysicalCOP>0);
});
test('Costo incluido en otro precio no vuelve a cobrar adquisición de canastillas',()=>{
 const s=setup(),included=run(s);
 s.model.scenario.packagingIncluded=false;
 const charged=run(s);
 assert.ok(charged.packagingCOP>included.packagingCOP);
 assert.equal(charged.unitCount,included.unitCount);
});
test('Peajes ida y regreso se cobran por vehículo en modo manual',()=>{
 const s=setup();s.model.parameters.transport.tollMode='manual';
 s.model.parameters.transport.manualTollOutbound=50000;
 s.model.parameters.transport.manualTollReturn=40000;
 const r=run(s);
 assert.equal(r.outboundTollCOP,50000);
 assert.equal(r.returnTollCOP,40000);
});
test('El costo generalizado conserva el regreso aun cuando el contrato indique tarifa integral',()=>{
 const s=setup();s.model.scenario.returnIncluded=true;
 const r=run(s);
 assert.equal(r.returnAttributedCOP,r.returnCostPhysicalCOP);
 assert.ok(r.returnCostPhysicalCOP>0);
});
test('Una cotización integral no vuelve a sumar el regreso',()=>{
 const s=setup();s.model.scenario.returnIncluded=true;
 s.model.parameters.transport.allowQuote=true;
 s.model.parameters.transport.quoteCOP=900000;
 const r=run(s);
 assert.equal(r.returnAttributedCOP,0);
 assert.equal(r.outwardAttributedCOP,900000);
});
test('Almacenamiento opcional agrega costo por estibas y días facturables',()=>{
 const s=setup(),simple=run(s);
 s.model.scenario.storageEnabled=true;s.model.scenario.storageHours=49;
 const stored=run(s);
 assert.equal(stored.storageDays,3);
 assert.ok(stored.storageCOP>simple.storageCOP);
});

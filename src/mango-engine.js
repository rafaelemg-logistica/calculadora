import {tollSelection,overridesForLeg} from './tolls.js';

/** Motor sin dependencias del navegador. El rechazo se mide únicamente en destino. */
const assertPositive=(n,label)=>{if(!Number.isFinite(+n)||+n<=0)throw Error(label+' debe ser mayor que cero.');return +n;};
const assertNonnegative=(n,label)=>{if(!Number.isFinite(+n)||+n<0)throw Error(label+' debe ser mayor o igual a cero.');return +n;};
const money=n=>Math.round((n+Number.EPSILON)*100)/100;
const ceil=n=>Math.ceil(n-1e-10);
const sum=values=>values.reduce((a,b)=>a+b,0);
const cap=(n,low=0,high=1)=>Math.min(high,Math.max(low,n));

function cratePositions(box,vehicle){
 const {lengthM:l,widthM:w,heightM:h,maxStack}=box;
 [l,w,h,maxStack].forEach(v=>assertPositive(v,'Dimensión o apilamiento'));
 const floorA=Math.floor(vehicle.lengthM/l)*Math.floor(vehicle.widthM/w);
 const floorB=Math.floor(vehicle.lengthM/w)*Math.floor(vehicle.widthM/l);
 const layers=Math.min(maxStack,Math.floor(vehicle.heightM/h));
 return Math.max(floorA,floorB)*Math.max(0,layers);
}
export function vehicleCapacity(packaging,vehicle){
 const perFull=assertPositive(packaging.capacityKg,'Capacidad por empaque')+assertNonnegative(packaging.tareKg,'Tara');
 const positions=cratePositions(packaging,vehicle);
 const volume=packaging.lengthM*packaging.widthM*packaging.heightM;
 const byWeight=Math.floor(assertPositive(vehicle.payloadKg,'Capacidad útil de peso')/perFull);
 const byVolume=Math.floor(assertPositive(vehicle.volumeM3,'Volumen útil')/volume);
 const unitsPerVehicle=Math.min(positions,byWeight,byVolume);
 if(unitsPerVehicle<1)throw Error('El vehículo no admite una unidad completa de este empaque.');
 return {unitsPerVehicle,byWeight,byVolume,positions,crateVolumeM3:volume};
}
export function distanceAdjustment(distanceKm,referenceKm,fixedPct){
 const d=assertNonnegative(distanceKm,'Distancia');
 const base=assertPositive(referenceKm,'Distancia de referencia');
 const b=cap(assertNonnegative(fixedPct,'Participación fija')/100);
 return b+(1-b)*d/base;
}
function fuelGallons(km,parameters,vehicle,loadRatio){
 const t=parameters.transport;
 const mix=t.terrainMix;
 const totalMix=sum(Object.values(mix).map(Number));
 if(Math.abs(totalMix-1)>0.0001)throw Error('Las proporciones del terreno deben sumar 100 %.');
 const surface=t.surfaceFuelFactor[t.roadSurface];
 if(!Number.isFinite(surface)||surface<=0)throw Error('Factor de superficie vial inválido.');
 const relativeLoad=.85+.15*cap(loadRatio);
 const adjustedKm=km*assertPositive(t.routeMultiplier,'Factor de recorrido');
 return sum(Object.entries(mix).map(([terrain,share])=>
    adjustedKm*share/Math.max(0.001,assertPositive(t.baseFuelKmPerGallon[terrain],'Rendimiento')/vehicle.costFactor)
 ))*surface*relativeLoad;
}
function checkedRoute(route,label){
 if(!route||!Number.isFinite(route.distanceKm)||route.distanceKm<0
   ||!Number.isFinite(route.durationMin)||route.durationMin<0)
   throw Error(label+': no hay recorrido calculable.');
 return route;
}
function tollsFor(route,catalog,tollMode,category,overrides,index,manual){
 const matched=tollMode==='auto'&&route.source==='osrm'
   ?tollSelection(route.tollCandidates??[],overridesForLeg(route.tollCandidates??[],overrides,index))
   :{entries:[],included:[],perTrip:0,missing:[]};
 const perTrip=tollMode==='manual'?assertNonnegative(manual,'Peaje manual'):matched.perTrip;
 return {...matched,perTrip};
}
export function calculateMango(model,routes){
 const {scenario:s,parameters:p}=model;
 const t=p.transport,node=p.nodeCosts;
 const outward=checkedRoute(routes?.outbound,'Ida');
 const returning=checkedRoute(routes?.returning,'Regreso');
 const vehicle=p.vehicles.find(x=>x.id===s.vehicleId);
 const box=p.packaging.find(x=>x.id===s.packagingId);
 if(!vehicle||!box)throw Error('Selecciona un vehículo y un empaque válidos.');
 const netKg=assertPositive(s.dispatchKg,'Cantidad despachada');
 const unitCount=ceil(netKg/assertPositive(box.capacityKg,'Capacidad por empaque'));
 const capacity=vehicleCapacity(box,vehicle);
 const trucks=ceil(unitCount/capacity.unitsPerVehicle);
 const tareKg=unitCount*box.tareKg;
 const grossKg=netKg+tareKg;
 const grossVolume=unitCount*capacity.crateVolumeM3;
 const loads=Array.from({length:trucks},(_,i)=>Math.min(capacity.unitsPerVehicle,
    Math.max(0,unitCount-i*capacity.unitsPerVehicle)));
 const returnedUnits=s.returnPackaging&&box.returnable
  ?Math.min(unitCount,Math.max(0,Math.floor(unitCount*cap(s.returnShare,0,1)))):0;
 const returnLoads=Array.from({length:trucks},()=>0);
 for(let i=0;i<returnedUnits;i++)returnLoads[i%trucks]++;
 const netAssigned=loads.map((n,i)=>i===loads.length-1
  ?Math.max(0,netKg-box.capacityKg*sum(loads.slice(0,i)))
  :n*box.capacityKg);
 // Protect a partially filled final package: all other trucks carry full boxes.
 const carriedGross=loads.map((packages,i)=>netAssigned[i]+packages*box.tareKg);
 const returnedGross=returnLoads.map(units=>units*box.tareKg);
 const returnedVolume=returnedUnits*capacity.crateVolumeM3;
 const rejectedPct=assertNonnegative(p.product.rejectPct,'Rechazo por transporte');
 if(rejectedPct>=100)throw Error('El rechazo por transporte debe ser menor que 100 %.');
 const rejectedKg=netKg*rejectedPct/100,acceptedKg=netKg-rejectedKg;
 if(s.preservation==='refrigerado'&&!vehicle.coldCapable)
   throw Error('El vehículo seleccionado no tiene conservación refrigerada.');
 if(!['ambiente','refrigerado'].includes(s.preservation))
   throw Error('Modo de conservación desconocido.');
 const outboundTolls=tollsFor(outward,null,t.tollMode,vehicle.tollCategory,t.tollOverrides,0,t.manualTollOutbound);
 const returnTolls=tollsFor(returning,null,t.tollMode,vehicle.tollCategory,t.tollOverrides,1,t.manualTollReturn);
 const variablePerKm=(t.repairsCOPPerKm+t.tiresCOPPerKm+t.lubricantsCOPPerKm)*vehicle.costFactor;
 const diesel=assertPositive(t.dieselCOPPerGallon,'Precio del ACPM');
 const drivingHours=(outward.durationMin+returning.durationMin)/60;
 const prepTime=assertNonnegative(node.loadingHours,'Tiempo de cargue')
  +assertNonnegative(node.unloadingHours,'Tiempo de descargue')
  +assertNonnegative(node.waitingHours,'Tiempo de espera');
 const fixed=trucks*assertNonnegative(t.serviceFixedCOP,'Costo fijo por servicio')*vehicle.costFactor;
 const timeCost=trucks*(drivingHours+prepTime)*assertNonnegative(t.vehicleTimeCOPPerH,'Costo del tiempo')*vehicle.costFactor;
 const fuelOut=carriedGross.map(g=>fuelGallons(outward.distanceKm,p,vehicle,g/vehicle.payloadKg)*diesel);
 const fuelReturn=returnedGross.map(g=>fuelGallons(returning.distanceKm,p,vehicle,g/vehicle.payloadKg)*diesel);
 const repairs=trucks*(outward.distanceKm+returning.distanceKm)*t.repairsCOPPerKm*vehicle.costFactor;
 const tires=trucks*(outward.distanceKm+returning.distanceKm)*t.tiresCOPPerKm*vehicle.costFactor;
 const supplies=trucks*(outward.distanceKm+returning.distanceKm)*t.lubricantsCOPPerKm*vehicle.costFactor;
 const coldOperatingH=(s.preservation==='refrigerado')
   ?outward.durationMin/60+node.waitingHours+t.refrigeratedPreCoolH:0;
 const coldCOP=trucks*coldOperatingH*(vehicle.coldFuelLh/3.785*diesel+vehicle.coldEquipmentCOPH);
 const tollOutCOP=trucks*outboundTolls.perTrip;
 const tollReturnCOP=trucks*returnTolls.perTrip;
 const allKm=outward.distanceKm+returning.distanceKm;
 const outShare=allKm>0?outward.distanceKm/allKm:0.5;
 const fuelOutCOP=sum(fuelOut),fuelReturnCOP=sum(fuelReturn);
 const unquotedOut=fuelOutCOP+(repairs+tires+supplies)*outShare+
   fixed+timeCost*(outward.durationMin/60+prepTime)/(drivingHours+prepTime||1)+coldCOP+tollOutCOP;
 const unquotedReturn=fuelReturnCOP+(repairs+tires+supplies)*(1-outShare)+
   timeCost*(returning.durationMin/60)/(drivingHours+prepTime||1)+tollReturnCOP;
 let chargedOut=unquotedOut, chargedReturn=s.returnIncluded?0:unquotedReturn;
 const quote=t.allowQuote?assertNonnegative(t.quoteCOP,'Cotización de transporte'):null;
 if(t.allowQuote){
   chargedOut=trucks*quote+(!t.quoteIncludesTolls?tollOutCOP:0);
   chargedReturn=(t.quoteIncludesReturn||s.returnIncluded)?0:unquotedReturn;
 }
 const billedOutboundTolls=t.allowQuote&&t.quoteIncludesTolls?0:tollOutCOP;
 const transportAttributed=chargedOut+chargedReturn;
 const loadingCOP=netKg*assertNonnegative(node.loadingPerKg,'Tarifa de cargue');
 const unloadingCOP=netKg*assertNonnegative(node.unloadingPerKg,'Tarifa de descargue');
 const packageAcquisition=s.packagingIncluded?0:unitCount*(box.returnable
   ?box.purchaseCOP/assertPositive(box.cycles,'Ciclos de empaque'):box.purchaseCOP);
 const packageCleaning=returnedUnits*box.washingCOP;
 const packageReplacement=(!s.packagingIncluded&&box.returnable)
   ?unitCount*box.purchaseCOP*box.replacementPct/100:0;
 const packagingCOP=packageAcquisition+packageCleaning+packageReplacement;
 const perPallet=Math.max(1,
    Math.floor(node.palletFootprintM2/(box.lengthM*box.widthM))*
    Math.min(box.maxStack,Math.floor(1.6/box.heightM)));
 const palletPositions=ceil(unitCount/perPallet);
 const storageDays=s.storageEnabled?Math.max(1,ceil(assertNonnegative(s.storageHours,'Horas de almacenamiento')/24)):0;
 const storageRate=s.preservation==='refrigerado'?node.coldStorageCOPPerPalletMonth:node.dryStorageCOPPerPalletMonth;
 const storageCOP=palletPositions*storageRate*storageDays/assertPositive(node.storageBillingDaysPerMonth,'Días de facturación');
 const totalCOP=loadingCOP+unloadingCOP+packagingCOP+storageCOP+transportAttributed;
 const components={
   fuel:money(fuelOutCOP+fuelReturnCOP),repairs:money(repairs),tires:money(tires),
   supplies:money(supplies),fixed:money(fixed),vehicleTime:money(timeCost),
   refrigeration:money(coldCOP),tolls:money(tollOutCOP+tollReturnCOP)
 };
 const warnings=[];
 if(outward.source!=='osrm'||returning.source!=='osrm')
   warnings.push('El recorrido incluye una estimación geográfica; verifica distancia, duración y peajes.');
 if(t.tollMode==='auto'&&(!outboundTolls.entries.length||!returnTolls.entries.length))
   warnings.push('La ausencia de peajes sugeridos no demuestra que la ruta sea libre de cobro.');
 if(outboundTolls.missing.length||returnTolls.missing.length)
   warnings.push('Existen estaciones próximas a la vía sin tarifa para la categoría seleccionada.');
 if(t.allowQuote)warnings.push('La distribución técnica de costos es referencial; no descompone la cotización del transportador.');
 if(s.returnIncluded)warnings.push('Todos los vehículos regresan; el costo físico del retorno se muestra pero no se cobra nuevamente.');
 if(s.preservation==='ambiente'&&s.ripeness==='maduro')
   warnings.push('Para mango maduro conviene verificar temperatura, ventilación y duración del transporte.');
 if(p.product.rejectPct===2.3)
   warnings.push('Rechazo de referencia 2,3 %: estimación académica frutícola, ajustable según daños efectivamente observados.');
 if(t.roadSurface==='pavimentada')
   warnings.push('Perfil de terreno y superficie parametrizado; la geometría OSRM no certifica esas condiciones.');
 const serviceComponents=Object.entries(components).map(([id,value])=>({
   id,value,pct:sum(Object.values(components))>0?100*value/sum(Object.values(components)):0
 }));
 return {
   product:'Mango fresco · '+p.product.variety,
   dispatchedKg:netKg,rejectedKg:money(rejectedKg),acceptedKg:money(acceptedKg),
   rejectedPct,unitCount,returnedUnits,unreturnedUnits:unitCount-returnedUnits,
   totalTareKg:money(tareKg),grossKg:money(grossKg),grossVolumeM3:grossVolume,
   perVehicleCapacity:capacity.unitsPerVehicle,trucks,returnedTrucks:trucks,
   loads,returnLoads,carriedGross,returnedGross,returnedVolume,
   outboundKm:outward.distanceKm,returnKm:returning.distanceKm,
   outboundHours:outward.durationMin/60,returnHours:returning.durationMin/60,
   routeSources:[outward.source,returning.source],outboundTolls,returnTolls,
   outboundTollCOP:money(tollOutCOP),returnTollCOP:money(tollReturnCOP),
   loadingCOP:money(loadingCOP),unloadingCOP:money(unloadingCOP),storageCOP:money(storageCOP),
   packagingCOP:money(packagingCOP),coldCOP:money(coldCOP),
   outboundCostPhysicalCOP:money(unquotedOut),returnCostPhysicalCOP:money(unquotedReturn),
   outwardAttributedCOP:money(chargedOut),returnAttributedCOP:money(chargedReturn),
   transportAttributedCOP:money(transportAttributed),
   totalCOP:money(totalCOP),perDispatchedKg:totalCOP/netKg,
   perAcceptedKg:acceptedKg>0?totalCOP/acceptedKg:null,
   serviceComponents,warnings,storageDays,palletPositions,quoteMode:t.allowQuote,
   reference:'Costo generalizado propio; SICE-TAC como referencia metodológica y de contraste.'
 };
}

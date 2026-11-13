import {defaults,loadState,storeState,STORAGE_KEY,CHANNEL_NAME} from './config.js';
import {calculateMango} from './mango-engine.js';
import {fetchRoadLeg,lineFallback} from './routing.js';
import {parseTollCatalog,matchTollsToRoute,tollSelection,overridesForLeg} from './tolls.js';

const $=id=>document.getElementById(id);
const fmt=(n,d=0)=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:d}).format(n);
const cop=n=>'$ '+fmt(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model=loadState(),step=1,maxStep=1;
let routeData=null,currentResult=null,tollCatalog=[],routeRequest=0;
let map=null,markerLayer=null,routeLayer=null,tollLayer=null,tileLayer=null;
let mapFit=true,placement=null,tilesHaveErrors=0;
const mapBox=$('wizard-map');
const ripenessLabel={verde:'verde maduro',pinton:'pintón',maduro:'maduro'};
const field=(id,property,onChange=false)=>{
 $(id).addEventListener(onChange?'input':'change',event=>{
   model.scenario[property]=event.target.type==='checkbox'?event.target.checked:
     event.target.type==='number'?Number(event.target.value):event.target.value;
   save();showDynamic();recalculate();
 });
};
function save(){storeState(model);}
function showError(message){$('wizard-error').textContent=message;$('wizard-error').hidden=!message;}
function makeLine(name,val){return '<div class="data-line"><span>'+esc(name)+'</span><strong>'+esc(val)+'</strong></div>';}
function syncFields(){
 const s=model.scenario,p=model.parameters;
 $('dispatchKg').value=s.dispatchKg;$('ripeness').value=s.ripeness;
 $('packaging').innerHTML=p.packaging.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+fmt(x.capacityKg)+' kg</option>').join('');
 $('packaging').value=s.packagingId;
 $('packagingIncluded').checked=s.packagingIncluded;
 $('storageEnabled').checked=s.storageEnabled;$('storageHours').value=s.storageHours;
 $('vehicle').innerHTML=p.vehicles.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+fmt(x.payloadKg)+' kg</option>').join('');
 $('vehicle').value=s.vehicleId;
 $('preservation').value=s.preservation;
 $('originName').value=s.origin.name;$('destinationName').value=s.destination.name;
 $('returnPackaging').checked=s.returnPackaging;$('returnShare').value=Math.round(s.returnShare*100);
 $('returnIncluded').checked=s.returnIncluded;
 showDynamic();
}
function showDynamic(){
 const s=model.scenario,p=model.parameters;
 $('storage-row').hidden=!s.storageEnabled;
 const box=p.packaging.find(x=>x.id===s.packagingId);
 $('returnPackaging').disabled=!box?.returnable;
 if(!box?.returnable){s.returnPackaging=false;$('returnPackaging').checked=false;}
 $('return-share-row').hidden=!s.returnPackaging;
 $('returnShare').disabled=!s.returnPackaging;
 $('ripeness-note').textContent='Conservación orientativa para mango '+(ripenessLabel[s.ripeness]??'fresco')+
   ': alrededor de '+(p.product.temperature[s.ripeness]??13)+' °C, humedad relativa de referencia '+p.product.humidityPct+' %.';
 $('temperature-note').textContent=s.preservation==='refrigerado'
   ?'Temperatura objetivo del mango: '+(p.product.temperature[s.ripeness]??13)+' °C. Los equipos y sus consumos se parametrizan por vehículo.'
   :'Se ha seleccionado ambiente ventilado. Considera duración, madurez y ventilación para conservar la calidad.';
 $('result-route-title').textContent=s.origin.name+' → '+s.destination.name+' → regreso';
 if(currentResult)$('return-fleet').textContent=
   currentResult.trucks+' vehículo(s) realizarán el viaje de ida y '+currentResult.returnedTrucks+' regresarán.';
}
function renderLive(){
 const s=model.scenario;
 const box=model.parameters.packaging.find(p=>p.id===s.packagingId);
 $('live-summary').innerHTML=[
   makeLine('Mango neto',fmt(s.dispatchKg,1)+' kg'),
   makeLine('Empaques',box?fmt(Math.ceil(s.dispatchKg/box.capacityKg))+' '+box.name:'—'),
   makeLine('Estado',ripenessLabel[s.ripeness]??'—'),
   makeLine('Conservación',s.preservation==='refrigerado'?'Refrigerado':'Ambiente'),
   ...(currentResult?[makeLine('Vehículos necesarios',fmt(currentResult.trucks)),
     makeLine('Costo calculado',cop(currentResult.totalCOP))]:[])
 ].join('');
}
function go(target){
 if(target<1||target>5)return;
 if(target===5){
   const error=validateWizard();
   if(error){showError(error);return;}
 }
 step=target;maxStep=Math.max(maxStep,step);
 $('intro').hidden=step===5;
 $('wizard').hidden=step===5;
 $('results').hidden=step!==5;
 for(const panel of document.querySelectorAll('[data-step]'))panel.hidden=Number(panel.dataset.step)!==step;
 for(const button of document.querySelectorAll('[data-goto]')){
   const n=Number(button.dataset.goto);
   button.classList.toggle('active',n===step);
   button.classList.toggle('complete',n<step);
   button.disabled=n>maxStep;
 }
 $('back').style.visibility=step===1?'hidden':'visible';
 $('next').textContent=step===4?'Calcular recorrido →':'Continuar →';
 if(step===3) $('map-instructions').after(mapBox);
 if(step===5) $('result-map-slot').append(mapBox);
 if(step===3||step===5){void ensureMap();requestAnimationFrame(()=>invalidateMap());}
 if(step===5)recalculate();
 showError('');
 window.scrollTo({top:0,behavior:'smooth'});
}
function validateWizard(){
 const s=model.scenario;
 if(!Number.isFinite(s.dispatchKg)||s.dispatchKg<=0)return 'Indica una cantidad neta mayor que cero.';
 if(s.storageEnabled&&(!Number.isFinite(s.storageHours)||s.storageHours<0))return 'Revisa las horas de almacenamiento.';
 if(!Number.isFinite(s.returnShare)||s.returnShare<0||s.returnShare>1)return 'El retorno de empaques debe estar entre 0 y 100 %.';
 return '';
}
function locationPair(){return [model.scenario.origin,model.scenario.destination];}
function fitMap(){
 if(!map)return;
 const pts=locationPair();map.fitBounds(L.latLngBounds(pts.map(x=>[x.lat,x.lng])).pad(.22),{maxZoom:11,animate:false});
}
function invalidateMap(){if(!map)return;map.invalidateSize({animate:false,pan:false});if(mapFit){fitMap();mapFit=false;}}
function setMapOverlay(message,warning=false){
 $('map-overlay').textContent=message;
 $('map-overlay').classList.toggle('warn',warning);
 $('map-overlay').hidden=!message;
}
async function loadLeaflet(){
 if(window.L)return true;
 for(const src of ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
                   'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js']){
   const loaded=await new Promise(resolve=>{
     const el=document.createElement('script');
     const timer=setTimeout(()=>resolve(false),5500);
     el.onload=()=>{clearTimeout(timer);resolve(!!window.L);};
     el.onerror=()=>{clearTimeout(timer);resolve(false);};
     el.src=src;el.async=true;document.head.appendChild(el);
   });
   if(loaded)return true;
 }
 return false;
}
async function ensureMap(){
 if(map){invalidateMap();return;}
 setMapOverlay('Cargando cartografía…');
 if(!await loadLeaflet()){
   setMapOverlay('No se pudo cargar el mapa. Usa «Reintentar mapa» o comprueba la conexión.',true);
   return;
 }
 map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([4.8,-74.5],8);
 L.control.zoom({position:'bottomright'}).addTo(map);
 addBaseTiles(false);
 routeLayer=L.layerGroup().addTo(map);
 tollLayer=L.layerGroup().addTo(map);
 markerLayer=L.layerGroup().addTo(map);
 map.on('click',event=>{
  if(!placement)return;
  model.scenario[placement].lat=event.latlng.lat;model.scenario[placement].lng=event.latlng.lng;
  placement=null;$('map-instructions').textContent='Punto actualizado. Puedes arrastrarlo para ajustarlo.';
  mapFit=true;save();renderMarkers();void refreshRoutes();
 });
 renderMarkers();renderMapRoutes();setMapOverlay('');
 if(window.ResizeObserver)new ResizeObserver(()=>invalidateMap()).observe($('map'));
 requestAnimationFrame(()=>{mapFit=true;invalidateMap();});
}
function addBaseTiles(alternative){
 if(!map)return;
 if(tileLayer)map.removeLayer(tileLayer);
 tilesHaveErrors=0;
 tileLayer=L.tileLayer(alternative?'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png':
   'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
   attribution:alternative?'© OpenStreetMap · © CARTO':'© OpenStreetMap contributors'}).addTo(map);
 tileLayer.on('tileerror',()=>{
  if(++tilesHaveErrors===4){
   if(!alternative)addBaseTiles(true);
   else setMapOverlay('El proveedor de mapas no responde. El cálculo de rutas sigue disponible.',true);
  }
 });
}
function markerIcon(letter,color){
 return L.divIcon({className:'',html:'<span class="map-pin" style="background:'+color+'">'+letter+'</span>',
   iconSize:[32,32],iconAnchor:[16,16]});
}
function renderMarkers(){
 if(!map)return;
 markerLayer.clearLayers();
 for(const [key,letter,color] of [['origin','A','#25835b'],['destination','B','#3a75b3']]){
   const point=model.scenario[key];
   const mark=L.marker([point.lat,point.lng],{draggable:true,icon:markerIcon(letter,color)})
     .bindTooltip(esc(point.name),{direction:'top'});
   mark.on('dragend',()=>{
     const p=mark.getLatLng();
     model.scenario[key]={...model.scenario[key],lat:p.lat,lng:p.lng};
     mapFit=true;save();void refreshRoutes();
   });mark.addTo(markerLayer);
 }
}
function drawLeg(leg,color,dashed){
 if(!leg||!map)return;
 L.polyline(leg.coordinates,{color,weight:dashed?3:6,opacity:.9,dashArray:dashed?'7 8':null})
   .bindTooltip((dashed?'Regreso':'Ida')+' · '+fmt(leg.distanceKm,1)+' km'+
     (leg.source==='estimate'?' · distancia aproximada':'')).addTo(routeLayer);
}
function renderMapRoutes(){
 if(!map||!routeLayer)return;
 routeLayer.clearLayers();tollLayer.clearLayers();
 if(routeData){drawLeg(routeData.outbound,'#24865e',false);drawLeg(routeData.returning,'#c08b35',true);}
 const shown=new Set();
 for(const [index,leg] of [routeData?.outbound,routeData?.returning].entries()){
   for(const candidate of leg?.tollCandidates??[]){
     const key=index+':'+candidate.id;
     if(shown.has(key))continue;shown.add(key);
     const color='#bb7d2c';
     L.circleMarker([candidate.lat,candidate.lng],{radius:7,color:'#fff',weight:2,
       fillColor:color,fillOpacity:.95}).bindPopup('<strong>'+esc(candidate.name)+
       '</strong><br>Posible peaje · '+esc(candidate.sector)+
       '<br><small>Verificar cobro, sentido y tarifa.</small>').addTo(tollLayer);
   }
 }
}
function fallbackRoutes(){
 const t=model.parameters.transport,[a,b]=locationPair();
 return {outbound:lineFallback(a,b,t),returning:lineFallback(b,a,t)};
}
function withTolls(routes){
 const vehicle=model.parameters.vehicles.find(v=>v.id===model.scenario.vehicleId);
 if(!vehicle)return routes;
 const process=route=>({...route,tollCandidates:matchTollsToRoute(route,tollCatalog,vehicle.tollCategory)});
 return {outbound:process(routes.outbound),returning:process(routes.returning)};
}
async function loadTolls(){
 try{
  const response=await fetch(new URL('../assets/peajes-region-central.geojson',import.meta.url));
  if(!response.ok)throw Error('Servicio cartográfico no disponible');
  tollCatalog=parseTollCatalog(await response.json());
 }catch{tollCatalog=[];}
 if(routeData){routeData=withTolls(routeData);renderMapRoutes();recalculate();}
}
async function refreshRoutes(){
 const request=++routeRequest,[a,b]=locationPair();
 const config={...model.parameters.transport};
 routeData=withTolls({outbound:lineFallback(a,b,config),returning:lineFallback(b,a,config)});
 renderMarkers();renderMapRoutes();recalculate();
 $('route-status').textContent='Actualizando recorrido vial…';
 try{
   const [outbound,returning]=await Promise.all([fetchRoadLeg(a,b,config),fetchRoadLeg(b,a,config)]);
   if(request!==routeRequest)return;
   routeData=withTolls({outbound,returning});
   renderMapRoutes();recalculate();
   $('route-status').textContent=outbound.source==='osrm'&&returning.source==='osrm'
     ?'Ruta vial calculada. Los peajes son sugerencias espaciales revisables.'
     :'Recorrido geográfico aproximado. Revisa kilómetros y peajes en Parámetros avanzados.';
 }catch(error){
   if(request!==routeRequest)return;
   $('route-status').textContent='Se utiliza una distancia estimada: '+error.message;
 }
}
const amount=(label,value)=>makeLine(label,cop(value));
function renderResults(){
 if(!currentResult)return;
 const r=currentResult;
 $('kpi-total').textContent=cop(r.totalCOP);
 $('kpi-per-accepted').textContent=cop(r.perAcceptedKg)+'/kg';
 $('kpi-accepted').textContent=fmt(r.acceptedKg,1)+' kg';
 $('kpi-vehicles').textContent=r.trucks+' / '+r.returnedTrucks;
 $('kpi-km').textContent=fmt(r.outboundKm+r.returnKm,1)+' km';
 $('kpi-reject').textContent=fmt(r.rejectedKg,1)+' kg';
 $('cost-lines').innerHTML=[
   amount('Empaque y recuperación',r.packagingCOP),
   amount('Cargue en origen',r.loadingCOP),
   amount('Almacenamiento',r.storageCOP),
   amount('Transporte de ida',r.outwardAttributedCOP),
   amount('Descargue en destino',r.unloadingCOP),
   amount('Retorno atribuible',r.returnAttributedCOP),
   amount('Total',r.totalCOP),
   makeLine('COP/kg despachado',cop(r.perDispatchedKg))
 ].join('');
 $('physical-lines').innerHTML=[
   makeLine('Mango despachado',fmt(r.dispatchedKg,1)+' kg'),
   makeLine('Mango aceptado',fmt(r.acceptedKg,1)+' kg'),
   makeLine('Empaques',fmt(r.unitCount)+' unidades'),
   makeLine('Tara del empaque',fmt(r.totalTareKg,1)+' kg'),
   makeLine('Volumen exterior',fmt(r.grossVolumeM3,2)+' m³'),
   makeLine('Capacidad por vehículo',fmt(r.perVehicleCapacity)+' empaques'),
   makeLine('Embalajes devueltos',fmt(r.returnedUnits)+' unidades'),
   makeLine('Volumen de retorno',fmt(r.returnedVolume,2)+' m³'),
   makeLine('Distancia de ida',fmt(r.outboundKm,1)+' km'),
   makeLine('Distancia de vuelta',fmt(r.returnKm,1)+' km'),
   makeLine('Horas de circulación',fmt(r.outboundHours+r.returnHours,1)+' h'),
   makeLine('Costo físico de regreso',cop(r.returnCostPhysicalCOP))
 ].join('');
 const labels={fuel:'Combustible',repairs:'Mantenimiento y repuestos',tires:'Llantas',
   supplies:'Insumos y lubricantes',fixed:'Costos fijos del servicio',vehicleTime:'Tiempo operativo',
   refrigeration:'Refrigeración',tolls:'Peajes'};
 $('transport-components').innerHTML=(r.quoteMode?
  '<p class="hint">La distribución técnica representa costos calculados, no la contabilidad del precio cotizado.</p>':'')
  +r.serviceComponents.map(item=>'<div class="cost-bar"><div><span>'+esc(labels[item.id])+
    '</span><strong>'+cop(item.value)+' · '+fmt(item.pct,1)+' %</strong></div>'+
    '<i style="width:'+Math.min(100,item.pct)+'%"></i></div>').join('');
 const tollView=(label,info,index)=>{
  const sel=tollSelection(info.entries,overridesForLeg(info.entries,model.parameters.transport.tollOverrides,index));
  // "info.entries" ya incluye las sobrescrituras y sirve como lista de visualización.
  return '<div class="toll-card"><strong>'+esc(label)+' · '+cop(info.perTrip)+' / vehículo</strong>'+
    (info.entries.length?'<ul>'+info.entries.map(x=>'<li>'+esc(x.name)+' · categoría '+esc(x.category)+
      ' · '+(x.rateCOP===null?'sin tarifa de referencia':cop(x.rateCOP))+
      (x.enabled?'':' (excluido)')+'</li>').join('')+'</ul>':
      '<p>Sin estaciones asociadas a una ruta vial confirmada; revisa las condiciones del trayecto.</p>')+'</div>';
 };
 $('toll-details').innerHTML=
   tollView('Ida',r.outboundTolls,0)+tollView('Regreso',r.returnTolls,1)+
   '<div class="data-line"><span>Peajes para toda la flota · ida y regreso</span><strong>'+
   cop(r.outboundTollCOP+r.returnTollCOP)+'</strong></div>'+
   '<p class="hint">Las estaciones se identifican por proximidad. Los valores pueden corregirse o excluirse en Parámetros avanzados.</p>';
 $('warnings').innerHTML=r.warnings.map(w=>'<p class="hint caution">• '+esc(w)+'</p>').join('');
}
function recalculate(){
 try{
   if(!routeData)routeData=fallbackRoutes();
   currentResult=calculateMango(model,routeData);
   renderResults();renderLive();showDynamic();
 }catch(error){
   currentResult=null;renderLive();
   $('route-status').textContent='Revisa tus parámetros: '+error.message;
 }
}
function bind(){
 field('dispatchKg','dispatchKg',true);
 field('ripeness','ripeness');
 field('packaging','packagingId');
 field('packagingIncluded','packagingIncluded');
 field('storageEnabled','storageEnabled');
 field('storageHours','storageHours');
 field('vehicle','vehicleId');
 field('preservation','preservation');
 field('returnPackaging','returnPackaging');
 field('returnIncluded','returnIncluded');
 $('returnShare').addEventListener('change',e=>{
  model.scenario.returnShare=Math.max(0,Math.min(1,Number(e.target.value)/100));
  save();showDynamic();recalculate();
 });
 $('originName').addEventListener('change',e=>{
  model.scenario.origin.name=e.target.value;save();renderMarkers();showDynamic();
 });
 $('destinationName').addEventListener('change',e=>{
  model.scenario.destination.name=e.target.value;save();renderMarkers();showDynamic();
 });
 for(const key of ['origin','destination']){
  $('set-'+key).addEventListener('click',()=>{
    placement=placement===key?null:key;
    $('map-instructions').textContent=placement?
      'Pulsa un punto del mapa para establecer '+(key==='origin'?'el origen':'el destino')+'.':
      'Puedes arrastrar los marcadores para ajustar las ubicaciones.';
  });
 }
 $('retry-map').addEventListener('click',()=>{if(map){addBaseTiles(false);invalidateMap();}else void ensureMap();});
 $('next').addEventListener('click',()=>go(Math.min(5,step+1)));
 $('back').addEventListener('click',()=>go(Math.max(1,step-1)));
 $('edit-scenario').addEventListener('click',()=>go(1));
 document.querySelectorAll('[data-goto]').forEach(button=>
  button.addEventListener('click',()=>go(Number(button.dataset.goto))));
 $('reset').addEventListener('click',()=>{
   if(!confirm('¿Restablecer las respuestas y parámetros de referencia?'))return;
   model=defaults();save();syncFields();mapFit=true;void refreshRoutes();go(1);
 });
 $('download-result').addEventListener('click',()=>{
   if(!currentResult)return;
   const payload={createdAt:new Date().toISOString(),scenario:model.scenario,parameters:model.parameters,
     route:routeData,results:currentResult};
   const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='geoflujo-mango-analisis.json';
   link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 });
 window.addEventListener('storage',event=>{
   if(event.key===STORAGE_KEY){model=loadState();syncFields();routeData=withTolls(routeData??fallbackRoutes());recalculate();renderMapRoutes();}
 });
 try{
   const channel=new BroadcastChannel(CHANNEL_NAME);
   channel.onmessage=()=>{model=loadState();syncFields();routeData=withTolls(routeData??fallbackRoutes());recalculate();renderMapRoutes();};
 }catch{/* Synchronization through storage events is available as fallback. */}
 window.addEventListener('resize',()=>invalidateMap());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidateMap();});
}
function start(){
 bind();syncFields();renderLive();go(1);void loadTolls();void refreshRoutes();
}
start();

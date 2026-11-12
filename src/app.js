import {cloneDefaults, SOURCE_REGISTRY} from './catalog.js';
import {calculateScenario} from './engine.js';
import {routeScenario, lineFallback} from './routing.js';
import {parseTollCatalog, matchTollsToRoute, tollSelection} from './tolls.js';

const STORAGE_KEY='geoflujo-agro-mvp-v1';
const $=id=>document.getElementById(id);
const cop=value=>'$ '+new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(value);
const num=(value,digits=1)=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:digits}).format(value);
const pct=value=>num(value*100,2)+' %';
const esc=str=>String(str).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const original=cloneDefaults();
function restore(){
 try{
   const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
   const nodes=stored?.scenario?.nodes;
   const validNodes=['origin','center','destination'].every(k=>Number.isFinite(nodes?.[k]?.lat)&&Number.isFinite(nodes?.[k]?.lng)
     &&Math.abs(nodes[k].lat)<=90&&Math.abs(nodes[k].lng)<=180);
   if(validNodes && Array.isArray(stored?.parameters?.vehicles)){
     const initial=cloneDefaults();
     return {
       scenario:{...initial.scenario,...stored.scenario,
         tollMode:stored.scenario.tollMode??'manual',
         tollOverrides:stored.scenario.tollOverrides??{},
         quoteIncludesTolls:stored.scenario.quoteIncludesTolls??false},
       parameters:{...initial.parameters,...stored.parameters,
         vehicles:stored.parameters.vehicles.map(v=>({
           ...v,tollCategory:v.tollCategory??initial.parameters.vehicles.find(x=>x.id===v.id)?.tollCategory??'I'
         }))}
     };
   }
 }catch{/* localStorage may be unavailable */}
 return cloneDefaults();
}
let state=restore();
let map,markerLayer,routeLayer,tollLayer,baseTiles;
let mapResizeObserver=null,mapBaseFallback=false,tileErrors=0;
let tollCatalog=[],tollDataStatus='loading';
let placement=null;
let routingToken=0;
let comparisonToken=0;
let routes=[],result=null,comparison=null;
const mapColor={origin:'#28805b',center:'#d59b32',destination:'#386cab'};
const TOLL_DATA_URL=new URL('../assets/peajes-region-central.geojson',import.meta.url);
const tollVehicle=()=>state.parameters.vehicles.find(v=>v.id===state.scenario.vehicleId);
function addTollCandidates(legs,scenario=state.scenario){
 const vehicle=state.parameters.vehicles.find(v=>v.id===scenario.vehicleId);
 return legs.map(leg=>({...leg,tollCandidates:matchTollsToRoute(leg,tollCatalog,vehicle?.tollCategory??'I')}));
}
function resetMapView(){
 if(!map)return;
 map.invalidateSize({pan:false,animate:false});
 fitToPoints();
}
async function loadLeaflet(){
 if(window.L)return true;
 const sources=[
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
 ];
 for(const src of sources){
  const loaded=await new Promise(resolve=>{
   const element=document.createElement('script');
   let settled=false;
   const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
   const timer=setTimeout(()=>finish(false),6000);
   element.onload=()=>finish(!!window.L);element.onerror=()=>finish(false);
   element.src=src;element.async=true;document.head.appendChild(element);
  });
  if(loaded&&window.L)return true;
 }
 return false;
}
async function loadTollCatalog(){
 try{
  const response=await fetch(TOLL_DATA_URL,{cache:'no-cache'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  tollCatalog=parseTollCatalog(await response.json());
  tollDataStatus='ready';
  $('toll-data-status').textContent=tollCatalog.length+' estaciones de referencia cargadas. Revisa tarifas y sentido de cobro.';
 }catch(error){
  tollDataStatus='unavailable';
  $('toll-data-status').textContent='No se pudo cargar la base de peajes ('+error.message+'). Utiliza peajes manuales.';
 }
 if(routes.length){
  routes=addTollCandidates(routes);
  drawRoutes();renderFees();recalculate();
 }
}

function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{/* saving is best-effort */}}
function setStatus(text,warning=false){const box=$('map-status');box.textContent=text;box.classList.toggle('warning',warning);}
function currentPreset(){return state.scenario.viaCenter?'acopio':state.scenario.channel;}
function bindInput(id,fn,event='change'){$(id).addEventListener(event,fn);}
function getNodes(){return state.scenario.nodes;}
function getPoints(){const n=getNodes();return state.scenario.viaCenter?[n.origin,n.center,n.destination]:[n.origin,n.destination];}
function textName(point){return getNodes()[point].name;}
function addPointIcon(role,label){return L.divIcon({className:'',html:`<span class="map-pin ${role}">${label}</span>`,iconSize:[32,32],iconAnchor:[16,16]});}
function initializeMap(){
 if(map){resetMapView();drawRoutes();return;}
 if(!window.L){
   $('map').innerHTML='<div class="map-error">No se pudo cargar Leaflet. Intenta «Reintentar mapa»; el cálculo seguirá funcionando.</div>';
   setStatus('Mapa no disponible: bibliotecas cartográficas no accesibles.',true);return;
 }
 $('map').innerHTML='';
 map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([4.9,-74.3],8);
 L.control.zoom({position:'bottomright'}).addTo(map);
 const useTiles=(url,attribution)=>{
   if(baseTiles)map.removeLayer(baseTiles);
   tileErrors=0;
   baseTiles=L.tileLayer(url,{attribution,maxZoom:19}).addTo(map);
   baseTiles.on('tileerror',()=>{
     tileErrors++;
     if(tileErrors>=4 && !mapBaseFallback){
       mapBaseFallback=true;
       useTiles('https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
         '© OpenStreetMap contributors · © CARTO');
       setStatus('La base OpenStreetMap no respondió; se intentó un mapa alternativo.',true);
     }else if(tileErrors>=4 && mapBaseFallback){
       setStatus('No se cargan las teselas del mapa. Revisa tu conexión o usa «Reintentar mapa».',true);
     }
   });
 };
 mapBaseFallback=false;
 useTiles('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
   '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors');
 markerLayer=L.layerGroup().addTo(map);
 routeLayer=L.layerGroup().addTo(map);
 tollLayer=L.layerGroup().addTo(map);
 map.on('click',e=>{
   if(!placement)return;
   state.scenario.nodes[placement]={...state.scenario.nodes[placement],lat:e.latlng.lat,lng:e.latlng.lng};
   persist();renderMarkers();updateControls();setPlacement(null);void refreshRoutes();
 });
 renderMarkers();drawRoutes();
 // Leaflet necesita recalcular dimensiones al desplegarse la cuadrícula y al redimensionar.
 const resized=()=>{if(map)map.invalidateSize({pan:false,animate:false});};
 if(window.ResizeObserver){
   mapResizeObserver=new ResizeObserver(resized);
   mapResizeObserver.observe($('map'));
 }
 window.addEventListener('resize',resized);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)resized();});
 requestAnimationFrame(()=>{resized();fitToPoints();});
 setTimeout(resized,250);
}
async function retryMap(){
 if(!window.L){const loaded=await loadLeaflet();if(!loaded){
   setStatus('No hay acceso a las bibliotecas de mapas. Comprueba el navegador o la conexión.',true);return;
 }}
 if(map){mapBaseFallback=false;tileErrors=0;if(baseTiles)map.removeLayer(baseTiles);
  baseTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'© OpenStreetMap contributors',maxZoom:19
  }).addTo(map);
  baseTiles.on('tileerror',()=>setStatus('No se ha podido descargar alguna tesela. Puedes volver a intentar.',true));
  resetMapView();
 }else initializeMap();
 void refreshRoutes();
}
function setPlacement(which){
 placement=which;
 document.querySelectorAll('[data-place]').forEach(b=>b.classList.toggle('active',b.dataset.place===which));
 document.querySelectorAll('.location-card').forEach(c=>c.classList.toggle('placing',c.classList.contains(which)));
 if(which){setStatus('Haz clic en el mapa para ubicar '+({'origin':'el origen','center':'el acopio','destination':'el destino'}[which])+'.');}
}
function renderMarkers(){
 if(!map)return;
 markerLayer.clearLayers();
 const labels=state.scenario.viaCenter?{origin:'A',center:'B',destination:'C'}:{origin:'A',destination:'B'};
 Object.entries(labels).forEach(([role,label])=>{
   const n=getNodes()[role];
   const marker=L.marker([n.lat,n.lng],{draggable:true,icon:addPointIcon(role,label)}).bindTooltip(esc(n.name),{direction:'top',offset:[0,-16]});
   marker.on('dragend',()=>{
     const ll=marker.getLatLng();state.scenario.nodes[role]={...n,lat:ll.lat,lng:ll.lng};
     persist();updateControls();void refreshRoutes();
   });
   marker.addTo(markerLayer);
 });
}
function fitToPoints(){
 if(!map)return;
 const bounds=L.latLngBounds(getPoints().map(n=>[n.lat,n.lng]));
 map.fitBounds(bounds.pad(.25),{maxZoom:12,animate:false});
}
function renderTollMarkers(){
 if(!map||!tollLayer)return;
 tollLayer.clearLayers();
 const seen=new Set();
 const all=routes.flatMap(leg=>tollSelection(leg.tollCandidates??[],state.scenario.tollOverrides).entries);
 for(const toll of all){
   if(seen.has(toll.id))continue;seen.add(toll.id);
   L.circleMarker([toll.lat,toll.lng],{
     radius:7,weight:2,color:'#fff',fillColor:toll.enabled?'#c18225':'#959f98',fillOpacity:.95
   }).bindPopup('<strong>'+esc(toll.name)+'</strong><br>Cat. '+esc(toll.category)+
     ' · '+(toll.rateCOP===null?'Tarifa pendiente':cop(toll.rateCOP))+
     '<br>'+esc(toll.sector)+'<br><small>Coincidencia por proximidad, verificar cobro.</small>')
     .addTo(tollLayer);
 }
}
function drawRoutes(){
 if(!map)return;
 routeLayer.clearLayers();
 const colors=['#28805b','#d59b32'];
 routes.forEach((leg,index)=>{
   L.polyline(leg.coordinates,{color:colors[index],weight:5,opacity:.87,dashArray:leg.source==='estimate'?'8 9':null})
    .bindTooltip(`Tramo ${index+1} · ${num(leg.distanceKm,1)} km · ${leg.source==='osrm'?'Ruta OSRM':'Estimación'}`).addTo(routeLayer);
 });
 renderTollMarkers();map.invalidateSize({pan:false,animate:false});fitToPoints();
}
async function refreshRoutes(){
 const request=++routingToken;
 comparisonToken++;
 const snapshot=structuredClone(state.scenario);
 const points=snapshot.viaCenter?
  [snapshot.nodes.origin,snapshot.nodes.center,snapshot.nodes.destination]:
  [snapshot.nodes.origin,snapshot.nodes.destination];
 const config={...state.parameters.routing};
 // Provisional inmediata; evita mostrar la ruta anterior mientras OSRM responde.
 routes=addTollCandidates(points.slice(1).map((point,i)=>lineFallback(points[i],point,config)),snapshot);
 drawRoutes();renderFees();recalculate();
 setStatus('Ruta provisional visible; consultando la red vial para reemplazarla…',true);
 $('btn-route').disabled=true;
 try{
   const newRoutes=await routeScenario(snapshot,config);
   if(request!==routingToken)return;
   routes=addTollCandidates(newRoutes,snapshot);
   drawRoutes();renderFees();recalculate();
   const fallback=newRoutes.some(r=>r.source!=='osrm');
   setStatus(fallback?
     'OSRM no respondió en algún tramo: distancia estimada, sin identificación automática de peajes.':
     'Recorrido vial actualizado. Revisa las coincidencias de peajes y su tarifa.',fallback);
 }catch(error){
   if(request!==routingToken)return;
   setStatus('No se pudo actualizar la ruta vial: '+error.message+'. Se conserva la estimación visible.',true);
 }finally{if(request===routingToken)$('btn-route').disabled=false;}
}
function recalculate(){
 comparison=null;
 try{result=calculateScenario({scenario:state.scenario,parameters:state.parameters,legs:routes});}
 catch(error){result=null;setStatus(error.message,true);}
 renderResults();
}
function updateControls(){
 const s=state.scenario,p=state.parameters;
 $('dispatch').value=s.dispatchKg;
 $('vehicle').innerHTML=p.vehicles.map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${num(v.capacityKg,0)} kg</option>`).join('');
 $('vehicle').value=s.vehicleId;
 $('preset').value=currentPreset();
 $('preset-note').textContent=s.viaCenter?'Dos tramos: finca → acopio → mercado. Las tarifas de peajes y cotizaciones se parametrizan por tramo.':s.channel==='wholesale'?'Tramo directo hacia mayorista; se utiliza una merma mayorista de referencia.':'Un solo tramo desde finca hasta comprador; selección y manipulación básicas.';
 $('center-card').style.display=s.viaCenter?'block':'none';
 $('center-legend').style.display=s.viaCenter?'inline':'none';
 $('dest-letter').textContent=s.viaCenter?'C':'B';
 $('name-origin').value=s.nodes.origin.name;
 $('name-center').value=s.nodes.center.name;
 $('name-destination').value=s.nodes.destination.name;
 $('empty-return').checked=s.includeEmptyReturn;
 $('transport-method').value=s.transportMethod;
 $('toll-mode').value=s.tollMode??'manual';
 $('quote-includes-tolls').checked=s.quoteIncludesTolls===true;
 $('quote-includes-wrap').style.display=s.transportMethod==='quote'?'flex':'none';
 $('map-subtitle').textContent=getPoints().map(n=>n.name.split(' (')[0]).join(' → ');
 renderFees();renderParams();
}
function renderFees(){
 const s=state.scenario;
 const count=s.viaCenter?2:1;
 const auto=s.tollMode==='auto';
 const vehicle=tollVehicle();
 $('route-fees').innerHTML=Array.from({length:count},(_,i)=>{
  const manual=(s.viaCenter?s.centerTolls:s.tolls)[i]??0;
  const quote=(s.viaCenter?s.centerQuotes:s.quotes)[i]??0;
  const title=count===1?'Origen → destino':i===0?'Origen → acopio':'Acopio → destino';
  const leg=routes[i];
  const selection=tollSelection(leg?.tollCandidates??[],s.tollOverrides??{});
  const source=leg?.source==='osrm'?'ruta OSRM':'sin ruta vial validada';
  const candidates=auto?(selection.entries.length?selection.entries.map((t,j)=>
   `<div class="toll-candidate">
     <label class="toll-check"><input type="checkbox" id="toll-use-${i}-${j}" ${t.enabled?'checked':''}>
       <span><strong>${esc(t.name)}</strong><small>${esc(t.sector)} · a ${num(t.distanceM,0)} m de la ruta</small></span>
     </label>
     <label>Tarifa cat. ${esc(t.category)} (COP)<input id="toll-rate-${i}-${j}" type="number" min="0" step="100" value="${t.rateCOP??''}" placeholder="Sin dato"></label>
   </div>`).join(''):`<p class="toll-warning">${leg?.source==='osrm'?'No se identificaron peajes cercanos; verifica antes de asumir que el tramo no tiene cobros.':'No es posible identificar peajes sobre una ruta estimada. Puedes usar el importe manual.'}</p>`):'';
  return `<div class="fee-card">
   <strong>Tramo ${i+1} · ${title}</strong>
   <p class="toll-totals">${auto?'Peajes sugeridos ('+esc(vehicle?.tollCategory??'?')+'): '+cop(selection.perTrip):'Peajes ingresados: '+cop(manual)} por viaje</p>
   ${auto?`<p class="toll-source">Fuente: ${esc(source)} · base INVÍAS de referencia, tarifas por revisar</p>`:''}
   <div class="fee-field"><label for="toll-${i}">Peajes manuales (COP/viaje)</label><input type="number" min="0" step="100" id="toll-${i}" value="${manual}" ${auto?'disabled':''}></div>
   <div class="fee-field"><label for="quote-${i}">Cotización de transporte (COP/viaje)</label><input type="number" min="0" step="100" id="quote-${i}" value="${quote}" ${s.transportMethod==='km'?'disabled':''}></div>
   ${auto?`<div class="toll-candidates">${candidates}</div>`:''}
  </div>`;
 }).join('');
 for(let i=0;i<count;i++){
  $('toll-'+i).addEventListener('change',e=>{
   const array=s.viaCenter?'centerTolls':'tolls';
   s[array][i]=Math.max(0,+e.target.value||0);persist();renderFees();recalculate();
  });
  $('quote-'+i).addEventListener('change',e=>{
   const array=s.viaCenter?'centerQuotes':'quotes';
   s[array][i]=Math.max(0,+e.target.value||0);persist();recalculate();
  });
  const selected=tollSelection(routes[i]?.tollCandidates??[],s.tollOverrides??{}).entries;
  if(auto)selected.forEach((t,j)=>{
   $('toll-use-'+i+'-'+j).addEventListener('change',e=>{
    const old=s.tollOverrides?.[t.id]??{};
    s.tollOverrides={...s.tollOverrides,[t.id]:{...old,enabled:e.target.checked}};
    persist();renderFees();drawRoutes();recalculate();
   });
   $('toll-rate-'+i+'-'+j).addEventListener('change',e=>{
    const raw=e.target.value.trim(),amount=raw===''?null:Number(raw);
    if(amount!==null&&(!Number.isFinite(amount)||amount<0)){renderFees();return;}
    const old=s.tollOverrides?.[t.id]??{};
    s.tollOverrides={...s.tollOverrides,[t.id]:{...old,rateCOP:amount}};
    persist();renderFees();drawRoutes();recalculate();
   });
  });
 }
}
const PARAM_FIELDS=[
 ['operations.selectionPerKg.value','Acondicionamiento (COP/kg)','SRC_CAL_LAB_2026'],
 ['operations.loadingPerKg.value','Cargue (COP/kg)','SRC_COSTOS'],
 ['operations.unloadingPerKg.value','Descargue (COP/kg)','SRC_COSTOS'],
 ['operations.consolidationPerKg.value','Consolidación (COP/kg)','SRC_COSTOS'],
 ['losses.direct.value','Merma venta directa (%)','SRC_DANE_MANGO_TUNJA_2019'],
 ['losses.wholesale.value','Merma mayorista (%)','SRC_DANE_MANGO_TUNJA_2019'],
 ['losses.atCenter.value','Merma en acopio (%)','SRC_SUPUESTO'],
 ['packaging.kgPerCrate','Canastilla (kg/unidad)','SRC_AGROSAVIA_MANGO_2025'],
 ['packaging.crateCost','Costo canastilla (COP/unidad)','SRC_AGROSAVIA_MANGO_2025']
];
function nestedValue(root,path){return path.split('.').reduce((o,key)=>o[key],root);}
function setNestedValue(root,path,value){
 const keys=path.split('.');const last=keys.pop();const obj=keys.reduce((o,key)=>o[key],root);obj[last]=value;
}
function renderParams(){
 const p=state.parameters;
 const fields=PARAM_FIELDS.map(([path,label,src],i)=>{
   const raw=nestedValue(p,path);const perc=path.startsWith('losses.');
   return `<label>${esc(label)}<input type="number" min="0" step="${perc?'0.01':'0.1'}" id="param-${i}" value="${perc?raw*100:raw}"><span class="source-hint">${esc(src)}</span></label>`;
 }).join('');
 const vehicle=p.vehicles.find(v=>v.id===state.scenario.vehicleId);
 $('parameter-fields').innerHTML=fields+`<label>Capacidad vehículo (kg)<input type="number" min="1" step="100" id="v-cap" value="${vehicle.capacityKg}"><span class="source-hint">${vehicle.source}</span></label><label>Tarifa vehículo (COP/km)<input type="number" min="0" step="1" id="v-cost" value="${vehicle.costPerKm}"><span class="source-hint">${vehicle.source}</span></label><label class="inline-check"><input type="checkbox" id="selection" ${state.scenario.applySelection?'checked':''}> Aplicar selección en finca</label>`;
 PARAM_FIELDS.forEach(([path,,],i)=>{
  $('param-'+i).addEventListener('change',e=>{
   const raw=+e.target.value;const perc=path.startsWith('losses.');
   if(!Number.isFinite(raw)||raw<0||(perc&&raw>=100)) {updateControls();setStatus('Parámetro no válido; se requiere valor no negativo y tasas inferiores a 100 %.',true);return;}
   if(path==='packaging.kgPerCrate'&&raw<=0){updateControls();setStatus('La capacidad de la canastilla debe superar cero.',true);return;}
   setNestedValue(state.parameters,path,perc?raw/100:raw);persist();recalculate();
  });
 });
 $('v-cap').addEventListener('change',e=>{if(+e.target.value>0){vehicle.capacityKg=+e.target.value;persist();recalculate();updateControls();}else updateControls();});
 $('v-cost').addEventListener('change',e=>{if(+e.target.value>=0){vehicle.costPerKm=+e.target.value;persist();recalculate();}else updateControls();});
 $('selection').addEventListener('change',e=>{state.scenario.applySelection=e.target.checked;persist();recalculate();});
}
function makeBar(label,value,total,color){const pct=total?Math.min(100,value/total*100):0;return `<div class="cost-line"><div class="cost-head"><span>${esc(label)}</span><strong>${cop(value)}</strong></div><div class="bar-bg"><i style="width:${pct}%;background:${color}"></i></div></div>`;}
function renderResults(){
 if(!result){['kpi-total','kpi-perkg','kpi-received','kpi-loss','kpi-distance','kpi-time'].forEach(id=>$(id).textContent='—');$('cost-breakdown').innerHTML='';$('leg-breakdown').innerHTML='';$('warnings').innerHTML='<li>Define el recorrido para realizar el cálculo.</li>';return;}
 $('kpi-total').textContent=cop(result.totalCOP);
 $('kpi-perkg').textContent=cop(result.costPerDeliveredKg)+' /kg';
 $('kpi-received').textContent=num(result.deliveredKg,1)+' kg';
 $('kpi-loss').textContent=num(result.logisticsLossKg,1)+' kg ('+pct(result.logisticsLossKg/result.initialKg)+')';
 $('kpi-distance').textContent=num(result.distanceKm,1)+' km';
 $('kpi-time').textContent=num(result.elapsedHours,1)+' h';
 $('cost-breakdown').innerHTML=makeBar('Transporte y peajes',result.transportCOP,result.totalCOP,'#28805b')+makeBar('Manipulación',result.handlingCOP,result.totalCOP,'#d59b32')+makeBar('Empaque',result.packagingCOP,result.totalCOP,'#386cab')+`<p class="muted">Costo por kg despachado: ${cop(result.costPerDispatchedKg)} · ${result.crateCount} canastillas.</p>`;
 $('leg-breakdown').innerHTML=result.legs.map((leg,i)=>`<div class="leg-card"><div><strong>Tramo ${i+1}: ${esc(getPoints()[i].name.split(' (')[0])} → ${esc(getPoints()[i+1].name.split(' (')[0])}</strong><span class="${leg.source==='osrm'?'tag-osrm':'tag-est'}">${leg.source==='osrm'?'OSRM':'ESTIMADO'}</span></div><p>${num(leg.distanceKm,1)} km · ${num(leg.durationMin/60,2)} h · ${leg.trips} viaje(s) · ${num(leg.inputKg,1)} kg · ${cop(leg.costCOP)}</p></div>`).join('');
 $('warnings').innerHTML=result.warnings.map(w=>`<li>${esc(w)}</li>`).join('');
 if(!comparison)$('comparison').innerHTML='';
}
async function runComparison(){
 const req=++comparisonToken;
 const button=$('btn-compare');button.disabled=true;button.textContent='Comparando…';
 try{
  const make=v=>({...state.scenario,viaCenter:v});
  const direct=make(false),center=make(true);
  const [routeDirect,routeCenter]=await Promise.all([
   routeScenario(direct,state.parameters.routing),routeScenario(center,state.parameters.routing)
  ]);
  if(req!==comparisonToken)return;
  const a=calculateScenario({scenario:direct,parameters:state.parameters,legs:addTollCandidates(routeDirect,direct)});
  const b=calculateScenario({scenario:center,parameters:state.parameters,legs:addTollCandidates(routeCenter,center)});
  comparison={a,b};
  $('comparison').innerHTML=`<table class="compare-table"><thead><tr><th>Indicador</th><th>Directo</th><th>Con acopio</th></tr></thead><tbody><tr><td>Costo total</td><td>${cop(a.totalCOP)}</td><td>${cop(b.totalCOP)}</td></tr><tr><td>COP/kg recibido</td><td>${cop(a.costPerDeliveredKg)}</td><td>${cop(b.costPerDeliveredKg)}</td></tr><tr><td>Kg recibidos</td><td>${num(a.deliveredKg,1)}</td><td>${num(b.deliveredKg,1)}</td></tr><tr><td>Km de ida</td><td>${num(a.distanceKm,1)}</td><td>${num(b.distanceKm,1)}</td></tr></tbody></table><p class="muted">Comparación orientativa. Revisa especialmente peajes por tramo y la ubicación de acopio antes de concluir.</p>`;
 }catch(error){$('comparison').textContent='No se pudo comparar: '+error.message;}
 finally{button.disabled=false;button.textContent='Comparar directo vs. acopio';}
}
function downloadModel(){
 const data={schema:'geoflujo-agro-escenarios/v1',savedAt:new Date().toISOString(),...state};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download='geoflujo-agro-escenario.json';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function isValidImport(d){return d?.schema==='geoflujo-agro-escenarios/v1' && Number.isFinite(d.scenario?.dispatchKg)&& d.scenario.dispatchKg>0 && !!d.scenario?.nodes?.origin && !!d.scenario?.nodes?.destination && !!d.scenario?.nodes?.center && Array.isArray(d.parameters?.vehicles) && !!d.parameters?.operations && !!d.parameters?.losses;}
async function importModel(file){
 try{const data=JSON.parse(await file.text());if(!isValidImport(data))throw Error('El archivo no corresponde al formato de GeoFlujo Agro.');
  state={parameters:data.parameters,scenario:data.scenario};persist();setPlacement(null);updateControls();renderMarkers();void refreshRoutes();setStatus('Escenario importado.');
 }catch(error){setStatus('Importación no realizada: '+error.message,true);}
}
function bindControls(){
 bindInput('dispatch',e=>{state.scenario.dispatchKg=+e.target.value;persist();recalculate();});
 bindInput('vehicle',e=>{state.scenario.vehicleId=e.target.value;persist();routes=addTollCandidates(routes);updateControls();drawRoutes();recalculate();});
 bindInput('preset',e=>{
  const value=e.target.value;
  state.scenario.viaCenter=value==='acopio';state.scenario.channel=value==='direct'?'direct':'wholesale';
  persist();updateControls();renderMarkers();void refreshRoutes();
 });
 bindInput('transport-method',e=>{state.scenario.transportMethod=e.target.value;persist();updateControls();recalculate();});
 bindInput('toll-mode',e=>{state.scenario.tollMode=e.target.value;persist();renderFees();drawRoutes();recalculate();});
 bindInput('quote-includes-tolls',e=>{state.scenario.quoteIncludesTolls=e.target.checked;persist();recalculate();});
 bindInput('empty-return',e=>{state.scenario.includeEmptyReturn=e.target.checked;persist();recalculate();});
 for(const point of ['origin','center','destination']){
   bindInput('name-'+point,e=>{state.scenario.nodes[point].name=e.target.value;persist();renderMarkers();$('map-subtitle').textContent=getPoints().map(n=>n.name.split(' (')[0]).join(' → ');recalculate();});
   $('place-'+point).addEventListener('click',()=>setPlacement(placement===point?null:point));
 }
 $('btn-route').addEventListener('click',()=>void refreshRoutes());
 $('btn-map-retry').addEventListener('click',()=>void retryMap());
 $('btn-compare').addEventListener('click',()=>void runComparison());
 $('btn-export').addEventListener('click',downloadModel);
 $('file-import').addEventListener('change',e=>{if(e.target.files?.[0])void importModel(e.target.files[0]);e.target.value='';});
 $('btn-reset').addEventListener('click',()=>{
  if(!window.confirm('¿Restablecer los parámetros y el recorrido del ejemplo inicial?'))return;
  state=cloneDefaults();persist();setPlacement(null);updateControls();renderMarkers();void refreshRoutes();
 });
}
async function boot(){
 bindControls();updateControls();
 // El cálculo no depende de que Leaflet se haya podido descargar.
 void loadTollCatalog();void refreshRoutes();
 if(await loadLeaflet())initializeMap();
 else{
  $('map').innerHTML='<div class="map-error">Mapa no disponible: la biblioteca Leaflet no se pudo descargar. Prueba «Reintentar mapa».</div>';
  setStatus('Mapa no disponible. Los resultados pueden seguir calculándose, pero se necesita conexión para la vista.',true);
 }
 console.info('GeoFlujo Agro / fuentes del piloto:',SOURCE_REGISTRY.map(s=>s.id).join(', '));
}
void boot();

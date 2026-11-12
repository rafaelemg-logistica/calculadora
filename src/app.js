import {cloneDefaults, SOURCE_REGISTRY} from './catalog.js';
import {calculateScenario} from './engine.js';
import {routeScenario} from './routing.js';

const STORAGE_KEY='geoflujo-agro-mvp-v1';
const $=id=>document.getElementById(id);
const cop=value=>'$ '+new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(value);
const num=(value,digits=1)=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:digits}).format(value);
const pct=value=>num(value*100,2)+' %';
const esc=str=>String(str).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const original=cloneDefaults();
function restore(){
 try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));
   if(stored?.scenario?.nodes && Array.isArray(stored?.parameters?.vehicles))return stored;
 }catch{/* localStorage may be unavailable */}
 return cloneDefaults();
}
let state=restore();
let map,markerLayer,routeLayer;
let placement=null;
let routingToken=0;
let comparisonToken=0;
let routes=[],result=null,comparison=null;
const mapColor={origin:'#28805b',center:'#d59b32',destination:'#386cab'};
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{/* saving is best-effort */}}
function setStatus(text,warning=false){const box=$('map-status');box.textContent=text;box.classList.toggle('warning',warning);}
function currentPreset(){return state.scenario.viaCenter?'acopio':state.scenario.channel;}
function bindInput(id,fn,event='change'){$(id).addEventListener(event,fn);}
function getNodes(){return state.scenario.nodes;}
function getPoints(){const n=getNodes();return state.scenario.viaCenter?[n.origin,n.center,n.destination]:[n.origin,n.destination];}
function textName(point){return getNodes()[point].name;}
function addPointIcon(role,label){return L.divIcon({className:'',html:`<span class="map-pin ${role}">${label}</span>`,iconSize:[32,32],iconAnchor:[16,16]});}
function initializeMap(){
 if(typeof L==='undefined'){
   $('map').innerHTML='<div style="padding:45px;text-align:center">No se pudo cargar la biblioteca Leaflet. Comprueba tu conexión a Internet.</div>';
   setStatus('Mapa no disponible. Puedes editar cantidades y parámetros.',true);return;
 }
 map=L.map('map',{zoomControl:false}).setView([4.9,-74.3],8);
 L.control.zoom({position:'bottomright'}).addTo(map);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
   attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19
 }).addTo(map);
 markerLayer=L.layerGroup().addTo(map);
 routeLayer=L.layerGroup().addTo(map);
 map.on('click',e=>{
   if(!placement)return;
   state.scenario.nodes[placement]={...state.scenario.nodes[placement],lat:e.latlng.lat,lng:e.latlng.lng};
   persist();renderMarkers();updateControls();setPlacement(null);void refreshRoutes();
 });
 renderMarkers();
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
function drawRoutes(){
 if(!map)return;
 routeLayer.clearLayers();
 const colors=['#28805b','#d59b32'];
 routes.forEach((leg,index)=>{
   L.polyline(leg.coordinates,{color:colors[index],weight:5,opacity:.87,dashArray:leg.source==='estimate'?'8 9':null})
    .bindTooltip(`Tramo ${index+1} · ${num(leg.distanceKm,1)} km · ${leg.source==='osrm'?'Ruta OSRM':'Estimación'}`).addTo(routeLayer);
 });
 fitToPoints();
}
async function refreshRoutes(){
 const request=++routingToken;
 comparisonToken++;
 setStatus('Calculando recorrido vial…');
 $('btn-route').disabled=true;
 try{
   const newRoutes=await routeScenario(state.scenario,state.parameters.routing);
   if(request!==routingToken)return;
   routes=newRoutes;drawRoutes();recalculate();
   const fallback=newRoutes.some(r=>r.source!=='osrm');
   setStatus(fallback?'Ruta estimada: OSRM no respondió para al menos un tramo.':'Recorrido vial calculado con OSRM.',fallback);
 }catch(error){
   if(request!==routingToken)return;
   routes=[];result=null;
   setStatus('No se pudo estimar el recorrido: '+error.message,true);
   renderResults();
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
 $('map-subtitle').textContent=getPoints().map(n=>n.name.split(' (')[0]).join(' → ');
 renderFees();renderParams();
}
function renderFees(){
 const s=state.scenario;
 const count=s.viaCenter?2:1;
 const fees=$('route-fees');
 fees.innerHTML=Array.from({length:count},(_,i)=>{
  const toll=(s.viaCenter?s.centerTolls:s.tolls)[i]??0;
  const quote=(s.viaCenter?s.centerQuotes:s.quotes)[i]??0;
  const title=count===1?'Origen → destino':i===0?'Origen → acopio':'Acopio → destino';
  return `<div class="fee-card"><strong>Tramo ${i+1} · ${title}</strong><div><label for="toll-${i}">Peajes (COP/viaje)</label><input type="number" min="0" step="100" id="toll-${i}" value="${toll}"></div><div><label for="quote-${i}">Cotización COP/viaje</label><input type="number" min="0" step="100" id="quote-${i}" value="${quote}" ${s.transportMethod==='km'?'disabled':''}></div></div>`;
 }).join('');
 for(let i=0;i<count;i++){
  $('toll-'+i).addEventListener('change',e=>{
   const array=s.viaCenter?'centerTolls':'tolls';s[array][i]=Math.max(0,+e.target.value||0);persist();recalculate();
  });
  $('quote-'+i).addEventListener('change',e=>{
   const array=s.viaCenter?'centerQuotes':'quotes';s[array][i]=Math.max(0,+e.target.value||0);persist();recalculate();
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
  const routeDirect=await routeScenario(direct,state.parameters.routing);
  const routeCenter=await routeScenario(center,state.parameters.routing);
  if(req!==comparisonToken)return;
  const a=calculateScenario({scenario:direct,parameters:state.parameters,legs:routeDirect});
  const b=calculateScenario({scenario:center,parameters:state.parameters,legs:routeCenter});
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
 bindInput('vehicle',e=>{state.scenario.vehicleId=e.target.value;persist();updateControls();recalculate();});
 bindInput('preset',e=>{
  const value=e.target.value;
  state.scenario.viaCenter=value==='acopio';state.scenario.channel=value==='direct'?'direct':'wholesale';
  persist();updateControls();renderMarkers();void refreshRoutes();
 });
 bindInput('transport-method',e=>{state.scenario.transportMethod=e.target.value;persist();renderFees();recalculate();});
 bindInput('empty-return',e=>{state.scenario.includeEmptyReturn=e.target.checked;persist();recalculate();});
 for(const point of ['origin','center','destination']){
   bindInput('name-'+point,e=>{state.scenario.nodes[point].name=e.target.value;persist();renderMarkers();$('map-subtitle').textContent=getPoints().map(n=>n.name.split(' (')[0]).join(' → ');recalculate();});
   $('place-'+point).addEventListener('click',()=>setPlacement(placement===point?null:point));
 }
 $('btn-route').addEventListener('click',()=>void refreshRoutes());
 $('btn-compare').addEventListener('click',()=>void runComparison());
 $('btn-export').addEventListener('click',downloadModel);
 $('file-import').addEventListener('change',e=>{if(e.target.files?.[0])void importModel(e.target.files[0]);e.target.value='';});
 $('btn-reset').addEventListener('click',()=>{
  if(!window.confirm('¿Restablecer los parámetros y el recorrido del ejemplo inicial?'))return;
  state=cloneDefaults();persist();setPlacement(null);updateControls();renderMarkers();void refreshRoutes();
 });
}
function boot(){
 bindControls();updateControls();initializeMap();void refreshRoutes();
 console.info('GeoFlujo Agro / fuentes del piloto:',SOURCE_REGISTRY.map(s=>s.id).join(', '));
}
boot();

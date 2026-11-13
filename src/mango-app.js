import {defaults,loadState,storeState,readyToCalculate,validateParameters} from './config.js';
import {calculateMango} from './mango-engine.js';
import {fetchRoadAlternatives,fetchRoadLeg,lineFallback,hasPoint} from './routing.js';
import {parseTollCatalog,tollSelection} from './tolls.js';
import {routeKey,selectAlternative,attachTolls,alternativeResult,applyParameters} from './route-choice.js';
import {searchLocations,reverseLocation,fallbackCoordinateLabel} from './geocode.js';

const $=id=>document.getElementById(id);
const money=v=>'$ '+new Intl.NumberFormat('es-CO',{maximumFractionDigits:0}).format(v);
const fmt=(v,d=0)=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:d}).format(v);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ripeness={verde:'verde maduro',pinton:'pintón',maduro:'maduro'};
const baseCenter=[4.8,-74.3];
let model=loadState(),step=1,maxStep=1,currentResult=null;
let alternatives=[],returnLeg=null,selectedIndex=0,currentKey=null,requestSeq=0,tollCatalog=[];
let map=null,markers=null,routeLayer=null,tollLayer=null,tiles=null,placement=null,needFit=true;
let mapPromise=null,baseChanged=false,tileErrors=0,mapResizeObserver=null;
let advancedFrameLoaded=false,lastFocused=null,toastTimer=null;
const reverseTokens={origin:0,destination:0};

function save(){storeState(model);}
function showError(message){
 $('wizard-error').textContent=message;
 $('wizard-error').hidden=!message;
}
function showToast(message){
 const toast=$('toast');toast.textContent=message;toast.hidden=false;
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.hidden=true,5000);
}
function line(label,value){
 return '<div class="data-line"><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong></div>';
}
function syncedCoords(key){
 const p=model.scenario[key];return hasPoint(p)?p:null;
}
function bothPoints(){return Boolean(syncedCoords('origin')&&syncedCoords('destination'));}
function mapPoints(){return [syncedCoords('origin'),syncedCoords('destination')].filter(Boolean);}
function activeRoute(){return selectAlternative(alternatives,selectedIndex);}
function routePair(){
 const selected=activeRoute();
 if(!selected||!returnLeg)return null;
 const v=model.parameters.vehicles.find(x=>x.id===model.scenario.vehicleId);
 return {outbound:attachTolls(selected,tollCatalog,v),returning:attachTolls(returnLeg,tollCatalog,v)};
}
function routeStatus(text,warning=false){
 $('route-status').textContent=text;
 $('route-status').classList.toggle('warning',warning);
 $('map-caption').textContent=text;
}
function updateFields(){
 const s=model.scenario,p=model.parameters;
 $('dispatchKg').value=s.dispatchKg??'';
 $('ripeness').value=s.ripeness;
 $('packaging').innerHTML=p.packaging.map(x=>'<option value="'+escapeHTML(x.id)+'">'+
  escapeHTML(x.name)+' · '+fmt(x.capacityKg)+' kg</option>').join('');
 $('packaging').value=s.packagingId;
 $('packagingIncluded').checked=s.packagingIncluded;
 $('storageEnabled').checked=s.storageEnabled;$('storageHours').value=s.storageHours;
 $('vehicle').innerHTML=p.vehicles.map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.name)+'</option>').join('');
 $('vehicle').value=s.vehicleId;
 $('preservation').value=s.preservation;
 $('originName').value=s.origin.name;$('destinationName').value=s.destination.name;
 $('returnPackaging').checked=s.returnPackaging;
 $('returnShare').value=Math.round(s.returnShare*100);
 $('returnIncluded').checked=s.returnIncluded;
 updateDynamic();renderLive();
}
function updateDynamic(){
 const s=model.scenario,p=model.parameters;
 $('storage-row').hidden=!s.storageEnabled;
 const box=p.packaging.find(x=>x.id===s.packagingId);
 $('returnPackaging').disabled=!box?.returnable;
 $('return-share-row').hidden=!s.returnPackaging||!box?.returnable;
 $('returnShare').disabled=!s.returnPackaging||!box?.returnable;
 const veh=p.vehicles.find(x=>x.id===s.vehicleId);
 $('vehicle-description').textContent=veh?
   veh.name+' · '+fmt(veh.payloadKg)+' kg de carga útil · '+fmt(veh.volumeM3,1)+' m³'+
   (veh.coldCapable?' · admite refrigeración':' · no admite refrigeración'):'Selecciona el vehículo.';
 $('ripeness-note').textContent='Conservación de referencia para mango '+(ripeness[s.ripeness]??'fresco')+
  ': alrededor de '+p.product.temperature[s.ripeness]+' °C. El valor depende de la madurez.';
 $('temperature-note').textContent=s.preservation==='refrigerado'?
  'Refrigeración configurada: '+p.product.temperature[s.ripeness]+' °C de referencia.':
  'Transporte a temperatura ambiente. Verifica ventilación, madurez y duración del recorrido.';
 $('result-route-title').textContent=(s.origin.name||'Origen')+' → '+(s.destination.name||'Destino');
 if(currentResult)$('return-fleet').textContent=currentResult.trucks+' vehículo(s) de ida y '+currentResult.returnedTrucks+' de regreso.';
 else $('return-fleet').textContent='Los vehículos se determinan por el peso y el volumen del despacho.';
}
function renderLive(){
 const s=model.scenario,box=model.parameters.packaging.find(x=>x.id===s.packagingId);
 const vehicle=model.parameters.vehicles.find(x=>x.id===s.vehicleId);
 $('live-summary').innerHTML=[
  line('Cantidad',Number.isFinite(s.dispatchKg)&&s.dispatchKg>0?fmt(s.dispatchKg,1)+' kg':'Sin ingresar'),
  line('Empaque',box?.name??'—'),
  line('Madurez',ripeness[s.ripeness]??'—'),
  line('Vehículo',vehicle?.name??'—'),
  ...(currentResult?[line('Unidades de carga',fmt(currentResult.unitCount)),
   line('Vehículos',fmt(currentResult.trucks)),
   line('Costo logístico',money(currentResult.totalCOP))]:[])
 ].join('');
}
function validateStep(n){
 const s=model.scenario;
 if(n===1&&(!Number.isFinite(s.dispatchKg)||s.dispatchKg<=0))
  return 'Ingresa una cantidad neta de mango mayor que cero.';
 if(n===2&&s.storageEnabled&&(!Number.isFinite(s.storageHours)||s.storageHours<=0))
  return 'Indica cuántas horas permanecerá almacenado el mango.';
 if(n===3&&!bothPoints())
  return 'Selecciona un origen y un destino en el mapa o mediante la búsqueda.';
 if(n===4&&(!Number.isFinite(s.returnShare)||s.returnShare<0||s.returnShare>1))
  return 'El porcentaje de empaques debe estar entre 0 y 100 %.';
 return '';
}
function go(target){
 if(target<1||target>5)return;
 if(target>step){
  for(let i=step;i<Math.min(target,5);i++){
   const problem=validateStep(i);
   if(problem){showError(problem);return;}
  }
 }
 if(target===5){
  for(let i=1;i<=4;i++){
   const problem=validateStep(i);
   if(problem){showError(problem);return;}
  }
 }
 step=target;maxStep=Math.max(maxStep,step);
 $('intro').hidden=step===5;
 $('wizard').hidden=step===5;
 $('results').hidden=step!==5;
 document.querySelectorAll('.step-panel').forEach(x=>x.hidden=Number(x.dataset.step)!==step);
 document.querySelectorAll('[data-goto]').forEach(btn=>{
  const n=Number(btn.dataset.goto);
  btn.classList.toggle('active',n===step);
  btn.classList.toggle('complete',n<step);
  btn.disabled=n>maxStep;
  btn.setAttribute('aria-current',n===step?'step':'false');
 });
 $('back').hidden=step===1;
 $('next').textContent=step===4?'Ver cálculo →':'Continuar →';
 const mapRoot=$('map-root');
 if(step===3||step===5){
  const parent=step===3?$('map-placeholder'):$('result-map-slot');
  parent.append(mapRoot);mapRoot.hidden=false;
  void ensureMap().then(()=>requestAnimationFrame(()=>setTimeout(()=>fitMap(true),50)));
 }else mapRoot.hidden=true;
 if(step===5)recalculate();
 showError('');
 if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)window.scrollTo({top:0,behavior:'smooth'});
 else window.scrollTo(0,0);
}
function bindField(id,prop){
 $(id).addEventListener('change',event=>{
  const value=event.target.type==='checkbox'?event.target.checked:
   event.target.type==='number'?event.target.value.trim()===''?null:Number(event.target.value):
   event.target.value;
  const previous=model.scenario[prop];
  model.scenario[prop]=value;
  const error=prop==='dispatchKg'?validateStep(1):'';
  if(error){model.scenario[prop]=previous;showError(error);return;}
  save();
  if(prop==='vehicleId')renderMapRoutes();
  updateDynamic();renderLive();recalculate();
  if(step===3)renderRouteCards();
  showError('');
 });
}
function setMapOverlay(text,warning=false){
 const el=$('map-overlay');
 el.textContent=text;el.hidden=!text;el.classList.toggle('warn',warning);
}
async function loadLeaflet(){
 if(window.L)return true;
 for(const src of [
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js']){
  const ok=await new Promise(resolve=>{
   let done=false;
   const el=document.createElement('script');
   const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
   const timer=setTimeout(()=>finish(false),6500);
   el.onload=()=>finish(Boolean(window.L));el.onerror=()=>finish(false);
   el.src=src;el.async=true;document.head.appendChild(el);
  });
  if(ok)return true;
 }
 return false;
}
function loadTiles(alternative=false){
 if(!map)return;
 if(tiles)map.removeLayer(tiles);
 baseChanged=alternative;tileErrors=0;
 tiles=L.tileLayer(alternative?
  'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png':
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  {maxZoom:19,attribution:alternative?'© OpenStreetMap · © CARTO':'© OpenStreetMap contributors'}).addTo(map);
 tiles.on('tileerror',()=>{
  if(++tileErrors===4){
   if(!baseChanged)loadTiles(true);
   else setMapOverlay('El mapa base no respondió. Revisa la conexión.',true);
  }
 });
}
function pinIcon(letter,color){
 return L.divIcon({className:'',html:'<span class="map-pin" style="background:'+color+'">'+letter+'</span>',
  iconSize:[34,34],iconAnchor:[17,17]});
}
async function ensureMap(){
 if(map)return map;
 if(mapPromise)return mapPromise;
 mapPromise=(async()=>{
  setMapOverlay('Cargando mapa…');
  if(!await loadLeaflet()){
   setMapOverlay('No se pudo cargar el mapa. Utiliza «Reintentar».',true);return null;
  }
  map=L.map('map',{zoomControl:false,preferCanvas:true}).setView(baseCenter,7);
  L.control.zoom({position:'bottomright'}).addTo(map);
  loadTiles();
  routeLayer=L.layerGroup().addTo(map);
  tollLayer=L.layerGroup().addTo(map);
  markers=L.layerGroup().addTo(map);
  map.on('click',event=>{
   if(!placement)return;
   const key=placement;placement=null;setPlacement(null);
   setPoint(key,event.latlng.lat,event.latlng.lng);
  });
  if(window.ResizeObserver){
   mapResizeObserver=new ResizeObserver(()=>{if(map&&!$('map-root').hidden)map.invalidateSize({pan:false,animate:false});});
   mapResizeObserver.observe($('map'));
  }
  renderMarkers();renderMapRoutes();
  setMapOverlay('');
  needFit=true;fitMap(true);
  return map;
 })().finally(()=>{mapPromise=null;});
 return mapPromise;
}
function fitMap(force=false){
 if(!map||$('map-root').hidden)return;
 map.invalidateSize({pan:false,animate:false});
 if(!force&&!needFit)return;
 const points=mapPoints();
 if(points.length===0)map.setView(baseCenter,7,{animate:false});
 else if(points.length===1)map.setView([points[0].lat,points[0].lng],10,{animate:false});
 else{
  const selected=activeRoute();
  const latLngs=selected?.coordinates?.length>2?selected.coordinates:
   points.map(p=>[p.lat,p.lng]);
  const bounds=L.latLngBounds(latLngs);
  if(bounds.isValid())map.fitBounds(bounds.pad(.14),{maxZoom:12,padding:[26,26],animate:false});
 }
 needFit=false;
}
function renderMarkers(){
 if(!map)return;
 markers.clearLayers();
 for(const [key,letter,color] of [['origin','A','#0D8944'],['destination','B','#1C2343']]){
  const point=syncedCoords(key);
  if(!point)continue;
  const marker=L.marker([point.lat,point.lng],{draggable:true,icon:pinIcon(letter,color)})
   .bindTooltip(escapeHTML(point.name||letter),{direction:'top'});
  marker.on('dragend',()=>{
   const pos=marker.getLatLng();
   setPoint(key,pos.lat,pos.lng);
  });
  marker.addTo(markers);
 }
}
function renderMapRoutes(){
 if(!map)return;
 routeLayer.clearLayers();tollLayer.clearLayers();
 for(let i=0;i<alternatives.length;i++){
  if(i===selectedIndex)continue;
  const route=alternatives[i];
  if(route?.coordinates?.length<2)continue;
  const line=L.polyline(route.coordinates,{color:'#A7B2C0',weight:5,opacity:.76,dashArray:route.source==='estimate'?'7 7':null});
  line.bindTooltip('Alternativa '+(i+1)+' · '+fmt(route.distanceKm,1)+' km');
  line.on('click',()=>chooseRoute(i));
  line.addTo(routeLayer);
 }
 if(returnLeg?.coordinates?.length>=2){
  L.polyline(returnLeg.coordinates,{color:'#D5A82C',weight:3,dashArray:'8 7',opacity:.9})
   .bindTooltip('Retorno · '+fmt(returnLeg.distanceKm,1)+' km').addTo(routeLayer);
 }
 const pair=routePair();
 const chosen=pair?.outbound;
 if(chosen?.coordinates?.length>=2){
  L.polyline(chosen.coordinates,{color:'#09A4DE',weight:7,opacity:.95,
   dashArray:chosen.source==='estimate'?'9 8':null})
   .bindTooltip('Ruta seleccionada · '+fmt(chosen.distanceKm,1)+' km').addTo(routeLayer);
 }
 for(const route of [pair?.outbound,pair?.returning]){
  for(const toll of route?.tollCandidates??[]){
   L.circleMarker([toll.lat,toll.lng],{radius:6,weight:2,color:'#fff',fillColor:'#C99516',fillOpacity:.95})
    .bindTooltip(escapeHTML(toll.name)+' · peaje a verificar').addTo(tollLayer);
  }
 }
}
function chooseRoute(index){
 if(index<0||index>=alternatives.length||index===selectedIndex)return;
 selectedIndex=index;
 needFit=true;renderMapRoutes();renderRouteCards();recalculate();fitMap(true);
 showToast('Ruta '+(selectedIndex+1)+' seleccionada. Se actualizaron distancia, tiempos, peajes y costos.');
}
function renderRouteCards(){
 const box=$('route-alternatives');
 if(alternatives.length<=1){
  box.innerHTML=alternatives.length===1&&alternatives[0].source==='estimate'?
    '<p class="route-info">Recorrido aproximado: no es una ruta vial confirmada.</p>':'';
  return;
 }
 box.innerHTML='<div class="alternatives-header"><strong>Compara las rutas disponibles</strong>'+
  '<small>Selecciona una ruta para recalcular costos.</small></div>'+
  alternatives.map((route,index)=>{
   let cost='Costo no calculable';
   try{
    const result=alternativeResult(model,alternatives,returnLeg,index,tollCatalog);
    if(result)cost=money(result.totalCOP);
   }catch{/* Mantener distancia y tiempo si faltan parámetros. */}
   const active=index===selectedIndex;
   return '<button type="button" class="route-choice '+(active?'selected':'')+
    '" data-route-index="'+index+'" aria-pressed="'+active+'">'+
    '<span class="route-number">'+(index+1)+'</span><span><strong>Ruta '+(index+1)+'</strong>'+
    '<small>'+fmt(route.distanceKm,1)+' km · '+fmt(route.durationMin/60,1)+' h'+
    (route.source==='osrm'?' · OSRM':' · estimación')+'</small></span>'+
    '<span class="route-price">'+cost+'</span><span aria-hidden="true">'+(active?'●':'○')+'</span></button>';
  }).join('');
}
function clearRoutes(){
 requestSeq++;
 alternatives=[];returnLeg=null;selectedIndex=0;currentKey=null;currentResult=null;
 renderMapRoutes();renderRouteCards();renderResults();renderLive();
 routeStatus('Selecciona origen y destino para construir el recorrido.');
}
async function refreshRoutes(){
 if(!bothPoints()){clearRoutes();needFit=true;renderMarkers();fitMap(true);return;}
 const a=syncedCoords('origin'),b=syncedCoords('destination');
 const key=routeKey(a,b),same=key===currentKey;
 if(!same){selectedIndex=0;currentKey=key;}
 const call=++requestSeq,t=model.parameters.transport;
 alternatives=[lineFallback(a,b,t)];
 returnLeg=lineFallback(b,a,t);
 routeStatus('Mostrando una estimación mientras se consulta la ruta vial…',true);
 renderMarkers();renderMapRoutes();renderRouteCards();recalculate();needFit=true;fitMap(true);
 try{
  const [choices,returning]=await Promise.all([
   fetchRoadAlternatives(a,b,t),fetchRoadLeg(b,a,t)
  ]);
  if(call!==requestSeq)return;
  alternatives=choices.length?choices:[lineFallback(a,b,t)];
  returnLeg=returning??lineFallback(b,a,t);
  if(selectedIndex>=alternatives.length)selectedIndex=0;
  renderMapRoutes();renderRouteCards();recalculate();
  const good=alternatives.some(x=>x.source==='osrm')&&returnLeg.source==='osrm';
  routeStatus(good?'Ruta vial actualizada. Puedes comparar sus alternativas.':
   'La distancia es aproximada; verifica condiciones de vía y peajes.',!good);
  needFit=true;fitMap(true);
 }catch(error){
  if(call!==requestSeq)return;
  routeStatus('Solo está disponible una estimación geográfica: '+error.message,true);
  recalculate();
 }
}
async function loadTolls(){
 try{
  const response=await fetch(new URL('../assets/peajes-region-central.geojson',import.meta.url));
  if(!response.ok)throw Error('No se pudo cargar el catálogo');
  tollCatalog=parseTollCatalog(await response.json());
 }catch{tollCatalog=[];}
 renderMapRoutes();renderRouteCards();recalculate();
}
function setPlacement(key){
 placement=key;
 for(const kind of ['origin','destination'])$('set-'+kind).setAttribute('aria-pressed',String(kind===key));
 $('map-instructions').textContent=key?
  'Haz clic en el mapa para ubicar '+(key==='origin'?'el origen.':'el destino.'):
  'Puedes mover los marcadores o buscar un municipio.';
}
async function setPoint(key,lat,lng,providedName=''){
 const token=++reverseTokens[key];
 const initial=providedName||fallbackCoordinateLabel(lat,lng);
 model.scenario[key]={name:initial,lat,lng};
 $(key+'Name').value=initial;
 $('matches-'+key).hidden=true;
 save();renderMarkers();updateDynamic();renderLive();
 needFit=true;fitMap(true);void refreshRoutes();
 if(providedName)return;
 const named=await reverseLocation(lat,lng);
 const p=model.scenario[key];
 if(reverseTokens[key]!==token||p.lat!==lat||p.lng!==lng)return;
 p.name=named;$(key+'Name').value=named;save();renderMarkers();updateDynamic();
}
async function searchPoint(key){
 const input=$(key+'Name'),container=$('matches-'+key),value=input.value.trim();
 container.hidden=false;container.innerHTML='<p class="hint">Buscando ubicación…</p>';
 try{
  const places=await searchLocations(value);
  if(input.value.trim()!==value)return;
  if(!places.length){container.innerHTML='<p class="hint">No se encontraron lugares. Ajusta la búsqueda o selecciona el punto en el mapa.</p>';return;}
  container.innerHTML=places.map((p,i)=>'<button type="button" data-place="'+i+'">'+
   '<strong>'+escapeHTML(p.name)+'</strong><small>'+escapeHTML(p.description)+'</small></button>').join('');
  container.querySelectorAll('[data-place]').forEach(button=>button.addEventListener('click',()=>{
   const place=places[Number(button.dataset.place)];
   void setPoint(key,place.lat,place.lng,place.name);
  }));
 }catch(error){container.innerHTML='<p class="hint caution">'+escapeHTML(error.message)+'</p>';}
}
function renderResults(){
 const r=currentResult;
 for(const id of ['kpi-total','kpi-per-accepted','kpi-accepted','kpi-vehicles','kpi-km','kpi-reject'])
  if(!r)$(id).textContent='—';
 if(!r){
  $('cost-lines').innerHTML='';$('physical-lines').innerHTML='';
  $('transport-components').innerHTML='';$('toll-details').innerHTML='';$('warnings').innerHTML='';
  return;
 }
 const vehicle=model.parameters.vehicles.find(x=>x.id===model.scenario.vehicleId);
 $('kpi-total').textContent=money(r.totalCOP);
 $('kpi-per-accepted').textContent=money(r.perAcceptedKg)+'/kg';
 $('kpi-accepted').textContent=fmt(r.dispatchedKg,1)+' / '+fmt(r.acceptedKg,1)+' kg';
 $('kpi-vehicles').textContent=(vehicle?.name??'Vehículo')+' · '+r.trucks;
 $('kpi-km').textContent=fmt(r.outboundKm,1)+' km · '+fmt(r.outboundHours,1)+' h';
 $('kpi-reject').textContent=fmt(r.rejectedKg,1)+' kg';
 $('cost-lines').innerHTML=[
  line('Empaque y recuperación',money(r.packagingCOP)),line('Cargue',money(r.loadingCOP)),
  line('Almacenamiento',money(r.storageCOP)),line('Transporte de ida',money(r.outwardAttributedCOP)),
  line('Descargue',money(r.unloadingCOP)),line('Retorno',money(r.returnAttributedCOP)),
  line('Total',money(r.totalCOP)),line('COP/kg despachado',money(r.perDispatchedKg))
 ].join('');
 $('physical-lines').innerHTML=[
  line('Cantidad despachada',fmt(r.dispatchedKg,1)+' kg'),
  line('Cantidad aceptada',fmt(r.acceptedKg,1)+' kg'),
  line('Vehículo',vehicle?.name??'—'),line('Conservación',model.scenario.preservation==='refrigerado'?'Refrigerado':'Ambiente'),
  line('Canastillas / cajas',fmt(r.unitCount)),
  line('Retornadas',fmt(r.returnedUnits)),line('Carga bruta',fmt(r.grossKg,1)+' kg'),
  line('Volumen',fmt(r.grossVolumeM3,2)+' m³'),line('Vehículos de regreso',fmt(r.returnedTrucks)),
  line('Ruta de vuelta',fmt(r.returnKm,1)+' km · '+fmt(r.returnHours,1)+' h'),
  line('Costo físico de regreso',money(r.returnCostPhysicalCOP))
 ].join('');
 const labels={fuel:'Combustible',repairs:'Partes y mantenimiento',tires:'Llantas',
  supplies:'Insumos y lubricantes',fixed:'Costos fijos',vehicleTime:'Tiempo operativo',
  refrigeration:'Refrigeración',tolls:'Peajes'};
 $('transport-components').innerHTML=(r.quoteMode?
  '<p class="hint">La composición representa los costos técnicos calculados, no la contabilidad de una cotización.</p>':'')+
  r.serviceComponents.map(x=>'<div class="cost-bar"><div><span>'+escapeHTML(labels[x.id])+
   '</span><strong>'+money(x.value)+' · '+fmt(x.pct,1)+' %</strong></div>'+
   '<i style="width:'+Math.min(100,x.pct)+'%"></i></div>').join('');
 const toll=(title,v)=>'<div class="toll-card"><strong>'+title+' · '+money(v.perTrip)+' por vehículo</strong>'+
  (v.entries.length?'<ul>'+v.entries.map(x=>'<li>'+escapeHTML(x.name)+' · '+
   (x.rateCOP===null?'Tarifa sin referencia':money(x.rateCOP))+
   (x.enabled?'':' · excluido')+'</li>').join('')+'</ul>':
   '<p class="hint">Sin coincidencias verificables sobre esta geometría.</p>')+'</div>';
 $('toll-details').innerHTML=toll('Ida',r.outboundTolls)+toll('Regreso',r.returnTolls)+
  line('Peajes para toda la flota',money(r.outboundTollCOP+r.returnTollCOP));
 $('warnings').innerHTML=r.warnings.map(x=>'<p class="hint caution">• '+escapeHTML(x)+'</p>').join('');
}
function recalculate(){
 if(!readyToCalculate(model)||!activeRoute()||!returnLeg){
  currentResult=null;renderResults();renderLive();updateDynamic();return;
 }
 try{
  currentResult=calculateMango(model,routePair());
  renderResults();renderLive();updateDynamic();
 }catch(error){
  currentResult=null;renderResults();renderLive();
  routeStatus('No se puede calcular: '+error.message,true);
 }
}
function openAdvanced(section=''){
 if(!$('advanced-overlay').hidden)return;
 lastFocused=document.activeElement;
 $('advanced-overlay').hidden=false;document.body.classList.add('drawer-open');
 const frame=$('advanced-frame');
 advancedFrameLoaded=false;
 frame.onload=()=>{
  advancedFrameLoaded=true;
  frame.contentWindow?.postMessage({type:'geoflujo:routes',
   routes:routePair()?[routePair().outbound,routePair().returning]:null,
   scenario:structuredClone(model.scenario)},location.origin);
  if(section)try{frame.contentWindow.location.hash=section;}catch{/* Cross-origin guard. */}
 };
 frame.src='./advanced.html?embed=1'+(section?'#'+encodeURIComponent(section):'');
 $('close-advanced').focus();
}
function closeAdvanced(){
 $('advanced-overlay').hidden=true;document.body.classList.remove('drawer-open');
 $('advanced-frame').src='about:blank';advancedFrameLoaded=false;
 lastFocused?.focus?.();
}
function handleAdvancedMessage(event){
 if(event.origin!==location.origin||event.source!==$('advanced-frame').contentWindow)return;
 if(event.data?.type!=='geoflujo:apply-parameters')return;
 try{
  const next=applyParameters(model,event.data.parameters,validateParameters);
  model=next;save();
  updateFields();
  // No se modifican las coordenadas ni la alternativa elegida.
  if(alternatives.length&&alternatives[0].source==='estimate'&&bothPoints()){
   const [a,b]=[syncedCoords('origin'),syncedCoords('destination')];
   alternatives=[lineFallback(a,b,model.parameters.transport)];
   returnLeg=lineFallback(b,a,model.parameters.transport);
  }
  renderMapRoutes();renderRouteCards();recalculate();
  closeAdvanced();
  showToast('Cambios aplicados. Los costos e indicadores fueron recalculados sin perder el recorrido.');
 }catch(error){
  showToast('No se aplicaron los cambios: '+error.message);
 }
}
function wire(){
 for(const [id,prop] of [
  ['dispatchKg','dispatchKg'],['ripeness','ripeness'],['packaging','packagingId'],
  ['packagingIncluded','packagingIncluded'],['storageEnabled','storageEnabled'],
  ['storageHours','storageHours'],['vehicle','vehicleId'],['preservation','preservation'],
  ['returnPackaging','returnPackaging'],['returnIncluded','returnIncluded']])bindField(id,prop);
 $('returnShare').addEventListener('change',e=>{
  const value=Number(e.target.value);
  if(!Number.isFinite(value)||value<0||value>100){showError('El porcentaje debe estar entre 0 y 100 %.');return;}
  model.scenario.returnShare=value/100;save();recalculate();
 });
 for(const key of ['origin','destination']){
  $(key+'Name').addEventListener('input',e=>{
   const p=model.scenario[key],newValue=e.target.value;
   if(newValue===p.name)return;
   reverseTokens[key]++;
   model.scenario[key]={name:newValue,lat:null,lng:null};
   save();clearRoutes();renderMarkers();needFit=true;fitMap(true);
  });
  $(key+'Name').addEventListener('keydown',e=>{
   if(e.key==='Enter'){e.preventDefault();void searchPoint(key);}
  });
  $('search-'+key).addEventListener('click',()=>void searchPoint(key));
  $('set-'+key).addEventListener('click',()=>setPlacement(placement===key?null:key));
 }
 $('retry-map').addEventListener('click',()=>{
  if(map){loadTiles(false);fitMap(true);}
  else void ensureMap();
 });
 $('route-alternatives').addEventListener('click',e=>{
  const button=e.target.closest('[data-route-index]');
  if(button)chooseRoute(Number(button.dataset.routeIndex));
 });
 $('next').addEventListener('click',()=>go(Math.min(5,step+1)));
 $('back').addEventListener('click',()=>go(Math.max(1,step-1)));
 document.querySelectorAll('[data-goto]').forEach(x=>x.addEventListener('click',()=>go(Number(x.dataset.goto))));
 $('edit-scenario').addEventListener('click',()=>go(1));
 $('open-advanced').addEventListener('click',()=>openAdvanced());
 $('adjust-results').addEventListener('click',()=>openAdvanced());
 $('open-sources').addEventListener('click',()=>openAdvanced('fuentes'));
 $('close-advanced').addEventListener('click',closeAdvanced);
 $('advanced-backdrop').addEventListener('click',closeAdvanced);
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('advanced-overlay').hidden)closeAdvanced();
 });
 window.addEventListener('message',handleAdvancedMessage);
 $('reset').addEventListener('click',()=>{
  if(!confirm('¿Iniciar una operación nueva? Las respuestas anteriores se reemplazarán.'))return;
  model={...defaults(),parameters:structuredClone(model.parameters)};save();clearRoutes();updateFields();needFit=true;fitMap(true);
  go(1);showToast('Nueva operación. Ingresa la cantidad de mango.');
 });
 $('download-result').addEventListener('click',()=>{
  if(!currentResult)return;
  const data={createdAt:new Date().toISOString(),scenario:model.scenario,
   parameters:model.parameters,route:routePair(),selectedRouteIndex:selectedIndex,
   result:currentResult};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='geoflujo-mango-calculo.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
 });
 window.addEventListener('resize',()=>{if(map&&!$('map-root').hidden)map.invalidateSize({pan:false,animate:false});});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&map)fitMap(true);});
}
function boot(){
 $('map-root').hidden=true;
 wire();updateFields();renderResults();
 routeStatus('Selecciona origen y destino para construir el recorrido.');
 go(1);
 void loadTolls();
 if(bothPoints())void refreshRoutes();
}
boot();

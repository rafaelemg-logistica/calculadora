import {defaults,loadState,storeState,STORAGE_KEY,CHANNEL_NAME,PARAMETER_SOURCES,validateState} from './config.js';
import {fetchRoadLeg} from './routing.js';
import {parseTollCatalog,matchTollsToRoute,tollSelection,overridesForLeg} from './tolls.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v).toLocaleString('es-CO',{maximumFractionDigits:0});
let state=loadState(),matched=[[],[]],catalog=[],request=0;
let statusTimer;
function status(text){
 $('save-status').textContent=text;clearTimeout(statusTimer);
 statusTimer=setTimeout(()=>$('save-status').textContent='Valores sincronizados',3500);
}
function save(){try{storeState(state);status('Cambios guardados');}catch(e){status(e.message);}}
function getPath(path){return path.split('.').reduce((obj,key)=>obj?.[key],state.parameters);}
function setPath(path,value){
 const keys=path.split('.'),last=keys.pop(),target=keys.reduce((o,k)=>o[k],state.parameters);
 target[last]=value;
}
function field(path,label,unit='',options=null){
 const value=getPath(path),type=typeof value;
 const common='data-field="'+esc(path)+'"';
 let input;
 if(options)input='<select '+common+'>'+options.map(([v,title])=>
   '<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(title)+'</option>').join('')+'</select>';
 else if(type==='boolean')input='<input type="checkbox" '+common+' '+(value?'checked':'')+'>';
 else input='<input type="'+(type==='number'?'number':'text')+'" '+common+
  (type==='number'?' min="0" step="any"':'')+' value="'+esc(value)+'">';
 return '<label class="setting-field '+(type==='boolean'?'setting-check':'')+'">'+
   (type==='boolean'?input+'<span>'+esc(label)+'</span>':'<span>'+esc(label)+'</span>'+input)+
   (unit?'<small>'+esc(unit)+'</small>':'')+'</label>';
}
const specs={
 mango:[
  ['product.variety','Variedad'],['product.rejectPct','Rechazo por transporte','% sobre kg despachados'],
  ['product.temperature.verde','Temperatura · verde maduro','°C'],
  ['product.temperature.pinton','Temperatura · pintón','°C'],
  ['product.temperature.maduro','Temperatura · maduro','°C'],
  ['product.humidityPct','Humedad relativa','%']],
 nodes:[
  ['nodeCosts.loadingPerKg','Cargue','COP/kg'],['nodeCosts.unloadingPerKg','Descargue','COP/kg'],
  ['nodeCosts.loadingHours','Tiempo de cargue','horas'],
  ['nodeCosts.unloadingHours','Tiempo de descargue','horas'],
  ['nodeCosts.waitingHours','Espera del vehículo','horas'],
  ['nodeCosts.dryStorageCOPPerPalletMonth','Almacén ambiente','COP/posición/mes'],
  ['nodeCosts.coldStorageCOPPerPalletMonth','Almacén refrigerado','COP/posición/mes'],
  ['nodeCosts.palletFootprintM2','Superficie de estiba','m²'],
  ['nodeCosts.storageBillingDaysPerMonth','Días de facturación mensual','días']],
 transport:[
  ['transport.dieselCOPPerGallon','Precio del ACPM','COP/galón'],
  ['transport.serviceFixedCOP','Costo fijo del servicio','COP/vehículo'],
  ['transport.vehicleTimeCOPPerH','Costo del tiempo','COP/hora'],
  ['transport.repairsCOPPerKm','Mantenimiento y repuestos','COP/km de C2'],
  ['transport.tiresCOPPerKm','Llantas','COP/km de C2'],
  ['transport.lubricantsCOPPerKm','Filtros, lavado y lubricantes','COP/km de C2'],
  ['transport.baseFuelKmPerGallon.flat','Rendimiento terreno plano','km/gal'],
  ['transport.baseFuelKmPerGallon.rolling','Rendimiento terreno ondulado','km/gal'],
  ['transport.baseFuelKmPerGallon.mountain','Rendimiento terreno montañoso','km/gal'],
  ['transport.roadSurface','Superficie vial','', [['pavimentada','Pavimentada'],['afirmada','Afirmada']]],
  ['transport.surfaceFuelFactor.pavimentada','Factor superficie pavimentada','multiplicador'],
  ['transport.surfaceFuelFactor.afirmada','Factor superficie afirmada','multiplicador'],
  ['transport.routeMultiplier','Factor de ajuste del recorrido','multiplicador'],
  ['transport.refrigeratedPreCoolH','Preenfriamiento del equipo','horas'],
  ['transport.fallbackDistanceMultiplier','Factor distancia aproximada','multiplicador'],
  ['transport.fallbackSpeedKmh','Velocidad de contingencia','km/h']],
 quote:[
  ['transport.allowQuote','Sustituir tarifa generalizada por cotización'],
  ['transport.quoteCOP','Cotización de ida','COP por vehículo'],
  ['transport.quoteIncludesTolls','La cotización incluye peajes'],
  ['transport.quoteIncludesReturn','La cotización incluye el regreso de la flota']],
 tolls:[
  ['transport.tollMode','Modo de peajes','', [['auto','Identificar sobre ruta vial'],['manual','Ingresar manualmente']]],
  ['transport.manualTollOutbound','Peajes manuales de ida','COP/vehículo'],
  ['transport.manualTollReturn','Peajes manuales de regreso','COP/vehículo']]
};
const packagingSpecs=[
 ['capacityKg','Capacidad de mango','kg/unidad'],['tareKg','Peso vacío','kg/unidad'],
 ['lengthM','Largo exterior','metros'],['widthM','Ancho exterior','metros'],
 ['heightM','Altura exterior','metros'],['maxStack','Apilamiento máximo','cajas'],
 ['purchaseCOP','Precio de adquisición','COP/unidad'],['cycles','Vida útil','usos'],
 ['washingCOP','Lavado por retorno','COP/unidad'],['replacementPct','Reposición por uso','%'],
 ['returnable','Empaque retornable','']
];
const vehicleSpecs=[
 ['payloadKg','Carga útil','kg'],['volumeM3','Volumen útil','m³'],
 ['lengthM','Largo interior','metros'],['widthM','Ancho interior','metros'],
 ['heightM','Altura interior','metros'],
 ['tollCategory','Categoría de peaje','',['I','II','III','IV','V','VI','VII'].map(x=>[x,'Categoría '+x])],
 ['costFactor','Factor relativo de costo','C2=1'],['coldCapable','Permite refrigeración'],
 ['coldFuelLh','Consumo del equipo de frío','litros/hora'],
 ['coldEquipmentCOPH','Costo del equipo de frío','COP/hora']
];
function renderAll(){
 for(const [key,fields] of Object.entries(specs))
  $('fields-'+key).innerHTML=fields.map(args=>field(...args)).join('');
 $('fields-packaging').innerHTML=state.parameters.packaging.map((item,i)=>
  '<details class="catalog-item" open><summary>'+esc(item.name)+'</summary><div class="settings-grid">'+
  packagingSpecs.map(([key,label,unit,options])=>field('packaging.'+i+'.'+key,label,unit,options)).join('')+
  '</div><p class="catalog-ref">Referencia: '+esc(item.reference)+'</p></details>').join('');
 $('fields-vehicles').innerHTML=state.parameters.vehicles.map((item,i)=>
  '<details class="catalog-item"><summary>'+esc(item.name)+' · '+fmt(item.payloadKg)+' kg</summary><div class="settings-grid">'+
  vehicleSpecs.map(([key,label,unit,options])=>field('vehicles.'+i+'.'+key,label,unit,options)).join('')+
  '</div></details>').join('');
 $('fields-terrain').innerHTML=Object.entries(state.parameters.transport.terrainMix).map(([key,val])=>
  '<label class="setting-field"><span>'+esc({flat:'Plano',rolling:'Ondulado',mountain:'Montañoso'}[key])+
  '</span><input type="number" id="mix-'+key+'" min="0" max="100" step="any" value="'+(100*val).toFixed(1)+'"><small>% de la distancia</small></label>').join('');
 $('sources-list').innerHTML=PARAMETER_SOURCES.map(([name,detail,type])=>
  '<div class="source-row"><strong>'+esc(name)+'</strong><span>'+esc(detail)+'</span><small>'+esc(type)+'</small></div>').join('');
}
function validateParam(path,value){
 if(typeof value==='number'){
  if(!Number.isFinite(value)||value<0)throw Error('Introduce un valor numérico no negativo.');
  if(path==='product.rejectPct'&&value>=100)throw Error('El rechazo debe ser menor de 100 %.');
  if(/(\.cycles|\.maxStack)$/.test(path)&&(!Number.isInteger(value)||value<1))
    throw Error('Indica un número entero positivo.');
  if(/(\.capacityKg|\.payloadKg|\.volumeM3|\.lengthM|\.widthM|\.heightM|KmPerGallon|Multiplier|\.costFactor|DaysPerMonth)$/.test(path)&&value<=0)
    throw Error('Este valor debe ser mayor que cero.');
 }
 return value;
}
function parameterChanged(e){
 const target=e.target.closest('[data-field]');if(!target)return;
 const path=target.dataset.field,previous=getPath(path);
 const raw=target.type==='checkbox'?target.checked:target.type==='number'?Number(target.value):target.value;
 try{setPath(path,validateParam(path,raw));save();}
 catch(error){setPath(path,previous);target.value=previous;status(error.message);}
 if(path.endsWith('.tollCategory'))void refreshTolls();
}
function saveTerrain(){
 const vals=['flat','rolling','mountain'].map(k=>Number($('mix-'+k).value));
 if(vals.some(x=>!Number.isFinite(x)||x<0)||Math.abs(vals.reduce((a,b)=>a+b,0)-100)>.0001){
  $('terrain-message').textContent='Las proporciones deben sumar 100 %.';return;
 }
 state.parameters.transport.terrainMix={flat:vals[0]/100,rolling:vals[1]/100,mountain:vals[2]/100};
 save();$('terrain-message').textContent='Perfil vial aplicado.';
}
async function refreshTolls(){
 const id=++request;
 $('toll-editor-status').textContent='Consultando ruta y estaciones de peaje…';
 try{
  if(!catalog.length){
   const resp=await fetch(new URL('../assets/peajes-region-central.geojson',import.meta.url));
   if(!resp.ok)throw Error('No se pudo obtener la base de peajes.');
   catalog=parseTollCatalog(await resp.json());
  }
  const {origin,destination,vehicleId}=state.scenario;
  const routes=await Promise.all([
   fetchRoadLeg(origin,destination,state.parameters.transport),
   fetchRoadLeg(destination,origin,state.parameters.transport)
  ]);
  if(id!==request)return;
  const v=state.parameters.vehicles.find(item=>item.id===vehicleId);
  matched=routes.map(leg=>matchTollsToRoute(leg,catalog,v?.tollCategory??'I'));
  $('toll-editor-status').textContent=routes.some(r=>r.source!=='osrm')?
   'No hay trazado vial validado en ambos sentidos. También puedes usar valores manuales.':
   'Peajes sugeridos por proximidad; revisa sentido de cobro, categoría y tarifa.';
  renderTolls();
 }catch(error){
  if(id!==request)return;
  $('toll-editor-status').textContent=error.message+' Usa los importes manuales si conoces el recorrido.';
  matched=[[],[]];renderTolls();
 }
}
function renderTolls(){
 const all=state.parameters.transport.tollOverrides??{};
 $('toll-editor').innerHTML=matched.map((candidates,index)=>{
  const selection=tollSelection(candidates,overridesForLeg(candidates,all,index));
  const rows=selection.entries.map(x=>{
   const key=index+':'+x.id;
   return '<div class="toll-editor-row">'+
    '<label class="setting-check"><input type="checkbox" data-toll-key="'+esc(key)+'" data-kind="enabled" '+
    (x.enabled?'checked':'')+'><span>'+esc(x.name)+'<small>'+esc(x.sector)+' · '+esc(x.direction)+'</small></span></label>'+
    '<label class="setting-field"><span>Tarifa COP · cat. '+esc(x.category)+'</span><input type="number" '+
    'data-toll-key="'+esc(key)+'" data-kind="rateCOP" min="0" step="100" value="'+(x.rateCOP??'')+
    '" placeholder="Revisar tarifa"></label></div>';
  }).join('');
  return '<div class="toll-group"><h3>'+(index===0?'Ida':'Regreso')+
   ' · '+fmt(selection.perTrip)+' COP por vehículo</h3>'+
   (rows||'<div class="empty-tolls">Sin estaciones asociadas a una geometría vial confirmada. Revisa los peajes del trayecto.</div>')+
   '</div>';
 }).join('');
}
function tollChanged(e){
 const input=e.target.closest('[data-toll-key]');if(!input)return;
 const key=input.dataset.tollKey,old=state.parameters.transport.tollOverrides[key]??{};
 if(input.dataset.kind==='enabled')state.parameters.transport.tollOverrides[key]={...old,enabled:input.checked};
 else{
  if(input.value.trim()&&(!Number.isFinite(Number(input.value))||Number(input.value)<0)){
   status('Tarifa no válida.');return;
  }
  state.parameters.transport.tollOverrides[key]={...old,rateCOP:input.value.trim()===''?null:Number(input.value)};
 }
 save();renderTolls();
}
function exportConfig(){
 const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='geoflujo-mango-configuracion.json';
 link.click();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
async function importConfig(file){
 try{
  const input=JSON.parse(await file.text());
  if(!validateState(input))throw Error('El archivo no corresponde a GeoFlujo Mango.');
  state=input;save();renderAll();void refreshTolls();
 }catch(error){status('No fue posible importar: '+error.message);}
}
function bind(){
 document.addEventListener('change',parameterChanged);
 $('save-terrain').addEventListener('click',saveTerrain);
 $('toll-editor').addEventListener('change',tollChanged);
 $('refresh-tolls').addEventListener('click',()=>void refreshTolls());
 $('export-settings').addEventListener('click',exportConfig);
 $('import-settings').addEventListener('change',e=>{
  if(e.target.files?.[0])void importConfig(e.target.files[0]);
  e.target.value='';
 });
 $('restore-settings').addEventListener('click',()=>{
  if(!confirm('¿Restaurar tarifas, capacidades y parámetros técnicos de referencia?'))return;
  state.parameters=defaults().parameters;save();renderAll();void refreshTolls();
 });
 window.addEventListener('storage',e=>{
  if(e.key===STORAGE_KEY){state=loadState();renderAll();void refreshTolls();}
 });
 try{const channel=new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage=()=>{state=loadState();renderAll();};
 }catch{/* Eventos storage como alternativa. */}
}
renderAll();bind();void refreshTolls();

/**
 * Rutas viales OSRM. Solo se ofrecen alternativas realmente devueltas por el servicio.
 * En contingencia se genera una única estimación señalizada; nunca se presenta
 * como itinerario vial ni se infieren peajes de esa línea.
 */
const cache=new Map();
const rad=x=>x*Math.PI/180;
export function hasPoint(p){
 return Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)
   &&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
}
export function haversineKm(a,b){
 if(!hasPoint(a)||!hasPoint(b))throw Error('Selecciona origen y destino para calcular el recorrido.');
 const r=6371.0088,dl=rad(b.lat-a.lat),dn=rad(b.lng-a.lng);
 const h=Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2;
 return 2*r*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function lineFallback(a,b,config){
 const distanceKm=haversineKm(a,b)*config.fallbackDistanceMultiplier;
 return {id:'estimated',distanceKm,durationMin:distanceKm/config.fallbackSpeedKmh*60,
  source:'estimate',coordinates:[[a.lat,a.lng],[b.lat,b.lng]]};
}
export function normalizeOsrmRoutes(data){
 if(data?.code!=='Ok'||!Array.isArray(data.routes))return [];
 return data.routes.flatMap((route,index)=>{
  const coords=route?.geometry?.coordinates;
  if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(route.distance)
    ||!Number.isFinite(route.duration)||route.distance<0||route.duration<0)return [];
  if(!coords.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])))return [];
  return [{
    id:'osrm-'+index,source:'osrm',distanceKm:route.distance/1000,
    durationMin:route.duration/60,coordinates:coords.map(([lng,lat])=>[lat,lng])
  }];
 });
}
export async function fetchRoadAlternatives(a,b,config){
 if(!hasPoint(a)||!hasPoint(b))return [];
 const key=[a.lat,a.lng,b.lat,b.lng].map(x=>x.toFixed(5)).join('|');
 if(cache.has(key))return cache.get(key).map(r=>({...r}));
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),9500);
 try{
  const coords=a.lng+','+a.lat+';'+b.lng+','+b.lat;
  const url='https://router.project-osrm.org/route/v1/driving/'+coords+
   '?overview=full&geometries=geojson&steps=false&alternatives=true';
  const response=await fetch(url,{signal:controller.signal});
  if(!response.ok)throw Error('Servicio de rutas: '+response.status);
  const legs=normalizeOsrmRoutes(await response.json());
  if(!legs.length)throw Error('El servicio de rutas no devolvió trayectos.');
  cache.set(key,legs);
  return legs.map(r=>({...r}));
 }catch{
  return [lineFallback(a,b,config)];
 }finally{clearTimeout(timeout);}
}
export async function fetchRoadLeg(a,b,config){
 const alternatives=await fetchRoadAlternatives(a,b,config);
 return alternatives[0]??null;
}
export async function routeScenario(scenario,config){
 const {origin,center,destination}=scenario.nodes;
 const points=scenario.viaCenter?[origin,center,destination]:[origin,destination];
 return Promise.all(points.slice(1).map((p,i)=>fetchRoadLeg(points[i],p,config)));
}
export function clearRouteCache(){cache.clear();}

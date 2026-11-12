/**
 * Servicios cartográficos. El backend OSRM de demostración no ofrece SLA.
 * Ante indisponibilidad la geometría es recta y se marca 'estimate'.
 */
const cache = new Map();
const rad=deg=>deg*Math.PI/180;
export function haversineKm(a,b){
  const r=6371.0088,dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return 2*r*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
export function lineFallback(a,b,config){
 const distanceKm=haversineKm(a,b)*config.fallbackDistanceMultiplier;
 return {distanceKm,durationMin:distanceKm/config.fallbackSpeedKmh*60,
   source:'estimate',coordinates:[[a.lat,a.lng],[b.lat,b.lng]]};
}
export async function fetchRoadLeg(a,b,config){
  const key=`${a.lat.toFixed(5)}|${a.lng.toFixed(5)}|${b.lat.toFixed(5)}|${b.lng.toFixed(5)}`;
  if(cache.has(key))return cache.get(key);
  let result;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),11000);
  try{
    const coords=`${a.lng},${a.lat};${b.lng},${b.lat}`;
    const url=`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw Error(`OSRM ${response.status}`);
    const data=await response.json();const route=data.routes?.[0];
    if(data.code!=='Ok'||!route?.geometry?.coordinates?.length)throw Error('Ruta vacía');
    result={distanceKm:route.distance/1000,durationMin:route.duration/60,source:'osrm',
      coordinates:route.geometry.coordinates.map(([lng,lat])=>[lat,lng])};
  }catch{
    result=lineFallback(a,b,config);
  }finally{clearTimeout(timeout);}
  // Se cachean solo las rutas reales; un fallo temporal no debe quedar fijo.
  if(result.source==='osrm')cache.set(key,result);
  return result;
}
export async function routeScenario(scenario,config){
 const {origin,center,destination}=scenario.nodes;
 const points=scenario.viaCenter?[origin,center,destination]:[origin,destination];
 const legs=[];
 for(let i=1;i<points.length;i++)legs.push(await fetchRoadLeg(points[i-1],points[i],config));
 return legs;
}
export function clearRouteCache(){cache.clear();}

/**
 * Localización asistida. Consultas explícitas, con pausa entre peticiones
 * al servicio comunitario Nominatim; no se ejecuta geocodificación por pulsación.
 */
const cache=new Map();
let nextSlot=0;
async function limitedGet(url){
 const key=url.toString();
 if(cache.has(key))return cache.get(key);
 const wait=Math.max(0,nextSlot-Date.now());
 nextSlot=Date.now()+wait+1200;
 if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
 const response=await fetch(url,{headers:{Accept:'application/json'}});
 if(!response.ok)throw Error('No fue posible consultar ubicaciones: HTTP '+response.status);
 const payload=await response.json();
 cache.set(key,payload);
 return payload;
}
export function fallbackCoordinateLabel(lat,lng){
 return Number(lat).toFixed(5)+'°, '+Number(lng).toFixed(5)+'°';
}
export function placeLabel(item,lat=null,lng=null){
 const a=item?.address??{};
 const municipality=a.city||a.town||a.municipality||a.village||a.county||a.hamlet;
 const department=a.state||a.region||a.state_district;
 if(municipality&&department)return municipality+', '+department;
 if(municipality)return municipality;
 if(department)return department+(Number.isFinite(lat)?' · '+fallbackCoordinateLabel(lat,lng):'');
 if(typeof item?.display_name==='string'&&item.display_name)
   return item.display_name.split(',').slice(0,2).map(x=>x.trim()).join(', ');
 if(Number.isFinite(lat)&&Number.isFinite(lng))return fallbackCoordinateLabel(lat,lng);
 return '';
}
export async function searchLocations(query){
 const text=String(query??'').trim();
 if(text.length<3)throw Error('Escribe al menos tres letras del lugar.');
 const url=new URL('https://nominatim.openstreetmap.org/search');
 url.searchParams.set('q',text);
 url.searchParams.set('format','jsonv2');
 url.searchParams.set('addressdetails','1');
 url.searchParams.set('countrycodes','co');
 url.searchParams.set('limit','5');
 const data=await limitedGet(url);
 if(!Array.isArray(data))throw Error('No se obtuvo una lista de lugares.');
 return data.filter(x=>Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon)))
  .map(x=>({name:placeLabel(x,Number(x.lat),Number(x.lon)),lat:Number(x.lat),lng:Number(x.lon),
   description:x.display_name??''}));
}
export async function reverseLocation(lat,lng){
 const url=new URL('https://nominatim.openstreetmap.org/reverse');
 url.searchParams.set('lat',Number(lat).toFixed(6));
 url.searchParams.set('lon',Number(lng).toFixed(6));
 url.searchParams.set('format','jsonv2');
 url.searchParams.set('addressdetails','1');
 url.searchParams.set('zoom','12');
 try{
  const item=await limitedGet(url);
  return placeLabel(item,lat,lng);
 }catch{
  return fallbackCoordinateLabel(lat,lng);
 }
}

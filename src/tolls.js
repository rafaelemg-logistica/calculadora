/**
 * Peajes de referencia sobre una geometría vial OSRM.
 *
 * La proximidad espacial NO acredita paso efectivo por la estación, sentido de cobro
 * ni vigencia de tarifas. Los candidatos se revisan y se pueden excluir en pantalla.
 */
const radians=degrees=>degrees*Math.PI/180;
const validCoord=point=>Number.isFinite(point?.lat)&&Number.isFinite(point?.lng)
  &&Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180;

export function parseTollCatalog(value){
  if(value?.type!=='FeatureCollection'||!Array.isArray(value.features))
    throw new Error('Catálogo de peajes no válido');
  return value.features.flatMap((feature,index)=>{
    const p=feature?.properties??{}, geo=feature?.geometry;
    if(geo?.type!=='Point'||!Array.isArray(geo.coordinates))return [];
    const [lng,lat]=geo.coordinates;
    if(!validCoord({lat,lng}))return [];
    const rates=Object.fromEntries(['I','II','III','IV','V','VI','VII'].map(category=>{
      const v=Number(p['rate_'+category]);
      return [category,Number.isFinite(v)&&v>0?v:null];
    }));
    return [{
      id:String(p.id??index),name:String(p.name??'Peaje sin nombre'),lat,lng,
      sector:String(p.sector??''),direction:String(p.direction??''),
      operator:String(p.operator??''),rates
    }];
  });
}

/** Distancia entre un punto y un segmento corto en proyección equirectangular local. */
export function distanceToSegmentM(point,a,b){
  const latitude=radians((a[0]+b[0]+point[0])/3);
  const x=111320*Math.cos(latitude),y=110540;
  const ax=(a[1]-point[1])*x,ay=(a[0]-point[0])*y;
  const bx=(b[1]-point[1])*x,by=(b[0]-point[0])*y;
  const dx=bx-ax,dy=by-ay, len2=dx*dx+dy*dy;
  const t=len2?Math.min(1,Math.max(0,-(ax*dx+ay*dy)/len2)):0;
  return {distanceM:Math.hypot(ax+t*dx,ay+t*dy),fraction:t};
}

export function matchTollsToRoute(route,tolls,category,toleranceM=160){
  // Nunca atribuir peajes a una línea recta de contingencia.
  if(route?.source!=='osrm'||!Array.isArray(route.coordinates)||route.coordinates.length<3)return [];
  const coords=route.coordinates;
  const lengths=[];let total=0;
  for(let i=1;i<coords.length;i++){
    const lat=radians((coords[i-1][0]+coords[i][0])/2);
    const length=Math.hypot((coords[i][1]-coords[i-1][1])*111320*Math.cos(lat),(coords[i][0]-coords[i-1][0])*110540);
    lengths.push(length);total+=length;
  }
  const found=[];
  for(const toll of tolls){
    let nearest=Infinity,progress=0, traveled=0;
    const point=[toll.lat,toll.lng];
    for(let i=1;i<coords.length;i++){
      const test=distanceToSegmentM(point,coords[i-1],coords[i]);
      if(test.distanceM<nearest){nearest=test.distanceM;progress=traveled+test.fraction*lengths[i-1];}
      traveled+=lengths[i-1];
    }
    if(nearest<=toleranceM){
      const rate=toll.rates?.[category];
      found.push({
        id:toll.id,name:toll.name,lat:toll.lat,lng:toll.lng,sector:toll.sector,
        direction:toll.direction,operator:toll.operator,category,
        rateCOP:Number.isFinite(rate)&&rate>0?rate:null,
        distanceM:Math.round(nearest),position:total?progress/total:0,
        confidence:'proximidad espacial'
      });
    }
  }
  return found.sort((a,b)=>a.position-b.position||a.name.localeCompare(b.name));
}

export function tollSelection(matches,overrides={}){
  const entries=matches.map(match=>{
    const custom=overrides[match.id]??{};
    const enabled=custom.enabled!==false;
    const rateCOP=Number.isFinite(custom.rateCOP)&&custom.rateCOP>=0
      ? custom.rateCOP:match.rateCOP;
    return {...match,enabled,rateCOP};
  });
  return {
    entries,
    perTrip:entries.reduce((sum,toll)=>sum+(toll.enabled?(toll.rateCOP??0):0),0),
    missing:entries.filter(toll=>toll.enabled&&toll.rateCOP===null).map(toll=>toll.name),
    included:entries.filter(toll=>toll.enabled)
  };
}

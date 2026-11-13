import {calculateMango} from './mango-engine.js';
import {matchTollsToRoute} from './tolls.js';
import {readyToCalculate} from './config.js?v=2';
import {hasPoint} from './routing.js?v=2';

export function routeKey(a,b){
 if(!hasPoint(a)||!hasPoint(b))return null;
 return [a.lat,a.lng,b.lat,b.lng].map(v=>v.toFixed(5)).join(':');
}
export function selectAlternative(alternatives,index){
 if(!Array.isArray(alternatives)||alternatives.length===0)return null;
 const safe=Math.max(0,Math.min(alternatives.length-1,Number(index)||0));
 return alternatives[safe];
}
export function attachTolls(route,catalog,vehicle){
 if(!route)return null;
 return {...route,tollCandidates:matchTollsToRoute(route,catalog,vehicle?.tollCategory??'I')};
}
export function alternativeResult(model,alternatives,returnRoute,index,catalog=[]){
 if(!readyToCalculate(model)||!returnRoute)return null;
 const outward=selectAlternative(alternatives,index);
 if(!outward)return null;
 const vehicle=model.parameters.vehicles.find(v=>v.id===model.scenario.vehicleId);
 return calculateMango(model,{outbound:attachTolls(outward,catalog,vehicle),
   returning:attachTolls(returnRoute,catalog,vehicle)});
}
export function alternativesWithCosts(model,alternatives,returnRoute,catalog=[]){
 return (alternatives??[]).map((route,index)=>{
  let result=null,error=null;
  try{result=alternativeResult(model,alternatives,returnRoute,index,catalog);}
  catch(e){error=e.message;}
  return {route,index,result,error};
 });
}
/** Retiene las respuestas de la operación mientras sustituye únicamente el catálogo técnico. */
export function applyParameters(model,parameters,validate){
 validate(parameters);
 return {...model,scenario:structuredClone(model.scenario),parameters:structuredClone(parameters)};
}

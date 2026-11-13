import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
function ids(s){return new Set([...s.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));}
test('Cada elemento consultado por JavaScript existe en su pantalla',()=>{
 for(const [html,js] of [['index.html','src/mango-app.js'],['advanced.html','src/advanced.js']]){
  const page=read(html),script=read(js),all=ids(page);
  const referenced=[...script.matchAll(/\$\('([a-zA-Z][\w-]+)'\)/g)].map(x=>x[1]);
  const missing=referenced.filter(id=>!all.has(id));
  assert.deepEqual(missing,[],html+' contiene los controles requeridos');
 }
});
test('Las dos pantallas cargan sus módulos JS y hojas de estilo propias',()=>{
 for(const [file,module,css] of [
  ['index.html','src/mango-app.js','src/mango.css'],
  ['advanced.html','src/advanced.js','src/advanced.css']]){
  const html=read(file);
  assert.ok(html.includes(module));
  assert.ok(html.includes(css));
  assert.ok(existsSync(new URL('../'+module,import.meta.url)));
  assert.ok(existsSync(new URL('../'+css,import.meta.url)));
 }
});
test('No aparecen términos de desarrollo en las pantallas finales',()=>{
 for(const file of ['index.html','advanced.html']){
  assert.doesNotMatch(read(file),/\b(piloto|por definir|pendiente|caso de prueba)\b/i);
 }
});

// Controller integration tests use a minimal DOM double, not a browser renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as core from '../web/core.js';
const raw=readFileSync(new URL('../web/data/values.f64',import.meta.url));
const table=new Float64Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const advisor=new core.Advisor(table);
const manifest=JSON.parse(readFileSync(new URL('../web/data/manifest.json',import.meta.url)));

class Element {
  constructor(){this.style={};this.dataset={};this.classList={toggle(){}};this.disabled=false;this.open=false;this.children=new Map();}
  set innerHTML(s){this.html=s;this.children.clear();}
  get innerHTML(){return this.html??'';}
  setAttribute(){}
  addEventListener(){}
  focus(){}
  close(){this.open=false;}
  showModal(){this.open=true;}
  querySelector(selector){if(selector==='details')return null;if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
  querySelectorAll(selector){
    if(selector!=='[data-face]')return [];
    if(!this.faces)this.faces=[];
    return [1,2,3,4,5,6].map(v=>{const b=new Element();b.dataset.face=String(v);this.faces[v]=b;return b;});
  }
}
function controller(storage=new Map()){
  const elements=new Map(),doc={activeElement:null,addEventListener(){},
    getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},
    querySelector(sel){if(sel.startsWith('[data-die'))return null;return this.getElementById(sel);}};
  class WorkerDouble{
    postMessage(data){queueMicrotask(()=>{
      if(data.type==='init')this.onmessage({data:{type:'ready',manifest}});
      else{
        const analysis=advisor.analyze(core.stateOf(data.game.card),data.game.dice,3-data.game.rolls);
        this.onmessage({data:{type:'analysis',id:data.id,actions:analysis.actions,
          selected:core.selectAction(data.strategy,analysis,data.game,core.seeded(data.seed)),milliseconds:1}});
      }
    });}
  }
  let code=readFileSync(new URL('../web/app.js',import.meta.url),'utf8').replace(/^import .*;\n/m,'');
  code=code.replace("new URL('./worker.js',import.meta.url)","'worker.js'");
  code=code.replace(/const delay=ms=>.*;\n/,'const delay=()=>Promise.resolve();\n');
  const locals={...core,document:doc,Worker:WorkerDouble,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:true})};
  const api=new Function(...Object.keys(locals),code+'\nreturn {get game(){return game},get pending(){return pending},get analysis(){return analysis},get running(){return running},mainAction,applyAction,facePicker,reset};')(...Object.values(locals));
  return {api,element:id=>doc.getElementById(id),storage};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('online controller: first roll, advice, score, and undo',async()=>{
  const {api,element}=controller();await flush();
  assert.equal(element('roll-button').disabled,false);
  await api.mainAction();assert.equal(api.game.rolls,1);assert.ok(api.analysis.actions.length>0);
  await api.applyAction(api.analysis.actions.find(a=>a.type==='score'&&a.category===12));
  assert.equal(api.game.log.length,1);assert.notEqual(api.game.card[12],null);
  element('undo-button').onclick();await flush();
  assert.equal(api.game.log.length,0);assert.equal(api.game.rolls,1);assert.equal(api.game.card[12],null);
});
test('physical controller: enter, hold four, enter one, score, undo',async()=>{
  const {api,element}=controller();await flush();element('mode-table').onclick();
  assert.deepEqual(api.pending,[null,null,null,null,null]);
  api.facePicker(0);
  for(const face of [2,3,4,5,5])element('dialog-content').faces[face].onclick();
  assert.deepEqual(api.pending,[2,3,4,5,5]);
  await api.mainAction();await flush();assert.equal(api.game.rolls,1);assert.ok(api.analysis);
  await api.applyAction({type:'reroll',keep:[2,3,4,5]});
  assert.deepEqual(api.pending,[2,3,4,5,null]);
  api.facePicker(4);element('dialog-content').faces[1].onclick();
  await api.mainAction();await flush();
  assert.equal(api.game.rolls,2);assert.deepEqual(api.game.dice,[2,3,4,5,1]);
  await api.applyAction(api.analysis.actions.find(a=>a.type==='score'&&a.category===10));
  assert.equal(api.game.card[10],40);assert.deepEqual(api.pending,[null,null,null,null,null]);
  element('undo-button').onclick();await flush();
  assert.equal(api.game.card[10],null);assert.deepEqual(api.game.dice,[2,3,4,5,1]);
});
test('all four selectable computer players complete a turn without locking controls',async()=>{
  for(const strategy of ['optimal','greedy','heuristic','random']){
    const {api,element}=controller();await flush();
    element('player-select').onchange({target:{value:strategy}});
    await api.mainAction();
    assert.equal(api.game.log.length,1,strategy);assert.equal(api.game.rolls,0);assert.equal(api.running,false);assert.equal(element('roll-button').disabled,false);
  }
});
test('saved games are replay-validated before restoring',async()=>{
  const first=controller();await flush();await first.api.mainAction();
  await first.api.applyAction(first.api.analysis.actions.find(a=>a.type==='score'&&a.category===12));
  const restored=controller(first.storage);await flush();assert.deepEqual(restored.api.game.card,first.api.game.card);
  const corrupted=JSON.parse(first.storage.get('yahtzee-master:v1'));corrupted.game.card[0]=999;
  first.storage.set('yahtzee-master:v1',JSON.stringify(corrupted));
  const rejected=controller(first.storage);await flush();assert.deepEqual(rejected.api.game.card,Array(13).fill(null));
});

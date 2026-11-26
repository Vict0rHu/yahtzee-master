// SPDX-License-Identifier: MIT
import {Advisor,RULESET,stateOf,selectAction,seeded} from './core.js';
let advisor,manifest;
async function initialize(){
  manifest=await(await fetch(new URL('./data/manifest.json',import.meta.url))).json();
  if(manifest.ruleset!==RULESET)throw new Error('The rules and value table versions do not match.');
  const response=await fetch(new URL('./data/values.f64',import.meta.url));
  if(!response.ok)throw new Error('Could not load the strategy table.');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==manifest.bytes)throw new Error('The strategy download is incomplete.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==manifest.sha256)throw new Error('The strategy table did not pass its integrity check.');
  advisor=new Advisor(new Float64Array(bytes));
  postMessage({type:'ready',manifest});
}
self.onmessage=async({data})=>{
  if(data.type==='init'){try{await initialize();}catch(e){postMessage({type:'error',message:e.message});}return;}
  if(data.type==='analyze'){
    try{
      if(!advisor)throw new Error('The strategy table is still loading.');
      const game=data.game,state=stateOf(game.card),start=performance.now();
      const analysis=advisor.analyze(state,game.dice,3-game.rolls);
      const selected=selectAction(data.strategy,analysis,game,seeded(data.seed??123));
      postMessage({type:'analysis',id:data.id,actions:analysis.actions,selected,milliseconds:performance.now()-start});
    }catch(e){postMessage({type:'analysis-error',id:data.id,message:e.message});}
  }
};

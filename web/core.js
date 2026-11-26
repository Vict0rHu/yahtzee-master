// SPDX-License-Identifier: MIT
// Original rules and finite-state model. No DOM, network, or implicit randomness.
export const RULESET = 'hasbro-forced-joker-v1';
export const ALL = 8191;
export const Y = 11;
export const CATEGORIES = [
  ['Ones','Add your ones','1'],['Twos','Add your twos','2'],
  ['Threes','Add your threes','3'],['Fours','Add your fours','4'],
  ['Fives','Add your fives','5'],['Sixes','Add your sixes','6'],
  ['Three of a kind','3 matching · total of all dice','3×'],
  ['Four of a kind','4 matching · total of all dice','4×'],
  ['Full house','A triple and a pair · 25 points','3+2'],
  ['Small straight','4 in a row · 30 points','4↗'],
  ['Large straight','5 in a row · 40 points','5↗'],
  ['Yahtzee','5 matching · 50 points','5×'],
  ['Chance','Total of all five dice','Σ'],
];
export function assertDice(dice) {
  if (!Array.isArray(dice) || dice.length !== 5 || dice.some(v=>!Number.isInteger(v)||v<1||v>6))
    throw new Error('Enter five dice, each from 1 to 6.');
}
export function countsOf(dice) {
  assertDice(dice); const c=Array(6).fill(0); for(const d of dice)c[d-1]++; return c;
}
export function stateOf(card) {
  let mask=0,upper=0;
  card.forEach((n,i)=>{if(n!==null){mask|=1<<i;if(i<6)upper+=n;}});
  return {mask,upper:Math.min(63,upper),armed:card[Y]===50};
}
export function indexOf({mask,upper,armed}) {return ((mask*64+upper)*2)+Number(armed);}
export function totalOf(game) {
  const upper=game.card.slice(0,6).reduce((a,b)=>a+(b??0),0);
  return game.card.reduce((a,b)=>a+(b??0),0)+(upper>=63?35:0)+game.extra*100;
}
export function scoreChoices(state,dice) {
  const d=countsOf(dice), sum=dice.reduce((a,b)=>a+b,0), max=Math.max(...d);
  const match=d.indexOf(5), joker=match>=0&&!!(state.mask&(1<<Y));
  let allowed=ALL^state.mask;
  if(joker){
    if(!(state.mask&(1<<match)))allowed=1<<match;
    else if(allowed&~63)allowed&=~63;
  }
  const hasRun=n=>Array.from({length:7-n},(_,i)=>d.slice(i,i+n).every(x=>x>0)).some(Boolean);
  const points=[...d.map((n,i)=>n*(i+1)),max>=3?sum:0,max>=4?sum:0,
    d.includes(3)&&d.includes(2)?25:0,hasRun(4)?30:0,hasRun(5)?40:0,max===5?50:0,sum];
  if(joker){points[8]=25;points[9]=30;points[10]=40;}
  const result=[];
  for(let category=0;category<13;category++)if(allowed&(1<<category)){
    const p=points[category],upper=category<6?Math.min(63,state.upper+p):state.upper;
    const extra=joker&&state.armed?100:0,bonus=state.upper<63&&upper===63?35:0;
    result.push({type:'score',category,points:p,extra,bonus,reward:p+extra+bonus,
      next:{mask:state.mask|(1<<category),upper,armed:state.armed||(category===Y&&p===50)}});
  }
  return result;
}
export function freshGame(mode='play') {
  return {version:1,mode,card:Array(13).fill(null),extra:0,dice:null,rolls:0,kept:Array(5).fill(false),log:[]};
}
export function receiveRoll(game,dice) {
  assertDice(dice);
  if(game.rolls>=3||stateOf(game.card).mask===ALL)throw new Error('This turn is complete.');
  if(game.dice&&dice.some((d,i)=>game.kept[i]&&d!==game.dice[i]))throw new Error('A held die cannot change.');
  return {...game,dice:[...dice],rolls:game.rolls+1,kept:[...game.kept]};
}
export function fillCategory(game,category) {
  if(!game.dice||!game.rolls)throw new Error('Roll or enter your dice first.');
  const choice=scoreChoices(stateOf(game.card),game.dice).find(c=>c.category===category);
  if(!choice)throw new Error('That category is not available under the Joker rule.');
  const card=[...game.card];card[category]=choice.points;
  return {...game,card,extra:game.extra+choice.extra/100,dice:null,rolls:0,kept:Array(5).fill(false),
    log:[...game.log,{round:game.log.length+1,dice:[...game.dice],category,points:choice.points,extra:choice.extra,bonus:choice.bonus}]};
}
export function setHeldValues(game,keep) {
  const available=[...keep];
  return {...game,kept:game.dice.map(d=>{const i=available.indexOf(d);if(i<0)return false;available.splice(i,1);return true;})};
}
// Rejection sampling avoids modulo bias: 2^32 is not divisible by six.
export function fairDie(nextUint32) {
  let x;do{x=nextUint32()>>>0;}while(x>=4294967292);return x%6+1;
}
export function seeded(seed) {
  let s=seed>>>0;
  return ()=>{s=(s+0x9e3779b9)>>>0;let z=s;z=Math.imul(z^(z>>>16),0x21f0aaad);z=Math.imul(z^(z>>>15),0x735a2d97);return(z^(z>>>15))>>>0;};
}
export function rollDice(game,nextUint32) {
  return receiveRoll(game,Array.from({length:5},(_,i)=>game.dice&&game.kept[i]?game.dice[i]:fairDie(nextUint32)));
}

export const lattice=(()=>{
  const nodes=[],levels=Array.from({length:6},()=>[]),ids=new Map();
  function visit(n,face,left,c){
    if(face===5){const d=[...c,left],id=nodes.length;ids.set(d.join(''),id);nodes.push({c:d,n});levels[n].push(id);return;}
    for(let k=0;k<=left;k++)visit(n,face+1,left-k,[...c,k]);
  }
  for(let n=0;n<=5;n++)visit(n,0,n,[]);
  for(const node of nodes){
    node.up=[];node.down=[];
    for(let f=0;f<6;f++){
      const c=[...node.c];c[f]++;node.up.push(node.n<5?ids.get(c.join('')):-1);
      c[f]-=2;node.down.push(c[f]>=0?ids.get(c.join('')):-1);
    }
  }
  const rolls=levels[5].map(id=>nodes[id].c.flatMap((n,i)=>Array(n).fill(i+1)));
  const rollIds=new Map(rolls.map((d,i)=>[countsOf(d).join(''),i]));
  const subholds=levels[5].map(id=>nodes.map((n,i)=>n.c.every((v,f)=>v<=nodes[id].c[f])?i:-1).filter(i=>i>=0));
  return {nodes,levels,ids,rolls,rollIds,subholds};
})();
function expectedForKeeps(fullValues) {
  const e=new Float64Array(462);
  lattice.levels[5].forEach((id,r)=>e[id]=fullValues[r]);
  for(let n=4;n>=0;n--)for(const id of lattice.levels[n]){
    let sum=0;for(const up of lattice.nodes[id].up)sum+=e[up];e[id]=sum/6;
  }
  return e;
}
function bestAfterRoll(e) {
  const b=e.slice();
  for(let n=1;n<=5;n++)for(const id of lattice.levels[n])
    for(const down of lattice.nodes[id].down)if(down>=0)b[id]=Math.max(b[id],b[down]);
  return Float64Array.from(lattice.levels[5],id=>b[id]);
}
export class Advisor {
  constructor(table){if(table.length!==1048576)throw new Error('Invalid value table size.');this.table=table;this.cache=new Map();}
  value(state){const v=this.table[indexOf(state)];if(!Number.isFinite(v))throw new Error('Value table does not contain this state.');return v;}
  prepare(state){
    const key=indexOf(state);if(this.cache.has(key))return this.cache.get(key);
    const stop=[],global=[],greedy=[];
    for(const dice of lattice.rolls){
      const choices=scoreChoices(state,dice);
      const g=choices.map(c=>({...c,ev:c.reward+this.value(c.next)}));stop.push(g);
      global.push(Math.max(...g.map(c=>c.ev)));greedy.push(Math.max(...choices.map(c=>c.reward)));
    }
    const gKeeps=[],hKeeps=[];let g=global,h=greedy;
    for(let r=1;r<=2;r++){
      gKeeps[r]=expectedForKeeps(g);hKeeps[r]=expectedForKeeps(h);
      g=bestAfterRoll(gKeeps[r]);h=bestAfterRoll(hKeeps[r]);
    }
    const result={stop,gKeeps,hKeeps};
    if(this.cache.size>=6)this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key,result);return result;
  }
  analyze(state,dice,remaining){
    assertDice(dice);if(!Number.isInteger(remaining)||remaining<0||remaining>2)throw new Error('Invalid number of rerolls.');
    if(state.mask===ALL)return {actions:[],best:null};
    const prepared=this.prepare(state),r=lattice.rollIds.get(countsOf(dice).join(''));
    const actions=prepared.stop[r].map(c=>({...c,greedy:c.reward,key:`s${c.category}`}));
    if(remaining>0)for(const id of lattice.subholds[r]){
      const n=lattice.nodes[id];if(n.n===5)continue;
      actions.push({type:'reroll',keep:n.c.flatMap((k,i)=>Array(k).fill(i+1)),ev:prepared.gKeeps[remaining][id],
        greedy:prepared.hKeeps[remaining][id],key:`k${id}`});
    }
    actions.sort((a,b)=>b.ev-a.ev||Number(a.type!=='score')-Number(b.type!=='score')||a.key.localeCompare(b.key));
    const best=actions[0];return {actions:actions.map(a=>({...a,loss:Math.max(0,best.ev-a.ev)})),best};
  }
}
export function selectAction(strategy,analysis,game,nextUint32=()=>0){
  const {actions}=analysis;if(!actions.length)return null;
  if(strategy==='optimal')return actions[0];
  if(strategy==='greedy')return [...actions].sort((a,b)=>b.greedy-a.greedy||b.ev-a.ev)[0];
  const scores=actions.filter(a=>a.type==='score');
  const remaining=3-game.rolls;
  if(strategy==='random'){
    if(!remaining)return scores[nextUint32()%scores.length];
    const keep=game.dice.filter(()=>!!(nextUint32()&1)).sort((a,b)=>a-b);
    if(keep.length===5)return scores[nextUint32()%scores.length];
    return actions.find(a=>a.type==='reroll'&&a.keep.join()===keep.join());
  }
  if(strategy==='heuristic'){
    const immediate=[...scores].sort((a,b)=>b.reward-a.reward||b.ev-a.ev)[0];
    if(!remaining||scores.some(c=>[8,10,11].includes(c.category)&&c.points>0))return immediate;
    const counts=countsOf(game.dice),bestFace=counts.reduce((best,n,f)=>n>=counts[best]?f:best,0);
    let keep=Array(counts[bestFace]).fill(bestFace+1);
    if(counts[bestFace]<3){
      for(let start=1;start<=3;start++){
        const run=Array.from({length:4},(_,i)=>start+i);
        if(run.every(v=>counts[v-1])&&scores.some(c=>[9,10].includes(c.category)))keep=run;
      }
    }
    return actions.find(a=>a.type==='reroll'&&a.keep.join()===keep.join())??immediate;
  }
  throw new Error('Unknown strategy.');
}

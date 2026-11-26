import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Advisor,ALL,Y,lattice,scoreChoices,indexOf,stateOf,freshGame,receiveRoll,fillCategory,totalOf,fairDie,seeded,rollDice,selectAction} from '../web/core.js';
const raw=readFileSync(new URL('../web/data/values.f64',import.meta.url));
const table=new Float64Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const advisor=new Advisor(table);
const fresh={mask:0,upper:0,armed:false};
const close=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

// An independent, deliberately plain scorer for ordinary (non-joker) hands.
function referenceScore(dice,c){
  const sorted=[...dice].sort((a,b)=>a-b),total=dice.reduce((a,b)=>a+b,0);
  if(c<6)return dice.filter(d=>d===c+1).reduce((a,b)=>a+b,0);
  const groups=[...new Set(dice)].map(d=>dice.filter(x=>x===d).length).sort();
  if(c===6||c===7)return Math.max(...groups)>=c-3?total:0;
  if(c===8)return groups.join(',')==='2,3'?25:0;
  if(c===9)return ['1234','2345','3456'].some(run=>[...run].every(x=>dice.includes(+x)))?30:0;
  if(c===10)return ['12345','23456'].includes(sorted.join(''))?40:0;
  if(c===11)return groups.length===1?50:0;
  return total;
}
test('all 7,776 ordered rolls match an independent scorer in all 13 categories',()=>{
  let sum=0;
  for(let n=0;n<7776;n++){
    let k=n;const dice=Array.from({length:5},()=>{const x=k%6+1;k=Math.floor(k/6);return x;});
    for(const c of scoreChoices(fresh,dice))assert.equal(c.points,referenceScore(dice,c.category));
    sum+=dice.reduce((a,b)=>a+b,0);
  }
  close(sum/7776,17.5);
});
test('the multiset lattice has exactly 252 full rolls and 462 partial holds',()=>{
  assert.equal(lattice.nodes.length,462);assert.equal(lattice.rolls.length,252);
  assert.deepEqual(lattice.levels.map(l=>l.length),[1,6,21,56,126,252]);
});
test('strict Joker forces matching upper first, even when Yahtzee was zeroed',()=>{
  for(const armed of [false,true]){
    const options=scoreChoices({mask:1<<Y,upper:0,armed},[4,4,4,4,4]);
    assert.deepEqual(options.map(o=>o.category),[3]);assert.equal(options[0].points,20);
    assert.equal(options[0].extra,armed?100:0);
  }
});
test('Joker falls back to lower categories, then an upper zero',()=>{
  const lower=scoreChoices({mask:(1<<Y)|(1<<3),upper:0,armed:true},[4,4,4,4,4]);
  assert.ok(lower.every(c=>c.category>=6));assert.equal(lower.find(c=>c.category===10).points,40);
  const upper=scoreChoices({mask:ALL^1,upper:60,armed:true},[4,4,4,4,4]);
  assert.equal(upper.length,1);assert.equal(upper[0].points,0);assert.equal(upper[0].extra,100);
});
test('upper bonus is awarded once at the threshold',()=>{
  const option=scoreChoices({...fresh,upper:60},[1,1,1,4,6])[0];assert.equal(option.bonus,35);
  assert.equal(scoreChoices({...fresh,upper:63},[1,1,1,4,6])[0].bonus,0);
});
test('table bytes and ruleset are pinned by a hash, not just an expected mean',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../web/data/manifest.json',import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'),manifest.sha256);
  close(table[0],254.587728734496,1e-9);
});
test('independent analytic endgame: Chance only, three rolls, EV = 70/3',()=>{
  close(advisor.value({mask:ALL^(1<<12),upper:63,armed:false}),70/3);
});
test('independent analytic endgame: Ones only without upper bonus, EV = 455/216',()=>{
  close(advisor.value({mask:ALL^1,upper:0,armed:false}),5*(1-(5/6)**3));
});
// Slow ordered-outcome oracle, independent of the compressed lattice and table solver.
function oneRollOracle(state,dice){
  let best=-Infinity;
  for(let bits=0;bits<32;bits++){
    const base=dice.map((v,i)=>bits&(1<<i)?v:null),open=base.map((v,i)=>v===null?i:-1).filter(i=>i>=0);
    let sum=0,number=6**open.length;
    for(let n=0;n<number;n++){
      let k=n;const d=[...base];for(const i of open){d[i]=k%6+1;k=Math.floor(k/6);}
      sum+=Math.max(...scoreChoices(state,d).map(c=>c.reward+advisor.value(c.next)));
    }
    best=Math.max(best,sum/number);
  }
  return best;
}
test('current-turn values match ordered exhaustive enumeration in diverse states',()=>{
  const cases=[
    [fresh,[2,3,4,5,5]],
    [{mask:ALL^(1<<10),upper:63,armed:false},[2,3,4,5,5]],
    [{mask:(1<<Y)|3,upper:8,armed:true},[6,6,6,6,6]],
    [{mask:ALL^((1<<0)|(1<<12)),upper:60,armed:false},[1,1,2,5,6]],
    [{mask:ALL^(1<<8),upper:63,armed:false},[3,3,3,4,6]],
  ];
  for(const [state,dice]of cases)close(advisor.analyze(state,dice,1).best.ev,oneRollOracle(state,dice),1e-8);
});
test('one/two rerolls to a large straight have success 1/3 and 5/9',()=>{
  const s={mask:ALL^(1<<10),upper:63,armed:false};
  close(advisor.analyze(s,[2,3,4,5,5],1).best.ev,40/3);
  close(advisor.analyze(s,[2,3,4,5,5],2).best.ev,40*5/9);
});
test('permuting dice never changes EV',()=>{
  close(advisor.analyze(fresh,[2,3,3,5,6],2).best.ev,advisor.analyze(fresh,[6,3,5,2,3],2).best.ev);
});
test('browser recurrence reproduces the native start-of-game Bellman value',()=>{
  let ev=0;
  for(let n=0;n<7776;n++){
    let k=n;const dice=Array.from({length:5},()=>{const d=k%6+1;k=Math.floor(k/6);return d;});
    ev+=advisor.analyze(fresh,dice,2).best.ev/7776;
  }
  close(ev,advisor.value(fresh),1e-8);
});
test('64 independently selected scorecard states satisfy the full-game Bellman equation',()=>{
  const rng=seeded(0xdecafbad),factorial=[1,1,2,6,24,120];
  const weights=lattice.rolls.map(d=>{
    const counts=Array.from({length:6},(_,f)=>d.filter(x=>x===f+1).length);
    return 120/counts.reduce((a,n)=>a*factorial[n],1)/7776;
  });
  close(weights.reduce((a,b)=>a+b,0),1);
  for(let n=0;n<64;n++){
    const mask=rng()%ALL,maxUpper=Math.min(63,Array.from({length:6},(_,f)=>mask&(1<<f)?5*(f+1):0).reduce((a,b)=>a+b,0));
    const state={mask,upper:rng()%(maxUpper+1),armed:!!(mask&(1<<Y))&&!!(rng()&1)};
    let ev=0;
    lattice.rolls.forEach((dice,r)=>ev+=weights[r]*advisor.analyze(state,dice,2).best.ev);
    close(ev,advisor.value(state),1e-8);
  }
});
test('dice rejection sampling rejects the four out-of-range 32-bit integers',()=>{
  const samples=[4294967295,4294967294,4294967293,4294967292,0];
  assert.equal(fairDie(()=>samples.shift()),1);assert.equal(samples.length,0);
});
test('a held die cannot change, invalid input is rejected, and scorecard fills once',()=>{
  let g=receiveRoll(freshGame(),[1,2,3,4,5]);g.kept[0]=true;
  assert.throws(()=>receiveRoll(g,[2,2,3,4,5]));
  assert.throws(()=>receiveRoll(g,[0,2,3,4,5]));
  g=fillCategory(g,10);assert.equal(totalOf(g),40);assert.equal(g.rolls,0);
  assert.throws(()=>fillCategory(g,10));
});
test('all four players finish legal full games; seeded runs are reproducible',()=>{
  for(const strategy of ['optimal','greedy','heuristic','random']){
    function play(seed){let g=freshGame(),rng=seeded(seed);
      for(let round=0;round<13;round++){
        g=rollDice(g,rng);
        for(let decision=0;decision<3;decision++){
          const a=selectAction(strategy,advisor.analyze(stateOf(g.card),g.dice,3-g.rolls),g,rng);
          if(a.type==='score'){g=fillCategory(g,a.category);break;}
          const keep=[...a.keep];g.kept=g.dice.map(v=>{let i=keep.indexOf(v);if(i<0)return false;keep.splice(i,1);return true;});
          g=rollDice(g,rng);
        }
      }assert.equal(stateOf(g.card).mask,ALL);return totalOf(g);
    }
    assert.equal(play(2026),play(2026));
  }
});

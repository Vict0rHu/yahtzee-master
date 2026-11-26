// SPDX-License-Identifier: MIT
import {ALL,CATEGORIES,RULESET,freshGame,stateOf,totalOf,scoreChoices,receiveRoll,rollDice,fillCategory,setHeldValues} from './core.js';

const $=id=>document.getElementById(id);
const names={you:'Optimal',optimal:'Optimal',greedy:'Greedy',heuristic:'Rule of thumb',random:'Random'};
const descriptions={you:'Looks beyond this turn to your best average final score.',optimal:'Looks beyond this turn to your best average final score.',greedy:'Chases the best average score this turn. Future turns are not optimized.',heuristic:'Keeps matching dice or a promising straight. A simple, human-style strategy.',random:'Makes random legal choices. Sometimes surprisingly lucky.'};
const pipPositions={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
let game=freshGame(),strategy='you',undo=[],pending=null,analysis=null,ready=false,engineError='',manifest=null;
let running=false,animating=false,requestId=0,latestRequest=0,compareOpen=false,focusBeforeDialog=null;
const waiting=new Map();
const nextUint32=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:ms));
const f=n=>Number(n).toFixed(2);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function restore(){
  try{
    const saved=JSON.parse(localStorage.getItem('yahtzee-master:v1'));
    if(!saved)return;
    const g=saved.game;
    if(!g||g.version!==1||!['play','table'].includes(g.mode)||!Array.isArray(g.card)||g.card.length!==13||!Array.isArray(g.log)||g.log.length>13)throw Error();
    let replay=freshGame(g.mode);
    for(const entry of g.log){replay=receiveRoll(replay,entry.dice);replay=fillCategory(replay,entry.category);}
    if(JSON.stringify(g.card)!==JSON.stringify(replay.card)||g.extra!==replay.extra)throw Error();
    if(!Array.isArray(g.kept)||g.kept.length!==5||g.kept.some(x=>typeof x!=='boolean')||!Number.isInteger(g.rolls)||g.rolls<0||g.rolls>3)throw Error();
    if(g.rolls>0){receiveRoll({...replay,rolls:0},g.dice);if(stateOf(g.card).mask===ALL)throw Error();}
    else if(g.dice!==null)throw Error();
    game=g;if(Object.hasOwn(names,saved.strategy))strategy=saved.strategy;
    if(game.mode==='table'&&!game.dice&&stateOf(game.card).mask!==ALL)pending=Array(5).fill(null);
  }catch{game=freshGame();}
}
function persist(){try{localStorage.setItem('yahtzee-master:v1',JSON.stringify({game,strategy}));}catch{}}
function remember(){undo.push(structuredClone(game));if(undo.length>40)undo.shift();}
function notice(message=''){$('notice').textContent=message;}
function changed(){analysis=null;latestRequest=++requestId;persist();render();if(game.dice&&!pending&&ready)void askAdvisor();}

function askAdvisor(){
  if(!game.dice||pending||!ready)return Promise.resolve(null);
  const id=++requestId;latestRequest=id;
  return new Promise(resolve=>{
    waiting.set(id,resolve);
    worker.postMessage({type:'analyze',id,game:structuredClone(game),strategy:strategy==='you'?'optimal':strategy,seed:nextUint32()});
  });
}
worker.onmessage=({data})=>{
  if(data.type==='ready'){
    ready=true;manifest=data.manifest;render();if(game.dice&&!pending)void askAdvisor();
  }else if(data.type==='error'){
    engineError=data.message;render();
  }else if(data.type==='analysis'||data.type==='analysis-error'){
    if(data.id===latestRequest){
      if(data.type==='analysis'){analysis=data;notice();}else notice(data.message);
      render();
    }
    waiting.get(data.id)?.(data.type==='analysis'?data:null);waiting.delete(data.id);
  }
};
worker.onerror=()=>{engineError='The advisor could not start. Reload to try again.';render();for(const resolve of waiting.values())resolve(null);waiting.clear();};

function miniDie(v){return `<span class="mini-die" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i${pipPositions[v].includes(i)?'':' class="off"'}></i>`).join('')}</span>`;}
function renderDice(){
  const values=pending??game.dice??Array(5).fill(null);
  $('dice-tray').innerHTML=values.map((v,i)=>{
    const held=game.kept[i]&&!!game.dice;
    const editable=pending&&!held,canHold=!pending&&game.dice&&game.rolls<3&&!running&&!animating;
    const label=editable?`Set die ${i+1}${v?`, currently ${v}`:''}`:`Die ${i+1}${v?`: ${v}`:''}${held?', held':''}`;
    return `<div class="die-wrap"><button class="die ${held?'held ':''}${v?'':'empty'}" data-die="${i}" aria-label="${label}" aria-pressed="${held}" ${(!editable&&!canHold)||running||animating?'disabled':''}>${v?Array.from({length:9},(_,p)=>`<span class="pip ${pipPositions[v].includes(p)?'':'off'}"></span>`).join(''):'<span class="question">?</span>'}</button><span class="die-label ${held||editable?'':'idle'}" aria-hidden="${!(held||editable)}">${held?'HELD':editable?'SET':''}</span></div>`;
  }).join('');
  $('dice-tray').classList.toggle('rolling',animating);
}
function renderScorecard(){
  const choices=game.dice&&!pending?scoreChoices(stateOf(game.card),game.dice):[];
  const selected=analysis?.selected;
  const renderRow=(c)=>{
    const value=game.card[c],choice=choices.find(a=>a.category===c),filled=value!==null;
    const suggested=!filled&&selected?.type==='score'&&selected.category===c;
    const canScore=!filled&&choice&&!pending&&!running&&!animating;
    const score=filled?value:choice?choice.points:'—';
    return `<button class="score-row ${filled?'filled':choice?'available':game.dice&&!pending?'blocked':''} ${suggested?'suggested':''}" data-category="${c}" ${canScore?'':'disabled'} aria-label="${CATEGORIES[c][0]}: ${filled?`${value} points, filled`:choice?`score ${choice.points} points`:'not available'}"><span class="row-name"><span class="category-icon">${c<6?miniDie(c+1):escape(CATEGORIES[c][2])}</span>${CATEGORIES[c][0]}</span><span class="score-value">${score}</span></button>`;
  };
  $('upper-scores').innerHTML=Array.from({length:6},(_,c)=>renderRow(c)).join('');
  $('lower-scores').innerHTML=Array.from({length:7},(_,i)=>renderRow(i+6)).join('');
  $('total-score').textContent=totalOf(game);
  const upper=game.card.slice(0,6).reduce((a,b)=>a+(b??0),0);
  $('bonus-fraction').innerHTML=`${upper} <span>/ 63</span>`;
  $('bonus-progress').style.width=`${Math.min(100,upper/63*100)}%`;
  $('bonus-caption').innerHTML=upper>=63?'Bonus unlocked. <strong>+35 points</strong>':`Reach 63 to unlock <strong>+35 points</strong>`;
  $('extra-score').textContent=`+${game.extra*100}`;
  $('score-column-label').textContent=game.dice&&!pending?'TAKE / SCORE':'SCORE';
}
function actionTitle(a){
  if(a.type==='score')return `Score ${a.points} in ${CATEGORIES[a.category][0]}`;
  return a.keep.length?`Keep ${a.keep.join(' · ')}`:'Reroll all five dice';
}
function actionExplanation(a){
  if(a.type==='score')return `${CATEGORIES[a.category][1]}.${a.extra?' Plus a 100-point Yahtzee bonus.':''}${a.bonus?' Plus the 35-point upper bonus.':''}`;
  const n=5-a.keep.length;
  return `Reroll ${n===1?'the other die':n+' dice'}. ${descriptions[strategy]}`;
}
function actionButton(a){
  if(a.type==='score')return `Take ${a.points}${a.extra||a.bonus?` + ${a.extra+a.bonus}`:''} points`;
  if(game.mode==='table')return 'Hold these & enter next roll';
  return a.keep.length?'Hold these & roll again':'Reroll all five';
}
function renderAdvice(){
  const finished=stateOf(game.card).mask===ALL;
  if(finished){
    $('advice-content').innerHTML=`<div class="advice-card"><span class="eyebrow">THAT’S A WRAP</span><h3>Thirteen turns. Nicely played.</h3><div class="finish-score">${totalOf(game)}</div><p>Your final score. Every game brings a new set of possibilities.</p><div class="finish-actions"><button class="advice-button" id="again-button">Play again</button></div></div>`;return;
  }
  if(!game.dice||pending){
    const n=game.mode==='table'?'Bring your dice. We’ll do the math.':'A little luck. A lot of possibility.';
    const desc=game.mode==='table'?'Enter your real roll for a recommendation that considers every remaining round.':'Roll your dice to see the best move, alternatives, and expected final score.';
    $('advice-content').innerHTML=`<div class="advice-empty"><div><h3>${n}</h3><p>${desc}</p></div>${!game.log.length&&game.rolls===0&&manifest?`<div class="initial-ev">${f(manifest.initialEV)}<small>OPTIMAL STARTING EV</small></div>`:''}</div>`;return;
  }
  if(!analysis){
    $('advice-content').innerHTML=`<div class="advice-empty"><div><h3>${engineError?'Your game still works.':ready?'Considering every possibility…':'Preparing your advisor…'}</h3><p>${engineError?escape(engineError):'The advisor considers your scorecard, bonuses, and all future rounds.'}</p></div></div>`;return;
  }
  const a=analysis.selected,total=totalOf(game),best=analysis.actions[0];
  const alternatives=analysis.actions.filter(b=>b.key!==a.key).slice(0,6);
  $('advice-content').innerHTML=`<div class="advice-card">${strategy!=='you'&&strategy!=='optimal'?`<span class="strategy-badge">${names[strategy]} PLAYER</span>`:''}<h3>${actionTitle(a)}</h3><p>${actionExplanation(a)}</p><div class="ev-line"><span class="ev-label">Expected final score${a.loss>.005?`<br><span style="color:#f1b998">${f(a.loss)} below the best move</span>`:''}</span><span class="ev-value">${f(total+a.ev)}<small>pts</small></span></div><button class="advice-button" id="apply-button" ${running||animating?'disabled':''}>${actionButton(a)}</button></div><details class="compare" ${compareOpen?'open':''}><summary>Compare other moves</summary>${alternatives.map(b=>`<div class="compare-row"><span>${actionTitle(b)}<small>${b.type==='reroll'?`Reroll ${5-b.keep.length} dice`:CATEGORIES[b.category][1]}</small></span><span class="compare-values">${f(total+b.ev)}<small class="${b.loss>.005?'loss':''}">${b.loss<.005?'Equally good':`−${f(b.loss)} EV`}</small></span></div>`).join('')}<p class="compare-footnote">Final-score expectation assumes optimal play after this choice. It is not a promise or your chance of winning. Fair, independent dice · strict Joker rules.</p></details>`;
  $('advice-content').querySelector('details')?.addEventListener('toggle',e=>compareOpen=e.target.open);
}
function render(){
  const focused=document.activeElement?.dataset?.die;
  const finished=stateOf(game.card).mask===ALL;
  $('mode-play').classList.toggle('active',game.mode==='play');$('mode-table').classList.toggle('active',game.mode==='table');
  $('mode-play').setAttribute('aria-pressed',String(game.mode==='play'));$('mode-table').setAttribute('aria-pressed',String(game.mode==='table'));
  $('round-label').textContent=finished?'ALL 13 ROUNDS COMPLETE':`ROUND ${String(game.log.length+1).padStart(2,'0')} OF 13`;
  $('turn-title').textContent=finished?'Well played.':game.mode==='table'?'Your table. Your edge.':running?'Making a move…':'Your move.';
  $('turn-description').textContent=finished?`${totalOf(game)} points. Ready for another?`:game.mode==='table'?'Real dice. The same full-game strategy.':'Five dice. A little luck. A better next move.';
  $('roll-number').innerHTML=`${game.rolls}<span>/3</span>`;
  $('engine-status').innerHTML=`<span class="status-light ${engineError?'error':ready?'':'loading'}"></span><span>${engineError?'Advisor unavailable':ready?'Full-game strategy ready':'Loading strategy…'}</span>`;
  renderDice();renderScorecard();renderAdvice();
  $('dice-instruction').textContent=finished?'Your scorecard is complete.':pending?'Tap each unheld die to enter its face.':game.rolls===3?'Choose a category on your scorecard.':game.dice?'Tap dice to hold them. Pick a score at any time.':game.mode==='table'?'Enter your first roll to get started.':'Roll to get started.';
  const computer=game.mode==='play'&&strategy!=='you';
  $('roll-button').querySelector('span').textContent=finished?'Game complete':running?'Playing this turn…':pending?'Analyze dice':game.mode==='table'?'Enter next roll':computer?'Play turn':game.rolls===3?'Choose a score':game.rolls?'Roll again':'Roll dice';
  $('roll-button').disabled=finished||running||animating||(pending?pending.some(d=>!d):!computer&&game.rolls>=3)||computer&&!ready;
  $('undo-button').disabled=!undo.length||running||animating;
  const playerPicker=$('player-select');
  playerPicker.querySelector('option[value="you"]').hidden=game.mode==='table';
  const optionLabels=game.mode==='table'?{optimal:'Optimal · full-game expectation',greedy:'Greedy · this turn only',heuristic:'Rule of thumb · simple rules',random:'Random · legal choices'}:{optimal:'Computer · Optimal',greedy:'Computer · Greedy',heuristic:'Computer · Rule of thumb',random:'Computer · Random'};
  for(const [value,label]of Object.entries(optionLabels))playerPicker.querySelector(`option[value="${value}"]`).textContent=label;
  playerPicker.value=game.mode==='table'&&strategy==='you'?'optimal':strategy;playerPicker.disabled=running||animating;
  document.querySelector('label[for="player-select"]').textContent=game.mode==='table'?'Choose your advisor style':'Who’s making the moves?';
  $('new-button').disabled=running||animating;
  $('mode-play').disabled=running||animating;$('mode-table').disabled=running||animating;
  const last=game.log.at(-1);$('last-turn').hidden=!last;
  if(last)$('last-turn').innerHTML=`<div><p class="eyebrow">ROUND ${String(last.round).padStart(2,'0')} · BANKED</p><p>${CATEGORIES[last.category][0]} <span style="color:#72839e">· ${last.dice.join(' · ')}</span></p></div><strong>+${last.points+last.extra+last.bonus}</strong>`;
  if(focused!==undefined)document.querySelector(`[data-die="${focused}"]`)?.focus({preventScroll:true});
}
async function animatedRoll(){
  remember();animating=true;render();await delay(220);
  game=rollDice(game,nextUint32);animating=false;analysis=null;persist();render();return await askAdvisor();
}
function beginEntry(){pending=game.dice?game.dice.map((d,i)=>game.kept[i]?d:null):Array(5).fill(null);analysis=null;latestRequest=++requestId;render();}
async function mainAction(){
  if(running||animating)return;
  notice();
  if(pending){remember();game=receiveRoll(game,pending);pending=null;changed();return;}
  if(game.mode==='table'){beginEntry();return;}
  if(strategy!=='you'){await playTurn();return;}
  await animatedRoll();
}
async function applyAction(a,fromComputer=false){
  if(!a||animating||running&&!fromComputer)return;
  if(a.type==='score'){
    remember();game=fillCategory(game,a.category);pending=game.mode==='table'&&stateOf(game.card).mask!==ALL?Array(5).fill(null):null;changed();
  }else{
    game=setHeldValues(game,a.keep);
    if(game.mode==='table')beginEntry();else await animatedRoll();
  }
}
async function playTurn(){
  if(!ready)return;running=true;render();
  try{
    let data=game.dice?await askAdvisor():await animatedRoll();
    while(data&&game.dice){
      await delay(450);
      const a=data.selected;
      if(a.type==='score'){await applyAction(a,true);break;}
      game=setHeldValues(game,a.keep);render();await delay(350);data=await animatedRoll();
    }
  }catch(e){notice(e.message);}finally{running=false;render();}
}
function openDialog(content){focusBeforeDialog=document.activeElement;$('dialog-content').innerHTML=content;if(!$('dialog').open)$('dialog').showModal();}
function closeDialog(){$('dialog').close();focusBeforeDialog?.focus?.({preventScroll:true});}
function facePicker(i){
  openDialog(`<div class="dialog-inner"><span class="eyebrow">AT THE TABLE</span><h2>What did die ${i+1} roll?</h2><p>Choose the face showing on your real die.</p><div class="face-picker">${[1,2,3,4,5,6].map(v=>`<button class="face-choice" data-face="${v}" aria-label="${v}">${v}</button>`).join('')}</div><button class="secondary-button" data-close style="width:100%">Done</button></div>`);
  $('dialog-content').querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>{
    pending[i]=+b.dataset.face;render();const next=pending.findIndex((v,j)=>j>i&&!v);
    if(next>=0)facePicker(next);else closeDialog();
  });
}
function confirmScore(c){
  const choice=scoreChoices(stateOf(game.card),game.dice).find(a=>a.category===c);if(!choice)return;
  const evaluated=analysis?.actions.find(a=>a.type==='score'&&a.category===c);
  openDialog(`<div class="dialog-inner"><span class="eyebrow">${CATEGORIES[c][0].toUpperCase()}</span><h2>Bank ${choice.reward} points?</h2><p>${CATEGORIES[c][1]}.${choice.extra?' Includes a 100-point extra Yahtzee bonus.':''}${choice.bonus?' You also unlock the 35-point upper bonus.':''}</p>${evaluated?`<p>Expected finish: <strong style="color:#eff4ff">${f(totalOf(game)+evaluated.ev)}</strong><br>${evaluated.loss<.005?'This matches the best move.':`${f(evaluated.loss)} expected points below the best move.`}</p>`:''}<div class="dialog-actions"><button class="secondary-button" data-close>Keep playing</button><button class="primary-button" id="confirm-score">Score ${choice.reward}</button></div></div>`);
  $('confirm-score').onclick=()=>{closeDialog();void applyAction(choice);};
}
function reset(){
  game=freshGame(game.mode);undo=[];pending=game.mode==='table'?Array(5).fill(null):null;notice();closeDialog();changed();
}
function newGame(){
  if(!game.log.length&&!game.rolls&&!pending?.some(Boolean)){reset();return;}
  openDialog('<div class="dialog-inner"><span class="eyebrow">A CLEAN SCORECARD</span><h2>Ready for a new game?</h2><p>Your current game will be replaced.</p><div class="dialog-actions"><button class="secondary-button" data-close>Keep this game</button><button class="primary-button" id="confirm-new">New game</button></div></div>');
  $('confirm-new').onclick=reset;
}
function showAbout(){
  openDialog(`<div class="dialog-inner"><span class="eyebrow">EVERY ROLL HAS POSSIBILITIES</span><h2>Five dice. Thirteen choices.</h2><ol class="rule-list"><li>Roll up to three times per turn. Keep any dice and reroll the rest.</li><li>Fill one empty scorecard category each turn. A category can score zero.</li><li>Reach 63 in the upper section for a 35-point bonus. The highest total after 13 rounds wins.</li></ol><p><strong style="color:#f2f5fa">Play online</strong> with fair, independently generated dice, or choose <strong style="color:#f2f5fa">At the table</strong> and enter your real rolls. Your game saves on this device.</p><p>The advisor compares every legal move using a full-game value table. It maximizes average final score, not the probability of beating an opponent.</p><p class="fine-print">Strict Hasbro Joker rules. A repeated Yahtzee follows the required scoring order, even if your Yahtzee box was zeroed. Optimal start: ${manifest?manifest.initialEV.toFixed(9):'254.587728734'} points. Numerical expectations use Float64. No language model is required.</p><p class="fine-print"><a href="./README.md" target="_blank">Read the mathematics and validation</a> · <a href="./LICENSE" target="_blank">MIT license</a><br>Independent project. Not affiliated with Hasbro.</p><button class="primary-button" data-close style="width:100%;margin-top:22px">Let’s play</button></div>`);
}
$('dice-tray').onclick=e=>{
  const b=e.target.closest('[data-die]');if(!b||b.disabled)return;const i=+b.dataset.die;
  if(pending)facePicker(i);else{game={...game,kept:game.kept.map((v,j)=>j===i?!v:v)};persist();render();}
};
$('roll-button').onclick=()=>void mainAction().catch(e=>notice(e.message));
$('undo-button').onclick=()=>{
  if(!undo.length)return;game=undo.pop();pending=game.mode==='table'&&!game.dice?Array(5).fill(null):null;notice('Last action undone.');changed();
};
$('player-select').onchange=e=>{strategy=e.target.value;persist();analysis=null;render();if(game.dice&&!pending&&ready)void askAdvisor();};
for(const mode of ['play','table'])$('mode-'+mode).onclick=()=>{
  if(game.mode===mode)return;game={...game,mode};pending=mode==='table'&&!game.dice?Array(5).fill(null):null;notice();changed();
};
for(const id of ['upper-scores','lower-scores'])$(id).onclick=e=>{const b=e.target.closest('[data-category]');if(b&&!b.disabled)confirmScore(+b.dataset.category);};
$('advice-content').onclick=e=>{
  if(e.target.closest('#apply-button'))void applyAction(analysis?.selected).catch(err=>notice(err.message));
  if(e.target.closest('#again-button'))newGame();
};
$('new-button').onclick=newGame;$('about-button').onclick=showAbout;$('rules-button').onclick=showAbout;
$('dialog').onclick=e=>{if(e.target.closest('[data-close]')||e.target===$('dialog'))closeDialog();};
document.addEventListener('keydown',e=>{
  if($('dialog').open||e.ctrlKey||e.metaKey||e.altKey||['SELECT','INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  if(e.code==='Space'){e.preventDefault();if(!$('roll-button').disabled)void mainAction();}
  const i=Number(e.key)-1;if(i>=0&&i<5)document.querySelector(`[data-die="${i}"]`)?.click();
});
restore();render();worker.postMessage({type:'init'});

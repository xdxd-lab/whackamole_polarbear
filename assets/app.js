(() => {
  'use strict';
  const VERSION = '20260909-v15';
  const BEST_KEY = 'wam_best_20260904v7';
  const $ = id => document.getElementById(id);
  const board = $('board'), overlay = $('overlay');
  const startBtn = $('startBtn'), modalBtn = $('modalBtn'), difficulty = $('difficulty');
  const settings = {
    easy: {spawn: 1050, show: 780},
    normal: {spawn: 850, show: 600},
    hard: {spawn: 650, show: 470}
  };
  const states = ['peek','warning','sneaky','pain','sad'];
  const statePosition={peek:'0%',warning:'25%',sneaky:'50%',pain:'75%',sad:'100%'};
  const speciesByType = {bad:'bear', bonus:'fox', normal:'penguin'};
  const names = {bear:'北極熊',fox:'北極狐',penguin:'企鵝'};
  const holes = [];
  for (let i=0;i<9;i++) {
    const h = document.createElement('button');
    h.type = 'button'; h.className = 'hole'; h.dataset.state = 'hidden';
    h.setAttribute('aria-label', `洞 ${i+1}`);
    h.innerHTML = '<div class="mole"><div class="penguin-img" aria-hidden="true"></div><div class="fox-img" aria-hidden="true"></div><div class="bear-img" aria-hidden="true"></div></div>';
    h.addEventListener('pointerdown', e => {e.preventDefault(); hit(i);});
    h.addEventListener('keydown', e => {
      if(e.key==='Enter'||e.key===' '){e.preventDefault();hit(i);}
    });
    board.appendChild(h); holes.push(h);
  }
  let running=false, loading=false, ready=false, loadError=null;
  let score=0, combo=0, maxCombo=0, timeLeft=30, best=0;
  let actor=null, lastHole=-1, session=0, clockTimer=null, started=0;
  let soundOn=true, audioCtx=null;
  const timers=new Set(), activeAudio=new Set();
  try {best=Math.max(0,Number(localStorage.getItem(BEST_KEY))||0);} catch (_) {}
  $('best').textContent=best;
  function beep(freq=440,dur=.06,type='sine',vol=.05){
    if(!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type=type;o.frequency.value=freq;g.gain.value=vol;
      o.connect(g);g.connect(audioCtx.destination);activeAudio.add(o);
      o.onended=()=>{activeAudio.delete(o);o.disconnect();g.disconnect();};
      o.start();g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.stop(audioCtx.currentTime+dur);
    } catch (_) {}
  }
  function vibrate(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(_){} }
  function later(fn,ms){
    const generation=session;
    const id=setTimeout(()=>{timers.delete(id);if(running&&generation===session)fn();},ms);
    timers.add(id);return id;
  }
  function cancel(id){if(id!=null){clearTimeout(id);timers.delete(id);}}
  function clearTimers(){timers.forEach(clearTimeout);timers.clear();}
  function update(){
    $('score').textContent=score;$('combo').textContent=combo;
    $('time').textContent=Math.max(0,Math.ceil(timeLeft));
    $('bar').style.transform=`scaleX(${Math.max(0,timeLeft/30)})`;
  }
  function showToast(text){
    const el=$('toast');el.textContent=text;el.classList.remove('show');
    void el.offsetWidth;el.classList.add('show');
  }
  function resetHole(h){
    h.dataset.state='hidden';
    const m=h.querySelector('.mole');m.style.visibility='hidden';
    m.getAnimations().forEach(a=>a.cancel());
    h.className='hole';delete h.dataset.character;delete h.dataset.outcome;
    m.className='mole';m.removeAttribute('style');
    h.setAttribute('aria-label',`洞 ${holes.indexOf(h)+1}`);
  }
  function resetAll(){holes.forEach(resetHole);actor=null;}
  function setState(a,state){
    a.phase=state;a.h.dataset.state=state;
    a.h.classList.remove(...states.map(s=>`${a.species}-${s}`));
    if(state!=='peek') a.h.classList.add(`${a.species}-${state}`);
    const img=a.m.querySelector(`.${a.species}-img`);
    img.style.backgroundPositionX=statePosition[state];
    a.h.setAttribute('aria-label',`${names[a.species]}，${state==='peek'||state==='warning'?(a.type==='bad'?'別打！':a.type==='bonus'?'+3 分':'+1 分'):'已離開可打擊階段'}`);
  }
  function spawn(){
    if(!running)return;
    resetAll();
    let i;do{i=Math.floor(Math.random()*holes.length);}while(i===lastHole);lastHole=i;
    const r=Math.random(),type=r<.12?'bad':r<.34?'bonus':'normal';
    const h=holes[i],m=h.querySelector('.mole'),species=speciesByType[type];
    const cfg=settings[difficulty.value]||settings.normal;
    const recovered=Math.round((cfg.spawn-cfg.show)*.5);
    const warningAt=Math.round(cfg.show*.62)+recovered;
    const hideAt=cfg.show+recovered;
    const a={i,h,m,type,species,phase:'peek',deadline:performance.now()+hideAt,warningTimer:null,hideTimer:null,nextTimer:null};
    actor=a;h.dataset.character=species;
    m.className=`mole ${type}`;h.classList.add('up',`${species}-active`);
    setState(a,'peek');
    a.warningTimer=later(()=>{if(actor===a&&a.phase==='peek')setState(a,'warning');},warningAt);
    a.hideTimer=later(()=>escape(a),hideAt);
    a.nextTimer=later(spawn,cfg.spawn);
  }
  function escape(a){
    if(actor!==a||!['peek','warning'].includes(a.phase))return;
    cancel(a.warningTimer);a.h.dataset.outcome='escape';
    a.h.classList.remove('up');setState(a,'sneaky');
    if(a.type!=='bad')combo=0;
    update();
  }
  function hit(i){
    const a=actor;
    if(!running||!a||a.i!==i||!['peek','warning'].includes(a.phase))return;
    if(performance.now()>=a.deadline){escape(a);return;}
    cancel(a.warningTimer);cancel(a.hideTimer);cancel(a.nextTimer);
    const cs=getComputedStyle(a.m);
    a.m.style.setProperty('bottom',cs.bottom,'important');
    a.m.style.setProperty('left',cs.left,'important');
    a.m.style.setProperty('transition','none','important');
    a.h.dataset.outcome='hit';a.h.classList.remove('up');a.h.classList.add('hit');
    setState(a,'pain');
    let delta;
    if(a.type==='bad'){
      delta=-2;combo=0;beep(120,.12,'sawtooth',.07);vibrate(55);showToast('誤敲北極熊 -2');
    }else{
      delta=a.type==='bonus'?3:1;combo++;maxCombo=Math.max(maxCombo,combo);
      beep(a.type==='bonus'?760:420+Math.min(combo,12)*25,.07,a.type==='bonus'?'triangle':'sine');
      vibrate(a.type==='bonus'?18:10);
      if(combo%5===0){delta++;showToast(`連擊獎勵 +${delta}`);}
      else showToast(`${names[a.species]} +${delta}`);
    }
    score=Math.max(0,score+delta);update();
    later(()=>{
      if(actor!==a||a.phase!=='pain')return;
      a.h.classList.remove('hit');setState(a,'sad');
      const distance=Math.max(0,a.h.clientHeight-a.m.offsetTop+2);
      a.m.animate([{transform:'translateY(0px)'},{transform:`translateY(${distance}px)`}],
        {duration:340,easing:'ease-in',fill:'forwards'});
      later(()=>{
        if(actor!==a)return;
        resetHole(a.h);actor=null;later(spawn,80);
      },340);
    },220);
  }
  ready=true;
  async function start(){
    if(loading)return;
    beep(520,.08,'triangle');
    if(!ready){
      loading=true;startBtn.disabled=true;modalBtn.disabled=true;
      const label=modalBtn.textContent;modalBtn.textContent='圖片載入中…';
      await assetsReady;loading=false;startBtn.disabled=false;modalBtn.disabled=false;modalBtn.textContent=label;
    }
    if(loadError){
      $('modalTitle').textContent='圖片未載入完成';
      $('modalText').textContent='請重新整理網頁。';
      overlay.classList.add('show');return;
    }
    session++;clearTimers();clearInterval(clockTimer);resetAll();
    score=0;combo=0;maxCombo=0;timeLeft=30;running=true;started=performance.now();
    overlay.classList.remove('show');$('finalScore').hidden=true;update();spawn();
    clockTimer=setInterval(()=>{
      timeLeft=Math.max(0,30-(performance.now()-started)/1000);
      if(timeLeft===0)finish();update();
    },100);
  }
  function finish(){
    if(!running)return;
    running=false;session++;clearTimers();clearInterval(clockTimer);resetAll();
    beep(260,.09,'triangle');
    if(score>best){
      best=score;try{localStorage.setItem(BEST_KEY,String(best));}catch(_){}
      $('best').textContent=best;$('modalTitle').textContent='🏆 新紀錄！';
    }else $('modalTitle').textContent='時間到！';
    $('finalScore').textContent=score;$('finalScore').hidden=false;
    $('modalText').innerHTML=`你這局得到 <b>${score}</b> 分，最高連擊 <b>${maxCombo}</b>。再來一局挑戰更高分吧！`;
    modalBtn.textContent='再玩一次';overlay.classList.add('show');update();
  }
  startBtn.addEventListener('click',start);modalBtn.addEventListener('click',start);
  $('soundBtn').addEventListener('click',()=>{
    soundOn=!soundOn;$('soundBtn').textContent=soundOn?'🔊 音效':'🔇 靜音';
    $('soundBtn').setAttribute('aria-pressed',String(soundOn));
    if(soundOn)beep(520);else activeAudio.forEach(o=>{try{o.stop();}catch(_){}});
  });
  difficulty.addEventListener('change',()=>{if(running)start();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)finish();});
  document.documentElement.dataset.gameVersion=VERSION;
  update();
})();

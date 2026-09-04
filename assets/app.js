(() => {
  'use strict';
  const board = document.getElementById('board');
  const scoreEl = document.getElementById('score'), comboEl = document.getElementById('combo'), timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best'), bar = document.getElementById('bar'), overlay = document.getElementById('overlay');
  const modalTitle = document.getElementById('modalTitle'), modalText = document.getElementById('modalText'), modalBtn = document.getElementById('modalBtn'), finalScore = document.getElementById('finalScore');
  const startBtn = document.getElementById('startBtn'), difficulty = document.getElementById('difficulty'), soundBtn = document.getElementById('soundBtn'), toast = document.getElementById('toast');

  const holes = [];
  const penguinImages = {
    peek: 'assets/penguin_peek.webp',
    warning: 'assets/penguin_warning.webp',
    sneaky: 'assets/penguin_sneaky.webp',
    pain: 'assets/penguin_pain.webp',
    sad: 'assets/penguin_sad.webp',
  };
  const bearImages = {
    peek: 'assets/bear_peek.webp',
    warning: 'assets/bear_warning.webp',
    sneaky: 'assets/bear_sneaky.webp',
    pain: 'assets/bear_pain.webp',
    sad: 'assets/bear_sad.webp',
  };
  const foxImages = {
    peek: 'assets/fox_peek.webp',
    warning: 'assets/fox_warning.webp',
    sneaky: 'assets/fox_sneaky.webp',
    pain: 'assets/fox_pain.webp',
    sad: 'assets/fox_sad.webp',
  };
  for (let i=0;i<9;i++) {
    const h=document.createElement('button'); h.className='hole'; h.type='button'; h.setAttribute('aria-label',`洞 ${i+1}`);
    h.innerHTML=`<div class="mole">
      <img class="penguin-img" alt="" aria-hidden="true" />
      <img class="fox-img" alt="" aria-hidden="true" />
      <img class="bear-img" alt="" aria-hidden="true" />
    </div>`;
    board.appendChild(h); holes.push(h);
  }

  let score=0, combo=0, maxCombo=0, timeLeft=30, running=false, lastHole=-1, spawnTimer=null, clockTimer=null, hideTimer=null, stageTimer=null, reactionTimer=null, current=-1, currentType='normal', soundOn=true, audioCtx=null;
  const settings={easy:{spawn:1050,show:780},normal:{spawn:850,show:600},hard:{spawn:650,show:470}};
  const penguinStateClasses=['penguin-warning','penguin-sneaky','penguin-pain','penguin-sad'];
  const bearStateClasses=['bear-warning','bear-sneaky','bear-pain','bear-sad'];
  const foxStateClasses=['fox-warning','fox-sneaky','fox-pain','fox-sad'];
  let best=Number(localStorage.getItem('wam_best_20260904v7')||0); bestEl.textContent=best;

  function beep(freq=440,dur=.06,type='sine',vol=.055){
    if(!soundOn) return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.value=vol;o.connect(g);g.connect(audioCtx.destination);o.start();g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.stop(audioCtx.currentTime+dur);}catch(e){}
  }
  function vibrate(ms){ if(navigator.vibrate) navigator.vibrate(ms); }
  function update(){scoreEl.textContent=score;comboEl.textContent=combo;timeEl.textContent=Math.max(0,Math.ceil(timeLeft));bar.style.transform=`scaleX(${Math.max(0,timeLeft/30)})`;}
  function clearMole(){
    holes.forEach(h=>{
      h.classList.remove('up','hit','penguin-active','bear-active','fox-active',...penguinStateClasses,...bearStateClasses,...foxStateClasses);
      const m=h.querySelector('.mole'); m.className='mole'; delete m.dataset.penguinState; delete m.dataset.bearState; delete m.dataset.foxState;
    });
    current=-1;
    clearTimeout(hideTimer); clearTimeout(stageTimer); clearTimeout(reactionTimer);
  }
  function setPenguinState(h,state){
    const m=h.querySelector('.mole'), img=m.querySelector('.penguin-img');
    m.dataset.penguinState=state; img.src=penguinImages[state];
    h.classList.remove(...penguinStateClasses);
    if(state==='warning')h.classList.add('penguin-warning');
    if(state==='sneaky')h.classList.add('penguin-sneaky');
    if(state==='pain')h.classList.add('penguin-pain');
    if(state==='sad')h.classList.add('penguin-sad');
  }
  function setBearState(h,state){
    const m=h.querySelector('.mole'), img=m.querySelector('.bear-img');
    m.dataset.bearState=state; img.src=bearImages[state];
    h.classList.remove(...bearStateClasses);
    if(state==='warning')h.classList.add('bear-warning');
    if(state==='sneaky')h.classList.add('bear-sneaky');
    if(state==='pain')h.classList.add('bear-pain');
    if(state==='sad')h.classList.add('bear-sad');
  }
  function setFoxState(h,state){
    const m=h.querySelector('.mole'), img=m.querySelector('.fox-img');
    m.dataset.foxState=state; img.src=foxImages[state];
    h.classList.remove(...foxStateClasses);
    if(state==='warning')h.classList.add('fox-warning');
    if(state==='sneaky')h.classList.add('fox-sneaky');
    if(state==='pain')h.classList.add('fox-pain');
    if(state==='sad')h.classList.add('fox-sad');
  }
  function pickHole(){let n; do{n=Math.floor(Math.random()*holes.length)}while(n===lastHole); lastHole=n; return n;}
  function scheduleSpawn(ms){clearTimeout(spawnTimer);spawnTimer=setTimeout(spawn,ms);}
  function spawn(){
    if(!running)return;
    clearMole(); current=pickHole(); const r=Math.random(); currentType=r<.12?'bad':r<.34?'bonus':'normal';
    const h=holes[current], m=h.querySelector('.mole'); m.className='mole '+currentType;
    h.classList.add('up'); if(currentType==='normal') h.classList.add('penguin-active'); if(currentType==='bad') h.classList.add('bear-active'); if(currentType==='bonus') h.classList.add('fox-active'); h.setAttribute('aria-label', currentType==='bad'?'北極熊，別打！':currentType==='bonus'?'北極狐，+3 分':'企鵝，+1 分');
    const cfg=settings[difficulty.value];
    const oldEscapeWindow=Math.max(0,cfg.spawn-cfg.show);
    const recoveredPeek=Math.round(oldEscapeWindow*.5);
    const warningAt=Math.round(cfg.show*.62)+recoveredPeek;
    const hideAt=cfg.show+recoveredPeek;
    if(currentType==='bad'){
      setBearState(h,'peek');
      stageTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='bad'&&h.classList.contains('up')) setBearState(h,'warning');
      },warningAt);
      hideTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='bad'){
          h.classList.remove('up'); setBearState(h,'sneaky'); current=-1; update();
        }
      },hideAt);
    } else if(currentType==='bonus'){
      h.classList.add('fox-active');
      setFoxState(h,'peek');
      stageTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='bonus'&&h.classList.contains('up')) setFoxState(h,'warning');
      },warningAt);
      hideTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='bonus'){
          h.classList.remove('up'); setFoxState(h,'sneaky'); current=-1; combo=0; update();
        }
      },hideAt);
    } else {
      setPenguinState(h,'peek');
      stageTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='normal'&&h.classList.contains('up')) setPenguinState(h,'warning');
      },warningAt);
      hideTimer=setTimeout(()=>{
        if(running&&current>=0&&currentType==='normal'){
          h.classList.remove('up'); setPenguinState(h,'sneaky'); current=-1; combo=0; update();
        }
      },hideAt);
    }
    scheduleSpawn(cfg.spawn);
  }
  function showToast(text){toast.textContent=text;toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');}
  function hit(i){
    if(!running||i!==current||!holes[i].classList.contains('up'))return;
    const h=holes[i];
    h.classList.remove('up'); h.classList.add('hit');
    clearTimeout(hideTimer); clearTimeout(stageTimer);
    let delta=1;
    if(currentType==='bad'){
      delta=-2; combo=0; beep(120,.12,'sawtooth',.07); vibrate(55); showToast('誤敲北極熊 -2');
      clearTimeout(spawnTimer);
      setBearState(h,'pain');
      reactionTimer=setTimeout(()=>{
        if(!running)return;
        h.classList.remove('hit'); setBearState(h,'sad');
        reactionTimer=setTimeout(()=>{
          if(!running)return;
          h.classList.remove('bear-active',...bearStateClasses); h.querySelector('.mole').className='mole'; scheduleSpawn(80);
        },340);
      },220);
    }
    else if(currentType==='bonus'){
      delta=3; combo++; maxCombo=Math.max(maxCombo,combo); beep(760,.08,'triangle',.06); vibrate(18); showToast('北極狐 +3');
      clearTimeout(spawnTimer);
      setFoxState(h,'pain');
      reactionTimer=setTimeout(()=>{
        if(!running)return;
        h.classList.remove('hit'); setFoxState(h,'sad');
        reactionTimer=setTimeout(()=>{
          if(!running)return;
          h.classList.remove('fox-active',...foxStateClasses); h.querySelector('.mole').className='mole'; scheduleSpawn(80);
        },340);
      },220);
    }
    else {
      combo++; maxCombo=Math.max(maxCombo,combo); beep(420+Math.min(combo,12)*25,.055,'sine',.05); vibrate(10); showToast('企鵝 +1');
      clearTimeout(spawnTimer);
      setPenguinState(h,'pain');
      reactionTimer=setTimeout(()=>{
        if(!running)return;
        h.classList.remove('hit'); setPenguinState(h,'sad');
        reactionTimer=setTimeout(()=>{
          if(!running)return;
          h.classList.remove('penguin-active',...penguinStateClasses); h.querySelector('.mole').className='mole'; scheduleSpawn(80);
        },340);
      },220);
    }
    if(currentType!=='bad' && combo>0 && combo%5===0){delta+=1;showToast(`連擊獎勵 +${delta}`)}
    score=Math.max(0,score+delta); current=-1; update();
  }
  holes.forEach((h,i)=>h.addEventListener('pointerdown',e=>{e.preventDefault();hit(i)}));

  function start(){
    clearTimeout(spawnTimer);clearInterval(clockTimer);clearTimeout(hideTimer);clearMole();
    score=0;combo=0;maxCombo=0;timeLeft=30;running=true;overlay.classList.remove('show');finalScore.hidden=true;update();beep(520,.08,'triangle');spawn();
    const started=performance.now();
    clockTimer=setInterval(()=>{timeLeft=30-(performance.now()-started)/1000;if(timeLeft<=0){timeLeft=0;finish()}update()},100);
  }
  function finish(){
    if(!running)return;running=false;clearTimeout(spawnTimer);clearInterval(clockTimer);clearMole();beep(260,.09,'triangle');setTimeout(()=>beep(390,.12,'triangle'),100);
    if(score>best){best=score;localStorage.setItem('wam_best_20260904v7',best);bestEl.textContent=best;modalTitle.textContent='🏆 新紀錄！'}else modalTitle.textContent='時間到！';
    finalScore.textContent=score;finalScore.hidden=false;modalText.innerHTML=`你這局得到 <b>${score}</b> 分，最高連擊 <b>${maxCombo}</b>。再來一局挑戰更高分吧！`;modalBtn.textContent='再玩一次';overlay.classList.add('show');
  }
  startBtn.addEventListener('click',start);modalBtn.addEventListener('click',start);
  soundBtn.addEventListener('click',()=>{soundOn=!soundOn;soundBtn.textContent=soundOn?'🔊 音效':'🔇 靜音';soundBtn.setAttribute('aria-pressed',String(soundOn));if(soundOn)beep(520)});
  difficulty.addEventListener('change',()=>{if(running)start()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)finish()});
  update();
})();
(function(){
  if(window.__scTesterFeedbackWidgetLoaded)return;
  window.__scTesterFeedbackWidgetLoaded=true;

  var SURL='https://ghuqjtdrkwssyqvcubcd.supabase.co';
  var SKEY='sb_publishable_ShIeY18JCYiH8fyXm_anHw_Y1jP2skq';
  var PREV_CTX_KEY='sc_feedback_prev_ctx_v1';
  var HINT_INTERVAL_MS=60000;
  var APP_CHOICES=[
    {key:'algemeen',label:'Algemeen',cls:'sc-app-all'},
    {key:'index',label:'Homepage',cls:'sc-app-index'},
    {key:'sensecorner',label:'SenseCorner',cls:'sc-app-sensecorner'},
    {key:'datesense',label:'DateSense',cls:'sc-app-datesense'},
    {key:'familysense',label:'FamilySense',cls:'sc-app-familysense'},
    {key:'ownsense',label:'OwnSense',cls:'sc-app-ownsense'},
    {key:'selfsense',label:'SelfSense',cls:'sc-app-selfsense'},
    {key:'onboarding',label:'Onboarding',cls:'sc-app-onboarding'}
  ];
  var APP_MAP={
    'index.html':{key:'index',label:'Index'},
    'onboarding.html':{key:'onboarding',label:'Onboarding'},
    'sensecorner.html':{key:'sensecorner',label:'SenseCorner'},
    'datesense.html':{key:'datesense',label:'DateSense'},
    'familysense.html':{key:'familysense',label:'FamilySense'},
    'ownsense.html':{key:'ownsense',label:'OwnSense'},
    'selfsense.html':{key:'selfsense',label:'SelfSense'},
    'admin.html':{key:'admin',label:'Admin'}
  };
  var sb=null;
  var currentUserCache=null;
  try{
    if(window.supabase&&window.supabase.createClient){
      sb=window.supabase.createClient(SURL,SKEY);
    }
  }catch(_e){}
  if(!sb)return;

  injectCss();
  var ui=createUi();
  var currentApp=detectApp();
  var prevCtx=readPrevContext();
  var currentCtx=buildCurrentContext(currentApp);
  writePrevContext(currentCtx,currentApp);

  bindUi(ui,currentApp,prevCtx,currentCtx);
  bootVisibility(ui);
  startHintLoop(ui);

  function detectApp(){
    var file=(window.location.pathname.split('/').pop()||'').toLowerCase();
    return APP_MAP[file]||{key:'unknown',label:'Onbekend'};
  }
  function buildCurrentContext(app){
    var title=String(document.title||'').trim()||app.label;
    var hash=String(window.location.hash||'').trim();
    var hashPart='';
    if(hash){
      var clean=hash.replace(/^#\/?/,'').replace(/[-_]+/g,' ').trim();
      if(clean)hashPart=' -> '+clean;
    }
    return app.label+' -> '+title+hashPart;
  }
  function readPrevContext(){
    try{
      var raw=sessionStorage.getItem(PREV_CTX_KEY);
      if(!raw)return null;
      var obj=JSON.parse(raw);
      if(!obj||typeof obj!=='object')return null;
      return obj;
    }catch(_e){return null;}
  }
  function writePrevContext(ctx,app){
    try{
      sessionStorage.setItem(PREV_CTX_KEY,JSON.stringify({
        app_key:app.key,
        app_label:app.label,
        context:ctx,
        url:String(window.location.href||''),
        ts:new Date().toISOString()
      }));
    }catch(_e){}
  }
  function bindUi(ui,app,prev,current){
    var state={type:'',msg:'',busy:false,appKey:app.key,appLabel:app.label};
    ui.openBtn.addEventListener('click',function(){hideHint(ui);openPanel(ui);});
    ui.backdrop.addEventListener('click',function(ev){if(ev.target===ui.backdrop)closePanel(ui);});
    ui.closeBtn.addEventListener('click',function(){closePanel(ui);});
    ui.text.addEventListener('input',function(){state.msg=String(ui.text.value||'').trim();updateSubmitState();});
    document.addEventListener('keydown',function(ev){
      if(ev.key==='Escape'&&!ui.overlay.hidden)closePanel(ui);
    });
    Array.prototype.slice.call(ui.pills.querySelectorAll('[data-feedback-type]')).forEach(function(btn){
      btn.addEventListener('click',function(){
        state.type=String(btn.getAttribute('data-feedback-type')||'').trim();
        Array.prototype.slice.call(ui.pills.querySelectorAll('[data-feedback-type]')).forEach(function(b){
          b.classList.toggle('active',b===btn);
        });
        ui.pills.classList.remove('needs-choice');
        if(ui.state&&ui.state.classList.contains('err')&&String(ui.state.textContent||'').toLowerCase().indexOf('wat wil je melden')>=0){
          ui.state.textContent='';
          ui.state.classList.remove('err');
        }
        updateSubmitState();
      });
    });
    Array.prototype.slice.call(ui.appPills.querySelectorAll('[data-app-key]')).forEach(function(btn){
      btn.addEventListener('click',function(){
        state.appKey=String(btn.getAttribute('data-app-key')||'').trim()||app.key;
        state.appLabel=String(btn.getAttribute('data-app-label')||'').trim()||app.label;
        Array.prototype.slice.call(ui.appPills.querySelectorAll('[data-app-key]')).forEach(function(b){
          b.classList.toggle('active',b===btn);
        });
      });
    });
    ui.submitBtn.addEventListener('click',async function(){
      await runSubmit();
    });
    async function runSubmit(){
      if(state.busy||!state.msg)return;
      if(!state.type){
        ui.pills.classList.add('needs-choice');
        ui.state.textContent='Duid nog iets aan bij "Wat wil je melden?" (of kies "Iets anders").';
        ui.state.classList.add('err');
        return;
      }
      state.busy=true;
      updateSubmitState();
      ui.submitBtn.classList.add('loading');
      ui.submitBtn.textContent='Versturen...';
      ui.state.textContent='Bezig met verzenden...';
      ui.state.classList.remove('err');
      clearRetry();
      try{
        var user=currentUserCache||await getCurrentUser();
        if(!user||!user.id)throw new Error('Niet ingelogd');
        var payload={
          user_id:user.id,
          user_email:String(user.email||'').trim(),
          user_name:String((user.user_metadata&&(
            user.user_metadata.full_name||user.user_metadata.display_name||user.user_metadata.roepnaam
          ))||'').trim(),
          app_key:state.appKey,
          app_label:state.appLabel,
          feedback_type:state.type,
          message:state.msg,
          current_context:current,
          previous_context:prev&&prev.context?String(prev.context):'',
          current_url:String(window.location.href||''),
          previous_url:prev&&prev.url?String(prev.url):'',
          browser_info:{
            user_agent:String(navigator.userAgent||''),
            language:String(navigator.language||''),
            viewport:(window.innerWidth||0)+'x'+(window.innerHeight||0),
            platform:String(navigator.platform||''),
            online:navigator.onLine!==false
          }
        };
        var ins=await insertFeedbackWithTimeout(payload,8000);
        if(ins&&ins.error)throw new Error(ins.error.message||'Versturen mislukt');
        ui.state.textContent='Bedankt. Binnen!';
        setTimeout(function(){
          resetForm();
          closePanel(ui);
        },650);
      }catch(e){
        var msg=(e&&e.message)||'Versturen mislukt.';
        var isTimeout=String(msg).toLowerCase().indexOf('timeout')>=0;
        if(String(msg).toLowerCase().indexOf('timeout')>=0){
          msg='Duurde te lang om te versturen. Probeer opnieuw.';
        }
        ui.state.textContent=msg;
        ui.state.classList.add('err');
        if(isTimeout)showRetry();
      }finally{
        state.busy=false;
        ui.submitBtn.classList.remove('loading');
        ui.submitBtn.textContent='Verstuur';
        updateSubmitState();
      }
    }
    function clearRetry(){
      if(!ui.retryWrap)return;
      ui.retryWrap.innerHTML='';
      ui.retryWrap.hidden=true;
    }
    function showRetry(){
      if(!ui.retryWrap)return;
      ui.retryWrap.hidden=false;
      ui.retryWrap.innerHTML='<button type="button" class="sc-fb-retry-btn">Probeer opnieuw</button>';
      var b=ui.retryWrap.querySelector('.sc-fb-retry-btn');
      if(!b)return;
      b.addEventListener('click',function(){
        if(state.busy)return;
        runSubmit();
      });
    }

    function updateSubmitState(){
      ui.submitBtn.disabled=!!(state.busy||!state.msg);
    }
    function resetForm(){
      state.type='';
      state.msg='';
      ui.text.value='';
      ui.state.textContent='';
      clearRetry();
      Array.prototype.slice.call(ui.pills.querySelectorAll('[data-feedback-type]')).forEach(function(b){
        b.classList.remove('active');
      });
      applyDefaultAppPill();
      updateSubmitState();
    }
    function applyDefaultAppPill(){
      state.appKey=app.key;
      state.appLabel=app.label;
      var matched=false;
      Array.prototype.slice.call(ui.appPills.querySelectorAll('[data-app-key]')).forEach(function(b){
        var isHit=String(b.getAttribute('data-app-key')||'')===app.key;
        b.classList.toggle('active',isHit);
        if(isHit)matched=true;
      });
      if(!matched){
        var fallback=ui.appPills.querySelector('[data-app-key="algemeen"]');
        if(fallback){
          fallback.classList.add('active');
          state.appKey='algemeen';
          state.appLabel='Algemeen';
        }
      }
    }
    applyDefaultAppPill();
    updateSubmitState();
  }
  async function bootVisibility(ui){
    var user=await getCurrentUser();
    currentUserCache=user;
    setVisibility(ui,!!(user&&user.id));
    if(sb&&sb.auth&&typeof sb.auth.onAuthStateChange==='function'){
      sb.auth.onAuthStateChange(async function(){
        var u=await getCurrentUser();
        currentUserCache=u;
        setVisibility(ui,!!(u&&u.id));
      });
    }
  }
  function setVisibility(ui,show){
    ui.openBtn.style.display=show?'inline-flex':'none';
    if(show)maybeShowHint(ui);
    else{
      closePanel(ui);
      hideHint(ui);
    }
  }
  async function getCurrentUser(){
    try{
      var rs=await sb.auth.getSession();
      return rs&&rs.data&&rs.data.session&&rs.data.session.user?rs.data.session.user:null;
    }catch(_e){return null;}
  }
  function createUi(){
    var host=document.createElement('div');
    host.innerHTML=''
      +'<button type="button" id="scFbOpenBtn" class="sc-fb-open" aria-label="Open feedback paneel">'
      +'<span class="sc-fb-open-dot"></span><span class="sc-fb-open-txt">Tip</span>'
      +'</button>'
      +'<div id="scFbHint" class="sc-fb-hint" hidden>'
      +'<button type="button" class="sc-fb-hint-close" aria-label="Sluiten">x</button>'
      +'Iets te melden? Heel graag!'
      +'</div>'
      +'<div id="scFbOverlay" class="sc-fb-overlay" hidden aria-hidden="true">'
      +'<div class="sc-fb-backdrop"></div>'
      +'<div class="sc-fb-dialog" role="dialog" aria-modal="true" aria-label="Testfeedback">'
      +'<button type="button" class="sc-fb-close" aria-label="Sluiten">x</button>'
      +'<div class="sc-fb-ornament"></div>'
      +'<h3 class="sc-fb-title">Psst... tip voor SenseCorner?</h3>'
      +'<p id="scFbContext" class="sc-fb-context">Schermcontext sturen we automatisch intern mee.</p>'
      +'<div class="sc-fb-section-title">Over welke app gaat het?</div>'
      +'<div id="scFbAppPills" class="sc-fb-app-pills">'
      +APP_CHOICES.map(function(a){
        return '<button type="button" class="'+a.cls+'" data-app-key="'+a.key+'" data-app-label="'+a.label+'">'+a.label+'</button>';
      }).join('')
      +'</div>'
      +'<div class="sc-fb-section-title">Wat wil je melden?</div>'
      +'<div id="scFbPills" class="sc-fb-pills">'
      +'<button type="button" data-feedback-type="werkt_niet">Werkt niet</button>'
      +'<button type="button" data-feedback-type="mis_ik">Mis ik</button>'
      +'<button type="button" data-feedback-type="idee">Idee</button>'
      +'<button type="button" data-feedback-type="top">Top</button>'
      +'<button type="button" data-feedback-type="iets_anders">Iets anders</button>'
      +'</div>'
      +'<textarea id="scFbText" class="sc-fb-text" placeholder="In een of twee zinnen..."></textarea>'
      +'<button type="button" id="scFbSubmit" class="sc-fb-submit">Verstuur</button>'
      +'<div id="scFbState" class="sc-fb-state"></div>'
      +'<div id="scFbRetryWrap" class="sc-fb-retry-wrap" hidden></div>'
      +'</div>'
      +'</div>';
    document.body.appendChild(host);
    return{
      openBtn:host.querySelector('#scFbOpenBtn'),
      hint:host.querySelector('#scFbHint'),
      hintClose:host.querySelector('.sc-fb-hint-close'),
      overlay:host.querySelector('#scFbOverlay'),
      backdrop:host.querySelector('.sc-fb-backdrop'),
      closeBtn:host.querySelector('.sc-fb-close'),
      context:host.querySelector('#scFbContext'),
      pills:host.querySelector('#scFbPills'),
      appPills:host.querySelector('#scFbAppPills'),
      text:host.querySelector('#scFbText'),
      submitBtn:host.querySelector('#scFbSubmit'),
      state:host.querySelector('#scFbState'),
      retryWrap:host.querySelector('#scFbRetryWrap')
    };
  }
  function openPanel(ui){
    ui.overlay.hidden=false;
    ui.overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('sc-fb-noscroll');
    try{ui.text.focus();}catch(_e){}
  }
  function closePanel(ui){
    ui.overlay.hidden=true;
    ui.overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('sc-fb-noscroll');
  }
  async function insertFeedbackWithTimeout(payload,timeoutMs){
    var ac=null;
    var timer=null;
    try{
      if(typeof AbortController!=='undefined'){
        ac=new AbortController();
        timer=setTimeout(function(){
          try{ac.abort();}catch(_e){}
        },Math.max(1000,timeoutMs||8000));
      }
      var q=sb.from('tester_feedback').insert(payload);
      if(ac&&typeof q.abortSignal==='function'){
        q=q.abortSignal(ac.signal);
      }
      var rs=await q;
      return rs;
    }catch(e){
      var m=String((e&&e.message)||'');
      if(m.toLowerCase().indexOf('abort')>=0){
        throw new Error('timeout');
      }
      throw e;
    }finally{
      if(timer)clearTimeout(timer);
    }
  }
  function maybeShowHint(ui){
    if(!ui.hint)return;
    if(!ui.openBtn||ui.openBtn.style.display==='none')return;
    if(ui.overlay&&!ui.overlay.hidden)return;
    ui.hint.hidden=false;
    if(!ui.hint._bound){
      ui.hint._bound=true;
      if(ui.hintClose)ui.hintClose.addEventListener('click',function(){hideHint(ui,false);});
      ui.hint.addEventListener('click',function(ev){
        if(ev.target===ui.hintClose)return;
        hideHint(ui,false);
      });
    }
  }
  function hideHint(ui){
    if(!ui.hint)return;
    ui.hint.hidden=true;
  }
  function startHintLoop(ui){
    maybeShowHint(ui);
    setInterval(function(){
      maybeShowHint(ui);
    },HINT_INTERVAL_MS);
  }
  function injectCss(){
    if(document.getElementById('scFeedbackWidgetCss'))return;
    var style=document.createElement('style');
    style.id='scFeedbackWidgetCss';
    style.textContent=''
      +'body.sc-fb-noscroll{overflow:hidden!important}'
      +'.sc-fb-open{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:240000;border:1px solid rgba(107,142,111,.42);background:linear-gradient(155deg,rgba(255,252,247,.98) 0%,var(--ivoor) 52%,rgba(200,212,181,.25) 100%);color:var(--chocolade);border-radius:999px;padding:9px 12px;display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 8px 24px rgba(61,47,31,.18)}'
      +'.sc-fb-open-dot{width:12px;height:12px;border-radius:50%;background:radial-gradient(circle,var(--sage-medium) 0 44%,var(--sage-licht) 44% 70%,var(--sage-donker) 70% 100%)}'
      +'.sc-fb-hint{position:fixed;right:16px;bottom:calc(58px + env(safe-area-inset-bottom,0px));z-index:240000;max-width:min(260px,78vw);background:var(--ivoor);color:var(--chocolade);border:1px solid rgba(107,142,111,.35);border-radius:12px;padding:10px 28px 10px 10px;font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(61,47,31,.16)}'
      +'.sc-fb-hint[hidden]{display:none!important}'
      +'.sc-fb-hint-close{position:absolute;top:6px;right:7px;border:none;background:transparent;color:var(--warm-bruin);font-size:14px;line-height:1;cursor:pointer;padding:2px 4px}'
      +'.sc-fb-overlay{position:fixed;inset:0;z-index:240100;display:flex;align-items:flex-end;justify-content:flex-end;padding:18px}'
      +'.sc-fb-overlay[hidden]{display:none!important}'
      +'.sc-fb-backdrop{position:fixed;inset:0;background:rgba(42,24,16,.32);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}'
      +'.sc-fb-dialog{position:relative;z-index:2;width:min(420px,calc(100vw - 18px));background:linear-gradient(165deg,rgba(255,252,247,.98) 0%,var(--ivoor) 55%,rgba(200,212,181,.14) 100%);border:1px solid rgba(107,142,111,.28);border-radius:18px;padding:18px 16px 14px;box-shadow:0 22px 56px rgba(61,47,31,.18);animation:scFbIn .28s ease both}'
      +'@keyframes scFbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}'
      +'.sc-fb-close{position:absolute;top:10px;right:10px;border:none;background:transparent;color:var(--warm-bruin);font-size:16px;cursor:pointer;font-family:inherit;padding:4px 6px;line-height:1}'
      +'.sc-fb-ornament{width:40px;height:40px;margin:0 auto 8px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,252,247,.95) 0 22%,rgba(200,212,181,.55) 22% 48%,rgba(107,142,111,.38) 48% 100%);box-shadow:0 6px 20px rgba(107,142,111,.22)}'
      +'.sc-fb-title{font-family:var(--font-serif);font-size:20px;font-weight:500;color:var(--chocolade);margin:0 0 8px;text-align:center}'
      +'.sc-fb-context{font-size:12px;color:var(--warm-bruin);line-height:1.45;margin:0 0 8px;text-align:center}'
      +'.sc-fb-section-title{font-size:11px;font-weight:800;letter-spacing:.03em;color:var(--warm-bruin);margin:9px 0 7px}'
      +'.sc-fb-app-pills{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px}'
      +'.sc-fb-app-pills button{border:1px solid var(--b);background:rgba(255,255,255,.92);color:var(--chocolade);border-radius:999px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s ease}'
      +'.sc-fb-app-pills button:hover{transform:translateY(-1px)}'
      +'.sc-fb-app-pills button.active{position:relative;padding-left:24px;box-shadow:0 0 0 2px rgba(255,255,255,.72) inset,0 2px 10px rgba(61,47,31,.14);transform:translateY(-1px);font-weight:800}'
      +'.sc-fb-app-pills button.active::before{content:"✓";position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:900;line-height:1}'
      +'.sc-fb-app-pills .sc-app-all{border-color:rgba(61,47,31,.25)}'
      +'.sc-fb-app-pills .sc-app-index{border-color:rgba(107,142,111,.45);color:var(--sage-donker)}'
      +'.sc-fb-app-pills .sc-app-sensecorner{border-color:rgba(107,142,111,.55);color:var(--sage-donker)}'
      +'.sc-fb-app-pills .sc-app-datesense{border-color:rgba(186,86,84,.45);color:var(--date-donker)}'
      +'.sc-fb-app-pills .sc-app-familysense{border-color:rgba(125,106,171,.45);color:var(--family-donker)}'
      +'.sc-fb-app-pills .sc-app-ownsense{border-color:rgba(107,142,111,.45);color:var(--sage-donker)}'
      +'.sc-fb-app-pills .sc-app-selfsense{border-color:rgba(74,107,80,.45);color:var(--self-donker)}'
      +'.sc-fb-app-pills .sc-app-onboarding{border-color:rgba(200,136,31,.45);color:var(--friend-donker)}'
      +'.sc-fb-app-pills .sc-app-all.active{background:rgba(61,47,31,.08)}'
      +'.sc-fb-app-pills .sc-app-index.active,.sc-fb-app-pills .sc-app-sensecorner.active,.sc-fb-app-pills .sc-app-ownsense.active{background:rgba(107,142,111,.18)}'
      +'.sc-fb-app-pills .sc-app-datesense.active{background:rgba(186,86,84,.18)}'
      +'.sc-fb-app-pills .sc-app-familysense.active{background:rgba(125,106,171,.18)}'
      +'.sc-fb-app-pills .sc-app-selfsense.active{background:rgba(74,107,80,.18)}'
      +'.sc-fb-app-pills .sc-app-onboarding.active{background:rgba(200,136,31,.2)}'
      +'.sc-fb-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}'
      +'.sc-fb-pills button{border:1px solid var(--b);background:rgba(255,255,255,.8);color:var(--chocolade);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'
      +'.sc-fb-pills button.active{background:rgba(200,212,181,.35);border-color:rgba(107,142,111,.52);color:var(--sage-donker);box-shadow:0 2px 10px rgba(61,47,31,.12)}'
      +'.sc-fb-pills.needs-choice{padding:6px;border:1px dashed rgba(159,29,29,.45);border-radius:12px;background:rgba(253,236,236,.35)}'
      +'.sc-fb-text{width:100%;min-height:104px;border:1px solid var(--b);border-radius:12px;padding:10px 11px;font:inherit;font-size:13px;line-height:1.45;background:#fff;color:var(--chocolade);resize:vertical}'
      +'.sc-fb-submit{margin-top:10px;width:100%;border:none;border-radius:12px;background:var(--chocolade);color:var(--cream);padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}'
      +'.sc-fb-submit:disabled{opacity:.55;cursor:not-allowed}'
      +'.sc-fb-submit.loading{position:relative;padding-left:34px}'
      +'.sc-fb-submit.loading::before{content:"";position:absolute;left:12px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;animation:scFbSpin .8s linear infinite}'
      +'@keyframes scFbSpin{to{transform:rotate(360deg)}}'
      +'.sc-fb-state{font-size:12px;color:var(--warm-bruin);min-height:18px;margin-top:8px;text-align:center}'
      +'.sc-fb-state.err{color:#9F1D1D}'
      +'.sc-fb-retry-wrap{display:flex;justify-content:center;margin-top:6px}'
      +'.sc-fb-retry-wrap[hidden]{display:none!important}'
      +'.sc-fb-retry-btn{border:1px solid var(--b);background:rgba(255,255,255,.92);color:var(--chocolade);border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'
      +'@media(max-width:520px){.sc-fb-open{right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))}.sc-fb-hint{right:12px;bottom:calc(56px + env(safe-area-inset-bottom,0px));max-width:84vw}.sc-fb-backdrop{backdrop-filter:none;-webkit-backdrop-filter:none}.sc-fb-overlay{padding:10px}.sc-fb-dialog{width:100%}.sc-fb-title{font-size:18px}}';
    document.head.appendChild(style);
  }
})();

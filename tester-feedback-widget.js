(function(){
  if(window.__scTesterFeedbackWidgetLoaded)return;
  window.__scTesterFeedbackWidgetLoaded=true;

  var SURL='https://ghuqjtdrkwssyqvcubcd.supabase.co';
  var SKEY='sb_publishable_ShIeY18JCYiH8fyXm_anHw_Y1jP2skq';
  var PREV_CTX_KEY='sc_feedback_prev_ctx_v1';
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
  var TYPE_LABELS={
    werkt_niet:'Werkt niet',
    mis_ik:'Mis ik',
    idee:'Idee',
    top:'Top'
  };

  var sb=null;
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
    var state={type:'',msg:'',busy:false,user:null};
    ui.openBtn.addEventListener('click',function(){openPanel(ui);refreshContextLine();});
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
        updateSubmitState();
      });
    });
    ui.submitBtn.addEventListener('click',async function(){
      if(state.busy||!state.type||!state.msg)return;
      state.busy=true;
      updateSubmitState();
      ui.state.textContent='Versturen...';
      ui.state.classList.remove('err');
      try{
        var user=state.user||await getCurrentUser();
        if(!user||!user.id)throw new Error('Niet ingelogd');
        var payload={
          user_id:user.id,
          user_email:String(user.email||'').trim(),
          user_name:String((user.user_metadata&&(
            user.user_metadata.full_name||user.user_metadata.display_name||user.user_metadata.roepnaam
          ))||'').trim(),
          app_key:app.key,
          app_label:app.label,
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
        var ins=await sb.from('tester_feedback').insert(payload);
        if(ins&&ins.error)throw new Error(ins.error.message||'Versturen mislukt');
        ui.state.textContent='Bedankt. Binnen!';
        setTimeout(function(){
          resetForm();
          closePanel(ui);
        },650);
      }catch(e){
        ui.state.textContent=(e&&e.message)||'Versturen mislukt.';
        ui.state.classList.add('err');
      }finally{
        state.busy=false;
        updateSubmitState();
      }
    });

    function refreshContextLine(){
      var now=buildCurrentContext(app);
      current=now;
      var prevLabel=(prev&&prev.context)?String(prev.context):'Geen vorige pagina gedetecteerd';
      if(window.innerWidth<560){
        now=shorten(now,46);
        prevLabel=shorten(prevLabel,46);
      }
      ui.context.textContent='Nu: '+now+' | Daarvoor: '+prevLabel;
    }
    function updateSubmitState(){
      ui.submitBtn.disabled=!!(state.busy||!state.type||!state.msg);
    }
    function resetForm(){
      state.type='';
      state.msg='';
      ui.text.value='';
      ui.state.textContent='';
      Array.prototype.slice.call(ui.pills.querySelectorAll('[data-feedback-type]')).forEach(function(b){
        b.classList.remove('active');
      });
      updateSubmitState();
    }
    refreshContextLine();
    updateSubmitState();
  }
  async function bootVisibility(ui){
    var user=await getCurrentUser();
    setVisibility(ui,!!(user&&user.id));
    if(sb&&sb.auth&&typeof sb.auth.onAuthStateChange==='function'){
      sb.auth.onAuthStateChange(async function(){
        var u=await getCurrentUser();
        setVisibility(ui,!!(u&&u.id));
      });
    }
  }
  function setVisibility(ui,show){
    ui.openBtn.style.display=show?'inline-flex':'none';
    if(!show)closePanel(ui);
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
      +'<div id="scFbOverlay" class="sc-fb-overlay" hidden aria-hidden="true">'
      +'<div class="sc-fb-backdrop"></div>'
      +'<div class="sc-fb-dialog" role="dialog" aria-modal="true" aria-label="Testfeedback">'
      +'<button type="button" class="sc-fb-close" aria-label="Sluiten">x</button>'
      +'<div class="sc-fb-ornament"></div>'
      +'<h3 class="sc-fb-title">Psst... tip voor SenseCorner?</h3>'
      +'<p id="scFbContext" class="sc-fb-context"></p>'
      +'<div id="scFbPills" class="sc-fb-pills">'
      +'<button type="button" data-feedback-type="werkt_niet">Werkt niet</button>'
      +'<button type="button" data-feedback-type="mis_ik">Mis ik</button>'
      +'<button type="button" data-feedback-type="idee">Idee</button>'
      +'<button type="button" data-feedback-type="top">Top</button>'
      +'</div>'
      +'<textarea id="scFbText" class="sc-fb-text" placeholder="In een of twee zinnen..."></textarea>'
      +'<button type="button" id="scFbSubmit" class="sc-fb-submit">Verstuur</button>'
      +'<div id="scFbState" class="sc-fb-state"></div>'
      +'</div>'
      +'</div>';
    document.body.appendChild(host);
    return{
      openBtn:host.querySelector('#scFbOpenBtn'),
      overlay:host.querySelector('#scFbOverlay'),
      backdrop:host.querySelector('.sc-fb-backdrop'),
      closeBtn:host.querySelector('.sc-fb-close'),
      context:host.querySelector('#scFbContext'),
      pills:host.querySelector('#scFbPills'),
      text:host.querySelector('#scFbText'),
      submitBtn:host.querySelector('#scFbSubmit'),
      state:host.querySelector('#scFbState')
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
  function shorten(s,max){
    var t=String(s||'').trim();
    if(t.length<=max)return t;
    return t.slice(0,Math.max(0,max-1))+'...';
  }
  function injectCss(){
    if(document.getElementById('scFeedbackWidgetCss'))return;
    var style=document.createElement('style');
    style.id='scFeedbackWidgetCss';
    style.textContent=''
      +'body.sc-fb-noscroll{overflow:hidden!important}'
      +'.sc-fb-open{position:fixed;right:16px;bottom:16px;z-index:240000;border:1px solid rgba(107,142,111,.42);background:linear-gradient(155deg,rgba(255,252,247,.98) 0%,var(--ivoor) 52%,rgba(200,212,181,.25) 100%);color:var(--chocolade);border-radius:999px;padding:9px 12px;display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 8px 24px rgba(61,47,31,.18)}'
      +'.sc-fb-open-dot{width:12px;height:12px;border-radius:50%;background:radial-gradient(circle,var(--sage-medium) 0 44%,var(--sage-licht) 44% 70%,var(--sage-donker) 70% 100%)}'
      +'.sc-fb-overlay{position:fixed;inset:0;z-index:240100;display:flex;align-items:flex-end;justify-content:flex-end;padding:18px}'
      +'.sc-fb-overlay[hidden]{display:none!important}'
      +'.sc-fb-backdrop{position:fixed;inset:0;background:rgba(42,24,16,.32);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}'
      +'.sc-fb-dialog{position:relative;z-index:2;width:min(420px,calc(100vw - 18px));background:linear-gradient(165deg,rgba(255,252,247,.98) 0%,var(--ivoor) 55%,rgba(200,212,181,.14) 100%);border:1px solid rgba(107,142,111,.28);border-radius:18px;padding:18px 16px 14px;box-shadow:0 22px 56px rgba(61,47,31,.18);animation:scFbIn .28s ease both}'
      +'@keyframes scFbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}'
      +'.sc-fb-close{position:absolute;top:10px;right:10px;border:none;background:transparent;color:var(--warm-bruin);font-size:16px;cursor:pointer;font-family:inherit;padding:4px 6px;line-height:1}'
      +'.sc-fb-ornament{width:40px;height:40px;margin:0 auto 8px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,252,247,.95) 0 22%,rgba(200,212,181,.55) 22% 48%,rgba(107,142,111,.38) 48% 100%);box-shadow:0 6px 20px rgba(107,142,111,.22)}'
      +'.sc-fb-title{font-family:var(--font-serif);font-size:20px;font-weight:500;color:var(--chocolade);margin:0 0 8px;text-align:center}'
      +'.sc-fb-context{font-size:12px;color:var(--warm-bruin);line-height:1.45;margin:0 0 10px;text-align:center}'
      +'.sc-fb-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}'
      +'.sc-fb-pills button{border:1px solid var(--b);background:rgba(255,255,255,.8);color:var(--chocolade);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'
      +'.sc-fb-pills button.active{background:rgba(200,212,181,.35);border-color:rgba(107,142,111,.52);color:var(--sage-donker)}'
      +'.sc-fb-text{width:100%;min-height:104px;border:1px solid var(--b);border-radius:12px;padding:10px 11px;font:inherit;font-size:13px;line-height:1.45;background:#fff;color:var(--chocolade);resize:vertical}'
      +'.sc-fb-submit{margin-top:10px;width:100%;border:none;border-radius:12px;background:var(--chocolade);color:var(--cream);padding:10px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}'
      +'.sc-fb-submit:disabled{opacity:.55;cursor:not-allowed}'
      +'.sc-fb-state{font-size:12px;color:var(--warm-bruin);min-height:18px;margin-top:8px;text-align:center}'
      +'.sc-fb-state.err{color:#9F1D1D}'
      +'@media(max-width:520px){.sc-fb-backdrop{backdrop-filter:none;-webkit-backdrop-filter:none}.sc-fb-overlay{padding:10px}.sc-fb-dialog{width:100%}.sc-fb-title{font-size:18px}}';
    document.head.appendChild(style);
  }
})();

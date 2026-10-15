(function(global){
  var SURL='https://ghuqjtdrkwssyqvcubcd.supabase.co';
  var SKEY='sb_publishable_ShIeY18JCYiH8fyXm_anHw_Y1jP2skq';
  var STORAGE_KEY='sensecorner-auth-v1';
  var LOGIN_BOUNCE_KEY='sc_login_bounce';
  /**
   * Minimale lengte voor NIEUWE wachtwoorden (registratie / onboarding / reset / updateUser).
   * NOOIT afdwingen op loginformulieren: bestaande users met kortere wachtwoorden moeten kunnen inloggen.
   */
  var SENSE_MIN_PASSWORD_LENGTH=8;

  function sensePasswordMeetsPolicy(pw){
    return String(pw||'').length>=SENSE_MIN_PASSWORD_LENGTH;
  }

  function sensePasswordTooShortMessage(){
    return 'Wachtwoord moet minstens '+SENSE_MIN_PASSWORD_LENGTH+' tekens hebben.';
  }

  /** Soft warning na geslaagde login als Auth weakPassword meestuurt (sessie blijft geldig). */
  function senseWeakPasswordLoginNudge(){
    return 'Je bent ingelogd. Tip: kies via «Wachtwoord vergeten?» een sterker wachtwoord (min. '+SENSE_MIN_PASSWORD_LENGTH+' tekens).';
  }

  /**
   * GoTrue password-grant: bij geldig maar te zwak wachtwoord → HTTP 200 + session + weak_password.
   * Hard AuthWeakPasswordError hoort bij signup/updateUser, niet bij geslaagde login.
   * @returns {null|{reasons:string[],message?:string}}
   */
  function senseSignInWeakPassword(signRes){
    if(!signRes)return null;
    var data=signRes.data||signRes;
    var wp=data&&(data.weakPassword||data.weak_password);
    if(!wp)return null;
    var reasons=Array.isArray(wp.reasons)?wp.reasons:[];
    if(!reasons.length&&!wp.message)return null;
    return {reasons:reasons,message:wp.message||''};
  }

  function senseReadPersistedSession(){
    try{
      var raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return null;
      var blob=JSON.parse(raw);
      var sess=null;
      if(blob&&blob.user&&blob.access_token)sess=blob;
      else if(blob&&blob.currentSession)sess=blob.currentSession;
      else if(blob&&blob.session)sess=blob.session;
      if(!sess||!sess.user)return null;
      var rt=String(sess.refresh_token||'').trim();
      var exp=(sess.expires_at?sess.expires_at*1000:0)||0;
      var now=Date.now();
      if(rt)return sess;
      if(exp&&exp>now-30000)return sess;
      if(String(sess.access_token||'').trim()&&!exp)return sess;
      if(!rt&&exp&&exp<now-120000)return null;
      return sess;
    }catch(_e){
      return null;
    }
  }

  function senseIsWeakPasswordError(err){
    var msg=String((err&&err.message)||err||'').trim();
    var code=String((err&&err.code)||(err&&err.error_code)||'').trim().toLowerCase();
    var name=String((err&&err.name)||'').trim().toLowerCase();
    var low=msg.toLowerCase();
    var reasons=err&&err.reasons;
    var reasonStr=Array.isArray(reasons)?reasons.join(' ').toLowerCase():'';
    return (
      code==='weak_password'||
      name.indexOf('weakpassword')>=0||
      low.indexOf('weak password')>=0||
      low.indexOf('password is known')>=0||
      low.indexOf('pwned')>=0||
      low.indexOf('leaked')>=0||
      reasonStr.indexOf('pwned')>=0||
      reasonStr.indexOf('length')>=0||
      reasonStr.indexOf('characters')>=0
    );
  }

  /**
   * @param {*} err
   * @param {{context?: string}=} opts context: 'login' | 'register' | 'update' (default register/update tone)
   */
  function senseMapAuthError(err,opts){
    opts=opts||{};
    var ctx=String(opts.context||'').toLowerCase();
    var msg=String((err&&err.message)||err||'').trim();
    var code=String((err&&err.code)||(err&&err.error_code)||'').trim().toLowerCase();
    var low=msg.toLowerCase();
    var reasons=err&&err.reasons;
    var reasonStr=Array.isArray(reasons)?reasons.join(' ').toLowerCase():'';
    if(code==='invalid_credentials'||low.indexOf('invalid login credentials')>=0){
      return 'E-mail of wachtwoord klopt niet. Controleer je gegevens of gebruik «Wachtwoord vergeten?».';
    }
    if(senseIsWeakPasswordError(err)){
      /* Login: nooit doen alsof het typed wachtwoord "te kort is om in te loggen" via clientregel.
         Als Auth login hard weigert (zeldzaam), stuur naar reset. */
      if(ctx==='login'){
        return 'Je huidige wachtwoord voldoet niet meer aan de beveiligingseisen. Gebruik «Wachtwoord vergeten?» om een nieuw wachtwoord van minstens '+SENSE_MIN_PASSWORD_LENGTH+' tekens in te stellen. Je gegevens blijven bewaard.';
      }
      if(reasonStr.indexOf('pwned')>=0||low.indexOf('pwned')>=0||low.indexOf('leaked')>=0||low.indexOf('known to be weak')>=0){
        return 'Dit wachtwoord is te zwak of bekend uit datalekken. Kies een langer, uniek wachtwoord.';
      }
      if(reasonStr.indexOf('length')>=0||low.indexOf('at least')>=0){
        return sensePasswordTooShortMessage();
      }
      return 'Dit wachtwoord voldoet niet aan de eisen. Kies een sterker wachtwoord (min. '+SENSE_MIN_PASSWORD_LENGTH+' tekens).';
    }
    if(code==='email_not_confirmed'||low.indexOf('email not confirmed')>=0){
      return 'Bevestig eerst je e-mail via de link in je mailbox, en log daarna opnieuw in.';
    }
    if(code==='user_banned'||low.indexOf('banned')>=0){
      return 'Dit account is geblokkeerd. Neem contact op met support.';
    }
    if(code==='validation_failed'||low.indexOf('missing email')>=0){
      return 'Vul een geldig e-mailadres en wachtwoord in.';
    }
    if(low.indexOf('invalid api key')>=0||low.indexOf('no api key')>=0){
      return 'Technische fout (API-sleutel). Vernieuw de pagina. Blijft het mis? Meld dit even.';
    }
    if(low.indexOf('signup')>=0&&low.indexOf('disabled')>=0){
      return 'Registratie staat uit. Bestaande accounts kunnen wel inloggen als e-mail en wachtwoord kloppen.';
    }
    if(low.indexOf('rate limit')>=0||low.indexOf('too many')>=0){
      return 'Te veel pogingen. Wacht even en probeer opnieuw.';
    }
    if(low.indexOf('network')>=0||low.indexOf('fetch')>=0||low.indexOf('failed to fetch')>=0){
      return 'Netwerkfout. Controleer je verbinding en probeer opnieuw.';
    }
    return msg||'Inloggen mislukt. Probeer opnieuw.';
  }

  function senseCreateAuthClient(){
    try{
      if(global.__senseLpSupabase)return global.__senseLpSupabase;
      if(!global.supabase||typeof global.supabase.createClient!=='function')return null;
      global.__senseLpSupabase=global.supabase.createClient(SURL,SKEY,{
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:true,
          flowType:'pkce',
          storageKey:STORAGE_KEY
        }
      });
      return global.__senseLpSupabase;
    }catch(_e){
      return null;
    }
  }

  /** Alleen auth-tokens; OwnSense hub/profile-cache (ownsense_hub_profile_v2::uid) blijft staan. Serverdata in sense_profiles wordt niet gewist. */
  function senseClearAuthStorage(){
    try{localStorage.removeItem(STORAGE_KEY);}catch(_e){}
    try{sessionStorage.removeItem(LOGIN_BOUNCE_KEY);}catch(_e2){}
  }

  function senseMarkLoginBounce(){
    try{sessionStorage.setItem(LOGIN_BOUNCE_KEY,'1');}catch(_e){}
  }

  function senseFinishLoginNavigate(defaultPath){
    var norm=global.senseNormalizeReturnTo;
    var path=norm?norm(defaultPath,'sensecorner.html'):'sensecorner.html';
    window.location.replace(path);
  }

  function sensePromiseTimeout(promise,ms,fallback){
    return Promise.race([
      Promise.resolve(promise),
      new Promise(function(resolve){
        setTimeout(function(){resolve(fallback);},Math.max(500,ms||5000));
      })
    ]);
  }

  async function senseResolveSession(sb,opts){
    opts=opts||{};
    if(!sb||!sb.auth)return null;
    var attempts=opts.attempts!=null?opts.attempts:2;
    var delayMs=opts.delayMs!=null?opts.delayMs:450;
    var getTimeout=opts.getTimeout!=null?opts.getTimeout:8000;
    var maxMs=opts.maxMs!=null?opts.maxMs:12000;
    var deadline=Date.now()+maxMs;
    for(var i=0;i<attempts;i++){
      if(Date.now()>=deadline)break;
      try{
        var waitMs=Math.min(getTimeout,Math.max(500,deadline-Date.now()));
        var res=await sensePromiseTimeout(sb.auth.getSession(),waitMs,null);
        var session=res&&res.data&&res.data.session;
        if(session&&session.user&&String(session.access_token||'').trim())return session;
      }catch(_e){}
      if(i<attempts-1&&Date.now()<deadline){
        await new Promise(function(r){setTimeout(r,Math.min(delayMs,deadline-Date.now()));});
      }
    }
    var persisted=senseReadPersistedSession();
    if(persisted&&persisted.user&&String(persisted.access_token||'').trim())return persisted;
    return null;
  }

  async function senseConfirmSessionAfterSignIn(sb,signRes,opts){
    opts=opts||{};
    var data=signRes&&signRes.data;
    var session=data&&data.session;
    if(session&&session.user&&String(session.access_token||'').trim()){
      return session;
    }
    return senseResolveSession(sb,{
      attempts:Math.min(opts.attempts||5,6),
      delayMs:opts.delayMs||350,
      getTimeout:opts.getTimeout||2500,
      maxMs:opts.maxMs||10000
    });
  }

  async function sensePersistSignInResult(sb,res){
    if(!sb||!res||!res.data)return false;
    var session=res.data.session||null;
    if(session&&sb.auth&&typeof sb.auth.setSession==='function'){
      try{
        var setRes=await sensePromiseTimeout(
          sb.auth.setSession({
            access_token:session.access_token,
            refresh_token:session.refresh_token
          }),
          6000,
          null
        );
        if(setRes===null)return false;
        if(setRes&&setRes.error)return false;
        return true;
      }catch(_e){
        return false;
      }
    }
    return !!(res.data.user);
  }

  global.SENSE_AUTH_URL=SURL;
  global.SENSE_AUTH_KEY=SKEY;
  global.SENSE_AUTH_STORAGE_KEY=STORAGE_KEY;
  global.SENSE_MIN_PASSWORD_LENGTH=SENSE_MIN_PASSWORD_LENGTH;
  global.sensePasswordMeetsPolicy=sensePasswordMeetsPolicy;
  global.sensePasswordTooShortMessage=sensePasswordTooShortMessage;
  global.senseWeakPasswordLoginNudge=senseWeakPasswordLoginNudge;
  global.senseSignInWeakPassword=senseSignInWeakPassword;
  global.senseIsWeakPasswordError=senseIsWeakPasswordError;
  global.senseReadPersistedSession=senseReadPersistedSession;
  global.senseMapAuthError=senseMapAuthError;
  global.senseCreateAuthClient=senseCreateAuthClient;
  global.senseClearAuthStorage=senseClearAuthStorage;
  global.senseMarkLoginBounce=senseMarkLoginBounce;
  global.sensePersistSignInResult=sensePersistSignInResult;
  global.senseResolveSession=senseResolveSession;
  global.senseConfirmSessionAfterSignIn=senseConfirmSessionAfterSignIn;
  global.senseFinishLoginNavigate=senseFinishLoginNavigate;
  global.getSenseLpSupabase=function(){
    return senseCreateAuthClient();
  };
})(typeof window!=='undefined'?window:this);

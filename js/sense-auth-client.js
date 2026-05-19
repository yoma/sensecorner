(function(global){
  var SURL='https://ghuqjtdrkwssyqvcubcd.supabase.co';
  var SKEY='sb_publishable_ShIeY18JCYiH8fyXm_anHw_Y1jP2skq';
  var STORAGE_KEY='sensecorner-auth-v1';
  var LOGIN_BOUNCE_KEY='sc_login_bounce';

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

  function senseMapAuthError(err){
    var msg=String((err&&err.message)||err||'').trim();
    var code=String((err&&err.code)||(err&&err.error_code)||'').trim().toLowerCase();
    var low=msg.toLowerCase();
    if(code==='invalid_credentials'||low.indexOf('invalid login credentials')>=0){
      return 'E-mail of wachtwoord klopt niet. Controleer je gegevens of gebruik «Wachtwoord vergeten?».';
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

  function senseClearAuthStorage(){
    try{localStorage.removeItem(STORAGE_KEY);}catch(_e){}
    try{sessionStorage.removeItem(LOGIN_BOUNCE_KEY);}catch(_e2){}
  }

  function senseMarkLoginBounce(){
    try{sessionStorage.setItem(LOGIN_BOUNCE_KEY,'1');}catch(_e){}
  }

  async function sensePersistSignInResult(sb,res){
    if(!sb||!res||!res.data)return false;
    var session=res.data.session||null;
    if(session&&sb.auth&&typeof sb.auth.setSession==='function'){
      try{
        var setRes=await sb.auth.setSession({
          access_token:session.access_token,
          refresh_token:session.refresh_token
        });
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
  global.senseReadPersistedSession=senseReadPersistedSession;
  global.senseMapAuthError=senseMapAuthError;
  global.senseCreateAuthClient=senseCreateAuthClient;
  global.senseClearAuthStorage=senseClearAuthStorage;
  global.senseMarkLoginBounce=senseMarkLoginBounce;
  global.sensePersistSignInResult=sensePersistSignInResult;
  global.getSenseLpSupabase=function(){
    return senseCreateAuthClient();
  };
})(typeof window!=='undefined'?window:this);

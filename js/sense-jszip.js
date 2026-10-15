/**
 * Lazy-load JSZip only when import/export needs it (~28KB gzip saved on cold open).
 */
(function(global){
  var SRC='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  var inflight=null;

  function senseEnsureJSZip(){
    if(typeof global.JSZip!=='undefined'){
      return Promise.resolve(global.JSZip);
    }
    if(inflight)return inflight;
    inflight=new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src=SRC;
      s.async=true;
      s.onload=function(){
        if(typeof global.JSZip!=='undefined')resolve(global.JSZip);
        else reject(new Error('JSZip geladen maar niet beschikbaar.'));
      };
      s.onerror=function(){
        inflight=null;
        reject(new Error('JSZip kon niet worden geladen. Controleer je netwerk en probeer opnieuw.'));
      };
      (document.head||document.documentElement).appendChild(s);
    });
    return inflight;
  }

  global.senseEnsureJSZip=senseEnsureJSZip;
})(typeof window!=='undefined'?window:this);

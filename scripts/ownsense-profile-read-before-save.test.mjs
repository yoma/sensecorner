/**
 * OWN Sense mag sense_profiles niet upserten voordat de select klaar is.
 * Een timeout of fout levert geen rij op; de hub heeft dan lege categorieën en foto's.
 * Run: node scripts/ownsense-profile-read-before-save.test.mjs
 */
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=fs.readFileSync(path.join(root,'ownsense.html'),'utf8');

function assert(cond,msg){
  if(!cond){
    console.error('FAIL:',msg);
    process.exit(1);
  }
}

function extractFunction(name){
  const needle='function '+name+'(';
  const start=src.indexOf(needle);
  assert(start>=0,'missing '+name);
  const open=src.indexOf('{',start);
  assert(open>=0,'missing body '+name);
  let depth=0;
  for(let i=open;i<src.length;i++){
    const ch=src[i];
    if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0)return src.slice(start,i+1);
    }
  }
  throw new Error('unclosed '+name);
}

const ownProfileReadAllowsRemoteSave=new Function(
  extractFunction('ownProfileReadAllowsRemoteSave')+'\nreturn ownProfileReadAllowsRemoteSave;'
)();

assert(ownProfileReadAllowsRemoteSave(null)===false,'timeout null must not allow save');
assert(ownProfileReadAllowsRemoteSave(undefined)===false,'missing result must not allow save');
assert(ownProfileReadAllowsRemoteSave({data:null,error:{message:'timeout'}})===false,'select error must not allow save');
assert(ownProfileReadAllowsRemoteSave({data:null,error:null})===true,'confirmed absent row may create');
assert(ownProfileReadAllowsRemoteSave({data:{name:'OWN Sense'}})===true,'loaded row may save');

const core=extractFunction('saveOwnToSupabaseCore');
const guardAt=core.indexOf("reason:'profile_not_loaded'");
const upsertAt=core.indexOf(".upsert(");
assert(guardAt>=0,'saveOwnToSupabaseCore must refuse when the profile read is not ready');
assert(upsertAt>guardAt,'the not-loaded return must happen before upsert');

const load=extractFunction('loadOwnFromSupabase');
const selectAt=load.indexOf(".eq('name','OWN Sense').maybeSingle()");
const readyAt=load.indexOf('__ownProfileRemoteReady=ownProfileReadAllowsRemoteSave(res)');
const hydrateAt=load.indexOf('hydrateSelfsenseSpiegelFromMirrorSessions(client,user)');
const migAt=load.indexOf('applyOwnHubAppDepthV2Migration()');
assert(selectAt>=0&&readyAt>selectAt,'ready flag is set from the profile select result');
assert(hydrateAt>readyAt&&migAt>readyAt,'spiegel hydrate and depth migration run only after the ready flag');

const mig=extractFunction('applyOwnHubAppDepthV2Migration');
const migGuard=mig.indexOf('if(!__ownProfileRemoteReady)return;');
const migSave=mig.indexOf('saveOwnToSupabase()');
assert(migGuard>=0&&migSave>migGuard,'depth migration must not upsert before the profile read is ready');

console.log('ok ownsense-profile-read-before-save');

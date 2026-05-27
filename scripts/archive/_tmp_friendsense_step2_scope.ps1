$path = Join-Path $PSScriptRoot 'friendsense.html'
$enc = New-Object System.Text.UTF8Encoding $false
$c = [IO.File]::ReadAllText($path, $enc)

$ids = @(
  'FamilySensei','FriendSensei'
  'FamilySense','FriendSense'
  'FAMILYSENSE','FRIENDSENSE'
  'familysense','friendsense'
  'family-sense','friend-sense'
  'family_sense','friend_sense'
  'seedFamilySenseTestDossiers','seedFriendSenseTestDossiers'
  'getFamilySenseContactNames','getFriendSenseContactNames'
  'isFamilySenseVisibleContact','isFriendSenseVisibleContact'
  'normalizeLegacyFamilyScopes','normalizeLegacyFriendScopes'
  '[FamilySense]','[FriendSense]'
)
for ($i = 0; $i -lt $ids.Length; $i += 2) { $c = $c.Replace($ids[$i], $ids[$i+1]) }

$c = $c.Replace('/* FamilySense accent', '/* FriendSense accent')
$c = $c.Replace('var(--family-donker)', 'var(--friend-donker)')
$c = $c.Replace('var(--family-medium)', 'var(--friend-medium)')
$c = $c.Replace('var(--family-licht)', 'var(--friend-licht)')
$c = $c.Replace('rgba(208,199,223', 'rgba(235,207,155')
$c = $c.Replace('rgba(208, 199, 223', 'rgba(235, 207, 155')
$c = $c.Replace('125,106,171', '200,136,31')
$c = $c.Replace('125, 106, 171', '200, 136, 31')
$c = $c.Replace('74,61,102', '61,47,31')
$c = $c.Replace('74, 61, 102', '61, 47, 31')
foreach ($pair in @(
  @('#7D6AAB','#C8881F'),@('#7d6aab','#c8881f'),
  @('#AEA0C9','#DDB062'),@('#aea0c9','#ddb062'),
  @('#D0C7DF','#EBCF9B'),@('#d0c7df','#ebcf9b'),
  @('#5B4A84','#A67A18'),@('#5b4a84','#a67a18'),
  @('#4A3D66','#8A6015'),@('#4a3d66','#8a6015'),
  @('#F4EEFF','#FBF3E3'),@('#f4eeff','#fbf3e3'),
  @('#F5F3FA','#FAF6EE'),@('#f5f3fa','#faf6ee'),
  @('245,243,250','250,246,238')
)) { $c = $c.Replace($pair[0], $pair[1]) }

$oldScope = @'
function isFamilyTaggedMeta(meta){
  var m=meta||{};
  if(String(m.familie_rol||'').trim())return true;
  if(String(m.familie_relatie||'').trim())return true;
  var scopes=normalizeAppScopeList(m);
  return scopes.indexOf('fs')>=0;
}
function isFriendSenseVisibleContact(name){
  if(!name||name==='OWN Sense')return false;
  var m=((S.pdata&&S.pdata[name])||{}).meta||{};
  return isFamilyTaggedMeta(m);
}
'@
$newScope = @'
/** FriendSense-dossier: app_scope `fr` (niet `fs` - dat is FamilySense). */
function isFriendSenseTaggedMeta(meta){
  var scopes=normalizeAppScopeList(meta||{});
  return scopes.indexOf('fr')>=0;
}
/** Vóór fr-scope: per ongeluk met alleen `fs` en zonder gezins-velden aangemaakt in FriendSense. */
function shouldMigrateFsOnlyToFriendScope(meta){
  var m=meta||{};
  if(String(m.familie_rol||'').trim())return false;
  if(String(m.familie_relatie||'').trim())return false;
  var scopes=normalizeAppScopeList(m);
  if(scopes.indexOf('fr')>=0)return false;
  return scopes.indexOf('fs')>=0;
}
function isFriendSenseVisibleContact(name){
  if(!name||name==='OWN Sense')return false;
  var m=((S.pdata&&S.pdata[name])||{}).meta||{};
  return isFriendSenseTaggedMeta(m)||shouldMigrateFsOnlyToFriendScope(m);
}
'@
if ($c.Contains('function isFamilyTaggedMeta')) { $c = $c.Replace($oldScope, $newScope) }

$oldNorm = @'
/** Herstelt oude gemixte scope-data voor family-dossiers (fs verplicht, ds eruit). */
async function normalizeLegacyFriendScopes(){
  if(!S.user||!Array.isArray(S.profiles)||!S.profiles.length)return;
  var changed=0;
  for(var i=0;i<S.profiles.length;i++){
    var name=S.profiles[i];
    if(!name||name==='OWN Sense')continue;
    var d=S.pdata[name];
    if(!d)continue;
    var meta=Object.assign({},d.meta||{});
    if(!isFamilyTaggedMeta(meta))continue;
    var scopes=normalizeAppScopeList(meta);
    var next=scopes.filter(function(s){return s!=='ds';});
    if(next.indexOf('fs')<0)next.push('fs');
    var same=next.length===scopes.length&&next.every(function(v,idx){return v===scopes[idx];});
    if(same)continue;
    meta.app_scope=next;
    d.meta=meta;
    S.pdata[name]=d;
    await saveP(name,d.props,d.count,d.categories,d.summary,d.meta);
    changed++;
  }
  if(changed>0)console.log('[FriendSense] scope cleanup aangepast:',changed);
}
'@
$newNorm = @'
/** Herstelt gemixte scope-data voor friend-dossiers (fr verplicht; fs/ds eruit). */
async function normalizeLegacyFriendScopes(){
  if(!S.user||!Array.isArray(S.profiles)||!S.profiles.length)return;
  var changed=0;
  for(var i=0;i<S.profiles.length;i++){
    var name=S.profiles[i];
    if(!name||name==='OWN Sense')continue;
    var d=S.pdata[name];
    if(!d)continue;
    var meta=Object.assign({},d.meta||{});
    if(!isFriendSenseTaggedMeta(meta)&&!shouldMigrateFsOnlyToFriendScope(meta))continue;
    var scopes=normalizeAppScopeList(meta);
    var next=scopes.filter(function(s){return s!=='ds'&&s!=='fs';});
    if(next.indexOf('fr')<0)next.push('fr');
    var same=next.length===scopes.length&&next.every(function(v,idx){return v===scopes[idx];});
    if(same)continue;
    meta.app_scope=next;
    d.meta=meta;
    S.pdata[name]=d;
    await saveP(name,d.props,d.count,d.categories,d.summary,d.meta);
    changed++;
  }
  if(changed>0)console.log('[FriendSense] scope cleanup aangepast:',changed);
}
'@
if ($c.Contains("if(!isFamilyTaggedMeta(meta))")) { $c = $c.Replace($oldNorm, $newNorm) }

$c = $c.Replace(@"
      var exScopes=normalizeAppScopeList(existing.meta);
      if(exScopes.indexOf('fs')<0){
        exScopes.push('fs');
        existing.meta.app_scope=exScopes;
        S.pdata[name]=existing;
        await saveP(name,existing.props||{...DP},existing.count||0,existing.categories||{},existing.summary,existing.meta);
      }
"@, @"
      var exScopes=normalizeAppScopeList(existing.meta);
      var nextScopes=exScopes.filter(function(s){return s!=='fs'&&s!=='ds';});
      if(nextScopes.indexOf('fr')<0)nextScopes.push('fr');
      var scopeSame=nextScopes.length===exScopes.length&&nextScopes.every(function(v,i){return v===exScopes[i];});
      if(!scopeSame){
        existing.meta.app_scope=nextScopes;
        S.pdata[name]=existing;
        await saveP(name,existing.props||{...DP},existing.count||0,existing.categories||{},existing.summary,existing.meta);
      }
"@)

$c = $c.Replace("if(name!=='OWN Sense')seedProps.meta={app_scope:['fs']};", "if(name!=='OWN Sense')seedProps.meta={app_scope:['fr']};")
$c = $c.Replace("var seedMeta=(name!=='OWN Sense')?{app_scope:['fs']}:{};", "var seedMeta=(name!=='OWN Sense')?{app_scope:['fr']}:{};")

$c = $c.Replace(@"
    var scopeList=Array.isArray(safeMeta.app_scope)?safeMeta.app_scope.slice():[];
    if(scopeList.map(function(v){return String(v||'').toLowerCase();}).indexOf('fs')<0)scopeList.push('fs');
    safeMeta.app_scope=scopeList;
"@, @"
    var scopeList=Array.isArray(safeMeta.app_scope)?safeMeta.app_scope.slice():[];
    scopeList=scopeList.map(function(v){return String(v||'').toLowerCase();}).filter(function(s){return s!=='fs'&&s!=='ds';});
    if(scopeList.indexOf('fr')<0)scopeList.push('fr');
    safeMeta.app_scope=scopeList;
"@)

$ts = Get-Date -Format 'dd-MM-yyyy HH:mm'
$c = [regex]::Replace($c, '<meta name="fs-build" content="[^"]*">', "<meta name=`"fs-build`" content=`"$ts`">")
[IO.File]::WriteAllText($path, $c, $enc)
Write-Host "step2+scope OK fs-build=$ts"

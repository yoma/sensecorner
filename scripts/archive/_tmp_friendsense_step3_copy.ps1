$path = Join-Path $PSScriptRoot 'friendsense.html'
$enc = New-Object System.Text.UTF8Encoding $false
$c = [IO.File]::ReadAllText($path, $enc)
$pairs = @(
  'Dichterbij, elke dag.','Samen, op jouw tempo.'
  'jouw persoonlijke gezinscoach','jouw persoonlijke vriendschapscoach'
  'gezinscoach','vriendschapscoach'
  'gezinsadvies','vriendschapsadvies'
  'gezinsdynamiek','vriendschapsdynamiek'
  'gezinscontext','vriendschapscontext'
  'familiedossiers','vriendschapsdossiers'
  'familiedossier','vriendschapsdossier'
  'Familieleden','Vrienden'
  'familielid','vriend(in)'
  'Nog geen familieleden','Nog geen vrienden'
  'Gezins-focus','Vriendschapsfocus'
  'gezins-focus','vriendschapsfocus'
  'Gezins-modus','Vriendschapsmodus'
  'gezins-modus','vriendschapsmodus'
  'gezinsrelatie','vriendschapsrelatie'
  'Gezinsdossier','Vriendschapsdossier'
  'gezinsdossier','vriendschapsdossier'
  'gezins- en familiecontext','vriendschapscontext'
  'gezins- of naastendossier','vriendschapsdossier'
  'GEZINS- EN NAASTENDOSSIER','VRIENDSCHAPS- EN NAASTENDOSSIER'
  'rollen in het gezin','rollen in jullie vriendschap'
  'familiedynamiek','vriendschapsdynamiek'
  'gezin, grenzen en verbinding','vriendschap, grenzen en verbinding'
  'gezin, communicatie thuis, grenzen en verbinding','vriendschap, open communicatie, grenzen en verbinding'
  'gezin en thuisdynamiek','vriendschap en sociale dynamiek'
  'de druk thuis soms zwaar voelt','vriendschap soms zwaar voelt'
  'verbinding thuis soms spanning oproept','verbinding met vrienden soms spanning oproept'
  'geen dating-intentie meer als gezinsrol','geen dating-intentie; alleen vriendschapsrollen'
  'essentie van FriendSense: gezin','essentie van FriendSense: vriendschap'
  'familierelatie of vriendschap','vriendschap'
  'Respecteer de familierelatie.','Respecteer de vriendschap.'
  'gezins- of communicatiestappen','vriendschaps- of communicatiestappen'
  'Bij meer gezinscontext','Bij meer vriendschapscontext'
  'echte gezinscontext','echte vriendschapscontext'
  'Maak je eerste familiedossier aan','Maak je eerste vriendschapsdossier aan'
  'familiedossiers en context','vriendschapsdossiers en context'
  'voor dit familielid','voor deze vriend(in)'
  'Naam van het familielid','Naam van je vriend(in)'
  'Kies een familiedossier','Kies een vriendschapsdossier'
  'kind, ouder, nonkel','hechte vriend, jeugdvriend, collega-vriend'
  'de persoonlijke gezinscoach','de persoonlijke vriendschapscoach'
  'empathische AI gezinscoach','empathische AI vriendschapscoach'
  'gezinsdynamiek met de gebruiker','vriendschapsdynamiek met de gebruiker'
  'THEMA familie/gezin','THEMA vriendschap'
  'gezins- of naastenboodschap','vriendschapsboodschap'
)
for ($i = 0; $i -lt $pairs.Length; $i += 2) { $c = $c.Replace($pairs[$i], $pairs[$i+1]) }
$c = $c.Replace(
  "var OWN_APP_DEPTH_FACT_SUB_MAP={family_meaning:0,family_friction:1};",
  "var OWN_APP_DEPTH_FACT_SUB_MAP={friend_values:0,friend_conflict:1,family_meaning:0,family_friction:1};"
)
$oldStubs = @'
    var stubs=[
      {name:'EmmaSense',display_name:'Emma',familie_rol:'dochter',familie_relatie:'',birthdate:'2015-04-12',city:'Leuven',country:'België'},
      {name:'LucasSense',display_name:'Lucas',familie_rol:'zoon',familie_relatie:'',birthdate:'2018-09-22',city:'Leuven',country:'België'},
      {name:'MamaSense',display_name:'Mama',familie_rol:'moeder',familie_relatie:'',birthdate:'1986-03-14',city:'Leuven',country:'België'},
      {name:'PapaSense',display_name:'Papa',familie_rol:'vader',familie_relatie:'',birthdate:'1984-11-02',city:'Leuven',country:'België'},
      {name:'NonkelFransSense',display_name:'Nonkel Frans',familie_rol:'anders',familie_relatie:'Nonkel',birthdate:'1980-07-08',city:'Gent',country:'België'},
      {name:'TanteLiesSense',display_name:'Tante Lies',familie_rol:'anders',familie_relatie:'Tante',birthdate:'1988-01-30',city:'Antwerpen',country:'België'},
      {name:'OmaRitaSense',display_name:'Oma Rita',familie_rol:'grootouder',familie_relatie:'Grootmoeder',birthdate:'1955-12-05',city:'Brugge',country:'België'}
    ];
'@
$newStubs = @'
    var stubs=[
      {name:'EmmaSense',display_name:'Emma',friend_rol:'goede_vriend',friend_relatie:'',birthdate:'1994-04-12',city:'Leuven',country:'België'},
      {name:'LucasSense',display_name:'Lucas',friend_rol:'vriendenkring',friend_relatie:'',birthdate:'1991-09-22',city:'Leuven',country:'België'},
      {name:'SaraSense',display_name:'Sara',friend_rol:'hechte_vriend',friend_relatie:'',birthdate:'1989-03-14',city:'Leuven',country:'België'},
      {name:'TomSense',display_name:'Tom',friend_rol:'jeugdvriend',friend_relatie:'',birthdate:'1988-11-02',city:'Leuven',country:'België'},
      {name:'NoorSense',display_name:'Noor',friend_rol:'collega_vriend',friend_relatie:'',birthdate:'1990-07-08',city:'Gent',country:'België'},
      {name:'LiesSense',display_name:'Lies',friend_rol:'anders',friend_relatie:'Vriendin uit de kring',birthdate:'1992-01-30',city:'Antwerpen',country:'België'},
      {name:'RitaSense',display_name:'Rita',friend_rol:'hechte_vriend',friend_relatie:'',birthdate:'1985-12-05',city:'Brugge',country:'België'}
    ];
'@
if ($c.Contains("familie_rol:'dochter'")) { $c = $c.Replace($oldStubs, $newStubs) }
$c = $c.Replace('        familie_rol:st.familie_rol,', '        friend_rol:st.friend_rol,')
$c = $c.Replace('        familie_relatie:st.familie_relatie,', '        friend_relatie:st.friend_relatie,')
$ts = Get-Date -Format 'dd-MM-yyyy HH:mm'
$c = [regex]::Replace($c, '<meta name="fs-build" content="[^"]*">', "<meta name=`"fs-build`" content=`"$ts`">")
[IO.File]::WriteAllText($path, $c, $enc)
if ($c -notmatch '<!DOCTYPE html>') { Write-Error 'FILE CORRUPT'; exit 1 }
Write-Host "copy OK fs-build=$ts"

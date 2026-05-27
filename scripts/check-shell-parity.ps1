param(
  [string]$Template = (Join-Path $PSScriptRoot "..\templates\ui-shell-template.html"),
  [string[]]$Targets = @("selfsense.html","datesense.html","familysense.html")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not [System.IO.Path]::IsPathRooted($Template)) {
  $Template = Join-Path $ProjectRoot $Template
}

function Normalize-Text {
  param([string]$Text)
  if ($null -eq $Text) { return "" }
  $n = ($Text -replace "\s+"," ").Trim()
  # Color/theme variables differ per app; normalize to shell-generic vars.
  $n = $n -replace "--date-","--app-"
  $n = $n -replace "--family-","--app-"
  $n = $n -replace "--self-","--app-"
  return $n
}

function Get-StyleBlock {
  param(
    [string]$Html,
    [string]$Selector
  )
  $pattern = "(?ms)\." + [regex]::Escape($Selector) + "\s*\{(.*?)\}"
  $m = [regex]::Match($Html, $pattern)
  if (-not $m.Success) { return $null }
  return Normalize-Text $m.Groups[1].Value
}

function Has-Marker {
  param(
    [string]$Html,
    [string]$Marker
  )
  return ($Html -like "*$Marker*")
}

function Assert-RegexList {
  param(
    [string]$Html,
    [string]$Target,
    [hashtable[]]$Rules,
    [ref]$TargetFailed
  )
  foreach($rule in $Rules){
    $pattern = [string]$rule.pattern
    $label = [string]$rule.label
    if(-not [regex]::IsMatch($Html,$pattern)){
      Write-Host "FAIL  $Target missing: $label" -ForegroundColor Red
      $TargetFailed.Value = $true
    }
  }
}

$requiredCssSelectors = @(
  "topbar",
  "quick-nav",
  "quick-nav-btn",
  "logobar",
  "logobar-brand-wrap",
  "logobar-meta",
  "app-scroll",
  "input-bar",
  "input-stack-vertel",
  "input-toolbar-vertel",
  "vertel-mic-hint-row",
  "input-area",
  "input-area-vertel",
  "rnd",
  "rnd.gr",
  "rnd.rd",
  "rnd.rd-mic",
  "nav",
  "tab"
)

$requiredHtmlRegex = @(
  '<div class="topbar">',
  '<div class="quick-nav"',
  '<div class="logobar"',
  '<div id="inputBar"',
  '<div class="input-bar">',
  '<div class="input-stack-vertel">',
  '<div class="input-toolbar-vertel',
  '<(div|nav)\s+class="nav"'
)

$requiredBlockOrderPatterns = @(
  '<div class="topbar">',
  '<div class="quick-nav"',
  '<div class="app-scroll"',
  '<div id="inputBar"',
  '<(div|nav)\s+class="nav"'
)

$selfsenseVisualRules = @(
  @{ label = "background rings (.bg-art or .pad-corner)"; pattern = '(<div class="bg-art"|<div class="pad-corner )' },
  @{ label = "Home shell render (.home-shell)"; pattern = 'function rHome\([\s\S]*?class="home-shell"' },
  @{ label = "Advies shell render (.advice-hub-shell)"; pattern = 'function rAdvies\([\s\S]*?class="[^"]*advice-hub-shell' },
  @{ label = "Vertel shell render (.vertel-shell)"; pattern = 'function (renderVertelMain|rVertel)\([\s\S]*?class="[^"]*vertel-shell' },
  @{ label = "Bottom nav active ripple (.nav-tab-rimpel)"; pattern = '\.nav-tab-rimpel' }
)

if (-not (Test-Path $Template)) {
  throw "Template file not found: $Template"
}

$templateHtml = Get-Content -Raw $Template

$failed = $false

foreach ($target in $Targets) {
  if (-not [System.IO.Path]::IsPathRooted($target)) {
    $target = Join-Path $ProjectRoot $target
  }
  if (-not (Test-Path $target)) {
    Write-Host "SKIP  $target (file not found)" -ForegroundColor Yellow
    $failed = $true
    continue
  }

  $targetHtml = Get-Content -Raw $target
  $targetFailed = $false

  foreach ($selector in $requiredCssSelectors) {
    $tBlock = Get-StyleBlock -Html $templateHtml -Selector $selector
    $xBlock = Get-StyleBlock -Html $targetHtml -Selector $selector

    if ($null -eq $tBlock) {
      Write-Host "WARN  Template missing selector .$selector" -ForegroundColor Yellow
      continue
    }
    if ($null -eq $xBlock) {
      Write-Host "FAIL  $target missing selector .$selector" -ForegroundColor Red
      $targetFailed = $true
      continue
    }
    if ($tBlock -ne $xBlock) {
      Write-Host "FAIL  $target selector .$selector differs from template" -ForegroundColor Red
      $targetFailed = $true
    }
  }

  foreach ($marker in $requiredHtmlRegex) {
    if (-not [regex]::IsMatch($targetHtml, $marker)) {
      Write-Host "FAIL  $target missing marker pattern: $marker" -ForegroundColor Red
      $targetFailed = $true
    }
  }

  $lastIndex = -1
  foreach ($pattern in $requiredBlockOrderPatterns) {
    $m = [regex]::Match($targetHtml, $pattern)
    if (-not $m.Success) {
      Write-Host "FAIL  $target missing order marker pattern: $pattern" -ForegroundColor Red
      $targetFailed = $true
      continue
    }
    if ($m.Index -lt $lastIndex) {
      Write-Host "FAIL  $target block order mismatch at: $pattern" -ForegroundColor Red
      $targetFailed = $true
    }
    $lastIndex = $m.Index
  }

  if ($target -match '(?i)selfsense\.html$') {
    Assert-RegexList -Html $targetHtml -Target $target -Rules $selfsenseVisualRules -TargetFailed ([ref]$targetFailed)
  }

  if ($targetFailed) {
    $failed = $true
    Write-Host "----  $target parity: FAILED" -ForegroundColor Red
  } else {
    Write-Host "OK    $target parity: PASSED" -ForegroundColor Green
  }
}

if ($failed) {
  exit 1
}

Write-Host "Shell parity check passed for all targets." -ForegroundColor Green
exit 0


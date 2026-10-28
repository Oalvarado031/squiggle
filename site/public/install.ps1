# Installs the Squiggle command line (squigglelang) with npm.
#   irm https://squigglee.online/install.ps1 | iex
# It only runs `npm install -g squigglelang`; read it first if you like.
$ErrorActionPreference = 'Stop'

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'Squiggle needs Node.js 18 or newer (it comes with npm).'
  Write-Host 'Get it from https://nodejs.org, then run this again.'
  exit 1
}

$major = [int](node -p 'process.versions.node.split(".")[0]')
if ($major -lt 18) {
  Write-Host "Squiggle needs Node.js 18 or newer; this machine has $(node -v)."
  exit 1
}

npm view squigglelang version *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "squigglelang isn't on npm yet. Check back soon, or build it from the Squiggle repository."
  exit 1
}

Write-Host 'Installing squigglelang with npm...'
npm install -g squigglelang

Write-Host ''
Write-Host 'Done. Try:'
Write-Host '  squiggle render tide --out tide.png'
Write-Host '  squiggle shell'

# WACK MUZIC: build the Windows installer and publish it as a GitHub release, in one step.
# The token is typed into a hidden prompt, kept only in this window's memory, and removed at the end.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
Write-Host ''
Write-Host "  WACK MUZIC $($pkg.version)  ->  github.com/Jackryder4/vi-studio/releases" -ForegroundColor Magenta
Write-Host '  Builds the installer and uploads it, the .blockmap and latest.yml (needed for auto-updates).' -ForegroundColor DarkGray
Write-Host ''
$sec = Read-Host '  Paste your GitHub token (it stays hidden), then press Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try { $env:GH_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if (-not $env:GH_TOKEN) { Write-Host '  No token entered - nothing was published.' -ForegroundColor Yellow; Read-Host '  Press Enter to close'; exit 1 }
$ok = $false
try {
  npm run release
  $ok = ($LASTEXITCODE -eq 0)
} finally {
  Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
}
Write-Host ''
if ($ok) {
  Write-Host "  Published WACK MUZIC $($pkg.version)! Installed copies will offer the update automatically." -ForegroundColor Green
  Start-Process 'https://github.com/Jackryder4/vi-studio/releases'
} else {
  Write-Host '  Publishing failed - read the messages above (most often: token missing the Contents: Read and write permission).' -ForegroundColor Red
}
Read-Host '  Press Enter to close'

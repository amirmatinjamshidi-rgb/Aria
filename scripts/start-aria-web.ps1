# Starts Aria web lab processes in separate PowerShell windows (Windows).
# Review each window's logs. Close windows to stop.
# Compatible with Windows PowerShell 5.1 and PowerShell 7+.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Aria web lab - checking Piper TTS models..."
$ganji = Join-Path $Root "models\piper\fa_IR-ganji-medium.onnx"
$lessac = Join-Path $Root "models\piper\en_US-lessac-medium.onnx"
if (-not ((Test-Path -LiteralPath $ganji) -and (Test-Path -LiteralPath $lessac))) {
  Write-Host "Downloading Ganji (fa) + Lessac (en) Piper voices..."
  python (Join-Path $Root "sidecars\voice\download_models.py")
}

Write-Host "Aria web lab - launching sidecars + gateway + dashboard"
Write-Host "Docs: docs/USER_GUIDE.md"

function Start-AriaWindow {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Command
  )

  $inner = "Set-Location -LiteralPath '$Root'; Write-Host '$Title'; $Command"
  Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $inner
  ) | Out-Null
}

Start-AriaWindow -Title "Aria voice sidecar" -Command "npm run voice:sidecar"
Start-Sleep -Seconds 1
Start-AriaWindow -Title "Aria vision sidecar" -Command "npm run vision:sidecar"
Start-Sleep -Seconds 1
Start-AriaWindow -Title "Aria voice:web gateway" -Command "npm run voice:web"
Start-Sleep -Seconds 2
Start-AriaWindow -Title "Aria dashboard" -Command "npm run dashboard"

Write-Host "Open http://localhost:3000 when the dashboard is ready."
Write-Host "Providers UI stores keys in %USERPROFILE%\.aria\user-settings.json"

$ErrorActionPreference = 'Continue'
$OutDir = Join-Path (Get-Location) 'logs'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$OutFile = Join-Path $OutDir "android-crash-$Stamp.log"

Write-Host '[Aplus Android] Clear old logcat...'
adb logcat -c
Write-Host '[Aplus Android] Start logcat. Reproduce crash now. Press Ctrl+C after app crashes.'
Write-Host "[Aplus Android] Log file: $OutFile"
adb logcat -v time | Tee-Object -FilePath $OutFile

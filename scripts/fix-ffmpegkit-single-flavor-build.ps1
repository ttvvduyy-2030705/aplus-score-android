$ErrorActionPreference = "Stop"
Write-Host "[Aplus Android] Fix FFmpegKit single-flavor dependency and clean stale builds..." -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$paths = @(
  ".\android\.gradle",
  ".\android\app\build",
  ".\node_modules\react-native-video-trim\android\build",
  ".\node_modules\ffmpeg-kit-react-native\android\build"
)

foreach ($p in $paths) {
  if (Test-Path $p) {
    Write-Host "[Aplus Android] Remove $p"
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

Push-Location .\android
.\gradlew clean
Pop-Location

Write-Host "[Aplus Android] Done. Now run: npm run android:bundled-debug" -ForegroundColor Green

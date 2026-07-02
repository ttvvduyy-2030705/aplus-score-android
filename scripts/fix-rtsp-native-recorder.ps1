$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[Aplus Android] Switch RTSP recorder from FFmpegKit to native MediaExtractor/MediaMuxer..." -ForegroundColor Cyan

Get-Process node,java,gradle -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Remove FFmpegKit packages/build leftovers. RTSP recording is now handled by native app code.
Remove-Item -Recurse -Force ".\node_modules\ffmpeg-kit-react-native" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules\@nikhil-cephei" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\app\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\.gradle" -ErrorAction SilentlyContinue
Remove-Item -Force ".\package-lock.json" -ErrorAction SilentlyContinue

Write-Host "[Aplus Android] npm install..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "[Aplus Android] gradlew clean..." -ForegroundColor Cyan
Set-Location ".\android"
.\gradlew.bat clean
if ($LASTEXITCODE -ne 0) { throw "gradlew clean failed" }
Set-Location $root

Write-Host "[Aplus Android] Done. Now run: npm run android:bundled-debug" -ForegroundColor Green

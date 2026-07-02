$ErrorActionPreference = "Stop"

Write-Host "[Aplus Android] Restore RTSP recorder to FFmpegKit HTTPS package..." -ForegroundColor Cyan

if (!(Test-Path ".\package.json")) {
  throw "Run this script from C:\project\aplus-score-android"
}

# Remove stale fork/native build leftovers if they exist.
Remove-Item -Recurse -Force ".\node_modules\@nikhil-cephei" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules\ffmpeg-kit-react-native\android\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\.gradle" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\app\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\build" -ErrorAction SilentlyContinue

Write-Host "[Aplus Android] npm install..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "[Aplus Android] Gradle clean..." -ForegroundColor Cyan
Push-Location .\android
.\gradlew.bat clean
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "gradlew clean failed" }

Write-Host "[Aplus Android] Done. Now run: npm run android:bundled-debug" -ForegroundColor Green

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[Aplus Android] Fix FFmpegKit duplicate classes: keep HTTPS flavor only..." -ForegroundColor Cyan

if (!(Test-Path ".\package.json")) {
  throw "Run this script from C:\project\aplus-score-android"
}

Get-Process node,java,gradle -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Remove stale Gradle outputs so duplicate AAR resolution is recalculated.
Remove-Item -Recurse -Force ".\node_modules\ffmpeg-kit-react-native\android\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\.gradle" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\app\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\build" -ErrorAction SilentlyContinue

# Remove cached fork AARs only; Gradle will re-download the single HTTPS flavor.
Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1\io.github.maitrungduc1410\ffmpeg-kit-min" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:USERPROFILE\.gradle\caches\modules-2\files-2.1\com.arthenica\ffmpeg-kit-min" -ErrorAction SilentlyContinue

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

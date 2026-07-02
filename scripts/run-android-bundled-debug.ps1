$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "[Aplus Android] Build/install bundled Debug APK (Metro is NOT required)..." -ForegroundColor Cyan

# Stop old app process so Android does not keep a stale React instance.
adb shell am force-stop com.aplusscore.android 2>$null | Out-Null

# Ensure assets folder exists and remove stale bundle first.
New-Item -ItemType Directory -Force -Path ".\android\app\src\main\assets" | Out-Null
Remove-Item -Force ".\android\app\src\main\assets\index.android.bundle" -ErrorAction SilentlyContinue

# Create JS bundle inside android/app/src/main/assets so even Debug APK can boot without Metro.
Write-Host "[Aplus Android] Generate index.android.bundle..." -ForegroundColor Cyan
npx react-native bundle `
  --platform android `
  --dev false `
  --entry-file index.js `
  --bundle-output android/app/src/main/assets/index.android.bundle `
  --assets-dest android/app/src/main/res
if ($LASTEXITCODE -ne 0) { throw "React Native bundle failed" }

if (!(Test-Path ".\android\app\src\main\assets\index.android.bundle")) {
  throw "index.android.bundle was not created. Stop."
}

# Install debug APK. Stop immediately if Gradle fails.
Write-Host "[Aplus Android] Install debug APK..." -ForegroundColor Cyan
Set-Location ".\android"
.\gradlew.bat :app:installDebug
if ($LASTEXITCODE -ne 0) { throw "Gradle installDebug failed. App was NOT installed." }
Set-Location $root

Write-Host "[Aplus Android] Launch app..." -ForegroundColor Cyan
adb shell monkey -p com.aplusscore.android -c android.intent.category.LAUNCHER 1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Launch app failed" }

Write-Host "[Aplus Android] Done." -ForegroundColor Green

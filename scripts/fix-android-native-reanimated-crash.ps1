$ErrorActionPreference = "Continue"

Write-Host "[Aplus] Fix Android native crash: disable Reanimated/Worklets native modules" -ForegroundColor Cyan

$paths = @(
  ".\node_modules\react-native-reanimated",
  ".\node_modules\react-native-worklets-core",
  ".\android\app\build",
  ".\android\build",
  ".\android\.gradle",
  ".\android\app\.cxx"
)

foreach ($path in $paths) {
  if (Test-Path $path) {
    Write-Host "[Aplus] Removing $path"
    Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue
  }
}

Remove-Item -Force ".\package-lock.json" -ErrorAction SilentlyContinue

Write-Host "[Aplus] Installing dependencies without native Reanimated/Worklets..." -ForegroundColor Cyan
npm install

Write-Host "[Aplus] Cleaning Gradle..." -ForegroundColor Cyan
Push-Location .\android
.\gradlew clean
Pop-Location

Write-Host "[Aplus] Done. Now run: npm run android:bundled-debug" -ForegroundColor Green

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "[Aplus Android] Stop Gradle/Node/Java locks..."
taskkill /F /IM java.exe 2>$null | Out-Null
taskkill /F /IM node.exe 2>$null | Out-Null
taskkill /F /IM gradle.exe 2>$null | Out-Null

Write-Host "[Aplus Android] Remove Realm native packages/build folders..."
Remove-Item -Recurse -Force ".\node_modules\realm" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules\@realm" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\.gradle" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\app\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\android\app\.cxx" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules\realm\binding\android\.cxx" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules\react-native-reanimated\android\build" -ErrorAction SilentlyContinue

Write-Host "[Aplus Android] Reinstall packages according to package.json..."
npm install

Write-Host "[Aplus Android] Done. Now run: npx react-native run-android"

param(
  [string]$PackageName = "com.aplusscore.android"
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root "crashlogs"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$log = Join-Path $OutDir "gameplay-crash-live-$stamp.txt"

adb logcat -c
adb shell am force-stop $PackageName | Out-Null
adb shell monkey -p $PackageName -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Đang hiển thị log lỗi trực tiếp. Bấm Bắt đầu trong app để reproduce crash." -ForegroundColor Yellow
Write-Host "Log đồng thời lưu ở: $log" -ForegroundColor Green
Write-Host "Dừng bằng Ctrl+C sau khi crash." -ForegroundColor Yellow
adb logcat -v threadtime AndroidRuntime:E ReactNativeJS:E ReactNative:E libc:E DEBUG:E FATAL:E System.err:E *:S | Tee-Object -FilePath $log

param(
  [string]$PackageName = "com.aplusscore.android"
)

$ErrorActionPreference = "Stop"

function Write-Step($msg) {
  Write-Host "[capture] $msg" -ForegroundColor Cyan
}

function Run-Adb($adbPath, $adbArgs) {
  & $adbPath @adbArgs
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ProjectRoot) {
  $ProjectRoot = Get-Location
}
Set-Location $ProjectRoot

$adbCmd = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbCmd) {
  throw "adb was not found in PATH. Open Android Studio/SDK terminal or add Android SDK platform-tools to PATH."
}
$Adb = $adbCmd.Source

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutDir = Join-Path $ProjectRoot "crashlogs"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$FullLog = Join-Path $OutDir "gameplay-crash-full-$Stamp.txt"
$ErrorsLog = Join-Path $OutDir "gameplay-crash-errors-$Stamp.txt"
$CrashBufferLog = Join-Path $OutDir "gameplay-crash-crashbuffer-$Stamp.txt"
$ActivityLog = Join-Path $OutDir "gameplay-crash-activity-$Stamp.txt"
$DeviceLog = Join-Path $OutDir "gameplay-crash-device-$Stamp.txt"
$AdbErr = Join-Path $OutDir "gameplay-crash-adb-stderr-$Stamp.txt"

Write-Step "Checking connected Android device..."
$devices = & $Adb devices
$devices | Set-Content -Encoding UTF8 $DeviceLog
$deviceLines = $devices | Where-Object { $_ -match "\sdevice$" -and $_ -notmatch "^List of" }
if (($deviceLines | Measure-Object).Count -lt 1) {
  throw "No Android device is connected. Check USB debugging, then run: adb devices"
}

Write-Step "Clearing old logcat..."
& $Adb logcat -c | Out-Null

Write-Step "Starting full logcat capture..."
$logProc = Start-Process -FilePath $Adb -ArgumentList @("logcat", "-v", "time") -RedirectStandardOutput $FullLog -RedirectStandardError $AdbErr -NoNewWindow -PassThru

Start-Sleep -Seconds 1

Write-Step "Launching app package: $PackageName"
try {
  & $Adb shell monkey -p $PackageName -c android.intent.category.LAUNCHER 1 | Out-Null
} catch {
  Write-Host "Could not auto-launch app. Open the app manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "NOW TEST ON THE DEVICE:" -ForegroundColor Yellow
Write-Host "1) Go to Setting"
Write-Host "2) Press Bat dau / Start to enter gameplay"
Write-Host "3) Wait until the app crashes or closes"
Write-Host "4) Return here and press ENTER"
Write-Host ""
Read-Host "Press ENTER after the crash"

Write-Step "Stopping logcat capture..."
try {
  if ($logProc -and -not $logProc.HasExited) {
    $logProc.Kill()
    $logProc.WaitForExit()
  }
} catch {}

Start-Sleep -Seconds 1

Write-Step "Saving crash buffer..."
try {
  & $Adb logcat -d -b crash -v time | Set-Content -Encoding UTF8 $CrashBufferLog
} catch {
  "Could not read crash buffer: $($_.Exception.Message)" | Set-Content -Encoding UTF8 $CrashBufferLog
}

Write-Step "Saving activity/process info..."
try {
  $activityLines = @()
  $activityLines += "===== PID ====="
  $activityLines += (& $Adb shell pidof $PackageName 2>&1)
  $activityLines += ""
  $activityLines += "===== DUMPSYS ACTIVITY PROCESSES FILTER ====="
  $activityLines += (& $Adb shell dumpsys activity processes 2>&1 | Select-String -Pattern $PackageName -Context 5,8 | ForEach-Object { $_.ToString() })
  $activityLines += ""
  $activityLines += "===== DUMPSYS PACKAGE ====="
  $activityLines += (& $Adb shell dumpsys package $PackageName 2>&1 | Select-String -Pattern "versionName|versionCode|firstInstallTime|lastUpdateTime|pkg=|codePath|nativeLibraryDir" | ForEach-Object { $_.ToString() })
  $activityLines | Set-Content -Encoding UTF8 $ActivityLog
} catch {
  "Could not read activity info: $($_.Exception.Message)" | Set-Content -Encoding UTF8 $ActivityLog
}

Write-Step "Filtering important crash lines..."
$patterns = @(
  "FATAL EXCEPTION",
  "AndroidRuntime",
  "Fatal signal",
  "SIGSEGV",
  "SIGABRT",
  "libc",
  "DEBUG",
  "RuntimeException",
  "IllegalStateException",
  "IllegalArgumentException",
  "UnsatisfiedLinkError",
  "NoSuchMethodError",
  "NoClassDefFoundError",
  "JSApplicationIllegalArgumentException",
  "ReactNativeJS",
  "com.facebook.react",
  "VisionCamera",
  "CameraView",
  "CameraSession",
  "Uvc",
  "UVC",
  "Usb",
  "USB",
  "billiards_management",
  "aplusscore"
)

if (Test-Path $FullLog) {
  Select-String -Path $FullLog -Pattern $patterns -SimpleMatch -Context 6,16 | ForEach-Object { $_.ToString() } | Set-Content -Encoding UTF8 $ErrorsLog
} else {
  "Full log file was not created." | Set-Content -Encoding UTF8 $ErrorsLog
}

Write-Host ""
Write-Host "DONE. Send these files to ChatGPT:" -ForegroundColor Green
Write-Host $OutDir
Write-Host ""
Get-ChildItem $OutDir -Filter "gameplay-crash-*-$Stamp.txt" | ForEach-Object { Write-Host $_.FullName }

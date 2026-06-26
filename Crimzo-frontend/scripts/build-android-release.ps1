# Builds release APK (Windows-safe). Uses CMAKE_OBJECT_PATH_MAX in app/build.gradle.
$ErrorActionPreference = "Stop"
$frontendRoot = Split-Path $PSScriptRoot -Parent

if (-not $env:JAVA_HOME) {
    $jdk = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
    if (Test-Path $jdk) { $env:JAVA_HOME = $jdk }
}
if ($env:JAVA_HOME) {
    $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}

Push-Location (Join-Path $frontendRoot "android")
try {
    Remove-Item -Recurse -Force "app\.cxx" -ErrorAction SilentlyContinue
    .\gradlew.bat assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw "Gradle build failed (exit $LASTEXITCODE)" }

    $apk = Get-ChildItem -Path "app\build\outputs\apk\release" -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($apk) {
        $dest = Join-Path $frontendRoot "crimzo-release.apk"
        Copy-Item $apk.FullName $dest -Force
        Write-Host "APK copied to $dest"
    }
}
finally {
    Pop-Location
}
# PowerShell script to refactor packages from com.angrysurfer.nexus to com.angrysurfer.spring.nexus
# This script avoids introducing BOM characters

$basePath = "C:\dev\WORK\nexus\spring\service-broker"

# Modules to refactor (excluding broker-service which is already done)
$modules = @(
    "admin-logging",
    "broker-gateway",
    "broker-gateway-sec-bot",
    "broker-service-api",
    "broker-service-spi",
    "export-service",
    "file-service",
    "file-service-api",
    "login-service",
    "note-service",
    "registry-service",
    "search-service",
    "shrapnel-data",
    "social-media",
    "social-media-api",
    "upload-service",
    "user-access-service",
    "user-api",
    "user-service"
)

foreach ($module in $modules) {
    $modulePath = Join-Path $basePath $module
    if (!(Test-Path $modulePath)) {
        Write-Host "Module $module not found, skipping..."
        continue
    }
    
    Write-Host "Processing module: $module"
    
    # Find all Java files
    $javaFiles = Get-ChildItem -Path $modulePath -Filter *.java -Recurse
    
    foreach ($file in $javaFiles) {
        # Read file content as bytes first to check for BOM
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        
        # Skip if file already has new package
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        if ($content -match "package com\.angrysurfer\.spring\.nexus") {
            continue
        }
        
        # Replace package and import statements
        $newContent = $content `
            -replace 'package com\.angrysurfer\.nexus\.', 'package com.angrysurfer.spring.nexus.' `
            -replace 'import com\.angrysurfer\.nexus\.', 'import com.angrysurfer.spring.nexus.'
        
        # Only write if content changed
        if ($newContent -ne $content) {
            # Write without BOM
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)
            Write-Host "  Updated: $($file.Name)"
        }
    }
    
    # Now move files to new directory structure
    $oldBase = Join-Path $modulePath "src\main\java\com\angrysurfer\nexus"
    $newBase = Join-Path $modulePath "src\main\java\com\angrysurfer\spring\nexus"
    
    if (Test-Path $oldBase) {
        # Create new directory
        $newDir = New-Item -ItemType Directory -Path $newBase -Force
        
        # Move all contents
        Get-ChildItem -Path $oldBase -Recurse | ForEach-Object {
            $relativePath = $_.FullName.Substring($oldBase.Length).TrimStart('\')
            $newPath = Join-Path $newBase $relativePath
            
            if ($_.PSIsContainer) {
                $targetDir = Join-Path $newBase $relativePath
                if (!(Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
            } else {
                $targetDir = Split-Path $newPath -Parent
                if (!(Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
                Move-Item -Path $_.FullName -Destination $newPath -Force
            }
        }
        
        # Remove old directory structure
        Remove-Item -Path (Join-Path $modulePath "src\main\java\com\angrysurfer\nexus") -Recurse -Force
        
        Write-Host "  Moved files to new package structure"
    }
    
    # Also handle test files
    $oldTestBase = Join-Path $modulePath "src\test\java\com\angrysurfer\nexus"
    $newTestBase = Join-Path $modulePath "src\test\java\com\angrysurfer\spring\nexus"
    
    if (Test-Path $oldTestBase) {
        # Create new directory
        $newDir = New-Item -ItemType Directory -Path $newTestBase -Force
        
        # Move all contents
        Get-ChildItem -Path $oldTestBase -Recurse | ForEach-Object {
            $relativePath = $_.FullName.Substring($oldTestBase.Length).TrimStart('\')
            $newPath = Join-Path $newTestBase $relativePath
            
            if ($_.PSIsContainer) {
                $targetDir = Join-Path $newTestBase $relativePath
                if (!(Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
            } else {
                $targetDir = Split-Path $newPath -Parent
                if (!(Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
                Move-Item -Path $_.FullName -Destination $newPath -Force
            }
        }
        
        # Remove old directory structure
        Remove-Item -Path (Join-Path $modulePath "src\test\java\com\angrysurfer\nexus") -Recurse -Force
        
        Write-Host "  Moved test files to new package structure"
    }
}

Write-Host "`nRefactoring complete!"

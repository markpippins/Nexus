# PowerShell script to refactor broker-service packages from com.angrysurfer.nexus to com.angrysurfer.spring.nexus

$basePath = "C:\dev\WORK\nexus\spring\service-broker"
$module = "broker-service"
$modulePath = Join-Path $basePath $module

Write-Host "Processing module: $module"

# Find all Java files
$javaFiles = Get-ChildItem -Path $modulePath -Filter *.java -Recurse

foreach ($file in $javaFiles) {
    # Read file content
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    
    # Skip if file already has new package
    if ($content -match "package com\.angrysurfer\.spring\.nexus") {
        continue
    }
    
    # Replace package and import statements
    $newContent = $content `
        -replace 'package com\.angrysurfer\.nexus\.broker', 'package com.angrysurfer.spring.nexus.broker' `
        -replace 'import com\.angrysurfer\.nexus\.broker', 'import com.angrysurfer.spring.nexus.broker' `
        -replace 'import com\.angrysurfer\.nexus\.admin\.logging', 'import com.angrysurfer.spring.nexus.admin.logging' `
        -replace 'import com\.angrysurfer\.nexus\.user', 'import com.angrysurfer.spring.nexus.user' `
        -replace 'import com\.angrysurfer\.nexus\.fs', 'import com.angrysurfer.spring.nexus.fs' `
        -replace 'import com\.angrysurfer\.nexus\.login', 'import com.angrysurfer.spring.nexus.login' `
        -replace 'import com\.angrysurfer\.nexus\.note', 'import com.angrysurfer.spring.nexus.note' `
        -replace 'import com\.angrysurfer\.nexus\.search', 'import com.angrysurfer.spring.nexus.search' `
        -replace 'import com\.angrysurfer\.nexus\.registry', 'import com.angrysurfer.spring.nexus.registry' `
        -replace 'import com\.angrysurfer\.nexus\.shrapnel', 'import com.angrysurfer.spring.nexus.shrapnel' `
        -replace 'import com\.angrysurfer\.nexus\.social', 'import com.angrysurfer.spring.nexus.social' `
        -replace 'import com\.angrysurfer\.nexus\.upload', 'import com.angrysurfer.spring.nexus.upload' `
        -replace 'import com\.angrysurfer\.nexus\.secbot', 'import com.angrysurfer.spring.nexus.secbot'
    
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
    
    Write-Host "  Moved main files to new package structure"
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

Write-Host "`nBroker-service refactoring complete!"

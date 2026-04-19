# PowerShell script to refactor shrapnel packages from com.angrysurfer.shrapnel to com.angrysurfer.spring.nexus.shrapnel

$basePath = "C:\dev\WORK\nexus\spring\service-broker"

$modules = @("export-service", "shrapnel-data")

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
        # Read file content
        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
        $content = [System.Text.Encoding]::UTF8.GetString($bytes)
        
        # Skip if file already has new package
        if ($content -match "package com\.angrysurfer\.spring\.nexus\.shrapnel") {
            continue
        }
        
        # Replace package and import statements
        $newContent = $content `
            -replace 'package com\.angrysurfer\.shrapnel\.', 'package com.angrysurfer.spring.nexus.shrapnel.' `
            -replace 'import com\.angrysurfer\.shrapnel\.', 'import com.angrysurfer.spring.nexus.shrapnel.'
        
        # Only write if content changed
        if ($newContent -ne $content) {
            # Write without BOM
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($file.FullName, $newContent, $utf8NoBom)
            Write-Host "  Updated: $($file.Name)"
        }
    }
    
    # Now move files to new directory structure
    $oldBase = Join-Path $modulePath "src\main\java\com\angrysurfer\shrapnel"
    $newBase = Join-Path $modulePath "src\main\java\com\angrysurfer\spring\nexus\shrapnel"
    
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
        Remove-Item -Path (Join-Path $modulePath "src\main\java\com\angrysurfer\shrapnel") -Recurse -Force
        
        Write-Host "  Moved files to new package structure"
    }
}

Write-Host "`nShrapnel refactoring complete!"

# dsh-memory-plugin 一键安装脚本 (PowerShell)
# Usage: .\install.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  dsh-memory-plugin Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginPath = $ScriptDir

Write-Host "📍 Plugin Path: $PluginPath" -ForegroundColor Green
Write-Host ""

# Find DSH Home directory
Write-Host "🔍 Searching for DSH configuration directory..." -ForegroundColor Yellow

$DSHHome = $env:DSH_HOME
if (-not $DSHHome) {
    $DefaultPath = Join-Path $env:USERPROFILE ".dsh"
    if (Test-Path $DefaultPath) {
        $DSHHome = $DefaultPath
        Write-Host "✅ Found default location: $DSHHome" -ForegroundColor Green
    } else {
        Write-Host "❌ DSH configuration directory not found" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please set DSH_HOME environment variable or confirm DSH is installed" -ForegroundColor Yellow
        pause
        exit 1
    }
} else {
    Write-Host "✅ Found DSH_HOME: $DSHHome" -ForegroundColor Green
}

$ProfilesDir = Join-Path $DSHHome "profiles"
Write-Host ""
Write-Host "📁 DSH Profiles Directory: $ProfilesDir" -ForegroundColor Cyan
Write-Host ""

# Check if profiles directory exists
if (-not (Test-Path $ProfilesDir)) {
    Write-Host "⚠️  Profiles directory does not exist, creating..." -ForegroundColor Yellow
    try {
        New-Item -ItemType Directory -Path $ProfilesDir -Force | Out-Null
        Write-Host "✅ Created successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create directory. Please check permissions." -ForegroundColor Red
        pause
        exit 1
    }
}

# Ask for installation method
Write-Host "Please choose installation method:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Copy to profiles directory (Recommended)" -ForegroundColor White
Write-Host "  2. Create symbolic link (Development mode)" -ForegroundColor White
Write-Host "  3. Show manual installation instructions" -ForegroundColor White
Write-Host ""

$Choice = Read-Host "Enter option (1/2/3)"

switch ($Choice) {
    "1" { Install-Copy }
    "2" { Install-Symlink }
    "3" { Show-Instructions }
    default {
        Write-Host ""
        Write-Host "❌ Invalid option" -ForegroundColor Red
        pause
        exit 1
    }
}

function Install-Copy {
    Write-Host ""
    Write-Host "📦 Copying plugin files..." -ForegroundColor Yellow
    
    $TargetDir = Join-Path $ProfilesDir "dsh-memory-plugin"
    
    if (Test-Path $TargetDir) {
        Write-Host "⚠️  Target directory already exists. Overwrite? (Y/N)" -ForegroundColor Yellow
        $Overwrite = Read-Host ""
        if ($Overwrite -eq "Y" -or $Overwrite -eq "y") {
            Remove-Item $TargetDir -Recurse -Force
        } else {
            Write-Host "Installation cancelled" -ForegroundColor Yellow
            pause
            exit 0
        }
    }
    
    try {
        Copy-Item -Path "$PluginPath\*" -Destination $TargetDir -Recurse -Force
        Write-Host "✅ Copy successful" -ForegroundColor Green
    } catch {
        Write-Host "❌ Copy failed: $_" -ForegroundColor Red
        pause
        exit 1
    }
    
    Post-Install $TargetDir
}

function Install-Symlink {
    Write-Host ""
    Write-Host "🔗 Creating symbolic link..." -ForegroundColor Yellow
    
    $TargetDir = Join-Path $ProfilesDir "dsh-memory-plugin"
    
    if (Test-Path $TargetDir) {
        Write-Host "⚠️  Target already exists. Delete and recreate? (Y/N)" -ForegroundColor Yellow
        $Overwrite = Read-Host ""
        if ($Overwrite -eq "Y" -or $Overwrite -eq "y") {
            Remove-Item $TargetDir -Recurse -Force
        } else {
            Write-Host "Installation cancelled" -ForegroundColor Yellow
            pause
            exit 0
        }
    }
    
    try {
        New-Item -ItemType Junction -Path $TargetDir -Target $PluginPath | Out-Null
        Write-Host "✅ Symbolic link created successfully" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create symbolic link (may require admin privileges)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Trying copy method instead..." -ForegroundColor Yellow
        Install-Copy
        return
    }
    
    Post-Install $TargetDir
}

function Show-Instructions {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Manual Installation Instructions" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Method 1: Copy to profiles directory" -ForegroundColor White
    Write-Host "  1. Copy the entire dsh-memory-plugin folder" -ForegroundColor Gray
    Write-Host "  2. Paste to: $ProfilesDir\" -ForegroundColor Gray
    Write-Host "  3. Restart DSH" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Method 2: Use DSH CLI" -ForegroundColor White
    Write-Host "  cd $ProfilesDir" -ForegroundColor Gray
    Write-Host "  dsh plugin add $PluginPath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Method 3: Direct code integration" -ForegroundColor White
    Write-Host "  const plugin = require('path/to/dsh-memory-plugin');" -ForegroundColor Gray
    Write-Host "  plugin.apply(ctx, config);" -ForegroundColor Gray
    Write-Host ""
    pause
    exit 0
}

function Post-Install($TargetDir) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✅ Installation Successful!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📂 Installation Location: $TargetDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Restart DSH to load the plugin" -ForegroundColor White
    Write-Host "  2. View documentation: README.md" -ForegroundColor White
    Write-Host "  3. Open Web Viewer: open-viewer.cmd" -ForegroundColor White
    Write-Host ""
    Write-Host "🎨 Quick Demo:" -ForegroundColor Yellow
    Write-Host "  Double-click: $TargetDir\open-viewer.cmd" -ForegroundColor White
    Write-Host ""
    Write-Host "📚 More Information:" -ForegroundColor Yellow
    Write-Host "  https://github.com/ly028716/dsh-memory-plugin" -ForegroundColor White
    Write-Host ""
    pause
    exit 0
}

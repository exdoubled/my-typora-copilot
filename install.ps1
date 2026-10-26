$ErrorActionPreference = 'Stop'
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workDir = [IO.Path]::GetFullPath((Join-Path $tempRoot "typora-copilot-$([Guid]::NewGuid())"))
New-Item -ItemType Directory -Path $workDir | Out-Null
try {
    $latestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/exdoubled/my-typora-copilot/releases/latest"
    $archive = Join-Path $workDir 'release.zip'
    $releaseDir = Join-Path $workDir 'release'
    Invoke-WebRequest -Uri $latestRelease.assets[0].browser_download_url -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $releaseDir
    Push-Location -LiteralPath $releaseDir
    try {
        Write-Host "Trying to install the new version..."
        .\bin\install_windows.ps1
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($workDir.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $workDir) -like 'typora-copilot-*') {
        Remove-Item -LiteralPath $workDir -Recurse -Force
    }
}

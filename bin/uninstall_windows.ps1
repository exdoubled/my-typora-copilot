param (
    [Alias('p')]
    [string] $Path = '',
    [Alias('s')]
    [switch] $Silent = $false
)

. "$PSScriptRoot\windows-common.ps1"
$root = Assert-CopilotLocalPath (Get-CopilotHome)
$configPath = Join-Path $root 'installation.json'
if (-not $Path -and (Test-Path -LiteralPath $configPath)) {
    $Path = (Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json).typoraPath
}
$typoraPath = if ($Path) { Assert-CopilotLocalPath $Path } else { Get-CopilotTyporaPath '' }
# Even when an update has removed the injection, remove the persistent launcher.
foreach ($relative in @('resources\app\window.html', 'resources\appsrc\window.html', 'resources\window.html')) {
    $windowPath = Join-Path $typoraPath $relative
    if (-not (Test-Path -LiteralPath $windowPath -PathType Leaf)) { continue }
    $null = Assert-CopilotLocalPath $windowPath
    $original = [IO.File]::ReadAllText($windowPath)
    Write-CopilotHtml $windowPath $original (Remove-CopilotTags $original)
    $backup = Assert-CopilotLocalPath "$windowPath.copilot-backup"
    if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    $parent = Split-Path $windowPath -Parent
    Remove-CopilotDirectory (Join-Path $parent 'copilot') $parent
}
Unregister-CopilotLauncher
if (Test-Path -LiteralPath $configPath) {
    Remove-CopilotDirectory $root (Split-Path $root -Parent)
}
if (-not $Silent) { Write-Host 'Copilot and its startup repair launcher have been uninstalled.' }

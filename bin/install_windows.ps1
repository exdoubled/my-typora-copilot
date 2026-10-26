param (
    [Alias('p')]
    [string] $Path = ''
)

. "$PSScriptRoot\windows-common.ps1"
$typoraPath = Get-CopilotTyporaPath $Path
$null = Get-CopilotWindow $typoraPath
$source = Split-Path $PSScriptRoot -Parent
$root = Assert-CopilotLocalPath (Get-CopilotHome)
$plugin = Join-Path $root 'plugin'
$previous = Join-Path $root 'plugin.previous'
$stage = Join-Path $root "staging-$([Guid]::NewGuid())"
foreach ($relative in @('index.js', 'mac-server.cjs', 'package.json', 'language-server\language-server.cjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) {
        throw 'Install from an extracted release or the built dist directory.'
    }
}
$null = New-Item -ItemType Directory -Path $stage -Force
try {
    foreach ($name in @('index.js', 'mac-server.cjs', 'package.json')) {
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $stage
    }
    Copy-Item -LiteralPath (Join-Path $source 'language-server') -Destination $stage -Recurse
    $null = Assert-CopilotLocalPath $plugin
    Remove-CopilotDirectory $previous $root
    if (Test-Path -LiteralPath $plugin) { Move-Item -LiteralPath $plugin -Destination $previous }
    try { Move-Item -LiteralPath (Assert-CopilotLocalPath $stage) -Destination $plugin }
    catch {
        if (Test-Path -LiteralPath $previous) { Move-Item -LiteralPath $previous -Destination $plugin }
        throw
    }
    $bin = Join-Path $root 'bin'
    $null = Assert-CopilotLocalPath $bin
    $null = New-Item -ItemType Directory -Path $bin -Force
    foreach ($name in @('windows-common.ps1', 'launch_windows.ps1', 'repair_windows.ps1', 'uninstall_windows.ps1')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $bin -Force
    }
    $config = @{ typoraPath = $typoraPath } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $root 'installation.json'), $config, (New-Object Text.UTF8Encoding $false))
    Register-CopilotLauncher $root $typoraPath
    try { $null = Repair-Copilot $typoraPath $plugin }
    catch {
        if (Test-CopilotAccessDenied $_) {
            Write-Warning 'Open Typora with Copilot from the Start menu to approve the initial repair.'
        }
        else { throw }
    }
    Remove-CopilotDirectory $previous $root
    Write-Host "Copilot is saved outside Typora at: $root"
    Write-Host 'Open "Typora with Copilot" from the Start menu. You can also select it under Open with for .md files.'
    Write-Host 'After updates, use this launcher to restore Copilot. Existing Typora windows must be restarted.'
}
finally { Remove-CopilotDirectory $stage $root }

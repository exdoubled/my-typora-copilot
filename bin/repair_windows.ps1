. "$PSScriptRoot\windows-common.ps1"
try {
    $root = Split-Path $PSScriptRoot -Parent
    $config = Get-Content -LiteralPath (Join-Path $root 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $typoraPath = Get-CopilotTyporaPath $config.typoraPath
    $null = Repair-Copilot $typoraPath (Join-Path $root 'plugin')
}
catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}

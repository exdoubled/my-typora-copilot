param (
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Files = @()
)

. "$PSScriptRoot\windows-common.ps1"
$root = Split-Path $PSScriptRoot -Parent
try {
    $config = Get-Content -LiteralPath (Join-Path $root 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $typoraPath = Get-CopilotTyporaPath $config.typoraPath
}
catch {
    Show-CopilotWarning $_.Exception.Message
    exit 1
}

$repaired = $false
try {
    $repaired = Repair-Copilot $typoraPath (Join-Path $root 'plugin')
}
catch {
    if (Test-CopilotAccessDenied $_) {
        try {
            # Elevate only the repair process. Typora is launched by this unelevated parent.
            $helper = Join-Path $PSScriptRoot 'repair_windows.ps1'
            $arguments = '-NoProfile -ExecutionPolicy Bypass -File ' + (ConvertTo-CopilotArgument $helper)
            $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
            $process = Start-Process -FilePath $powershell -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
            if ($process.ExitCode -ne 0) { throw 'Copilot repair failed. Please reinstall or check the Typora version.' }
            $repaired = $true
        }
        catch { Show-CopilotWarning ("Copilot could not be restored. Typora will still open.`n" + $_.Exception.Message) }
    }
    else { Show-CopilotWarning ("Copilot could not be restored. Typora will still open.`n" + $_.Exception.Message) }
}

$exe = Join-Path $typoraPath 'Typora.exe'
if ($repaired -and (Get-Process -Name Typora -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq $exe })) {
    Show-CopilotWarning 'Copilot was restored. Close all Typora windows and reopen Typora with Copilot to activate it.'
}
$arguments = @($Files | ForEach-Object { ConvertTo-CopilotArgument ([IO.Path]::GetFullPath($_)) }) -join ' '
if ($arguments) { Start-Process -FilePath $exe -ArgumentList $arguments }
else { Start-Process -FilePath $exe }

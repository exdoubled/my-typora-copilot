# Shared by the installer, launcher and uninstaller. Compatible with Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'

function Get-CopilotHome {
    return [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'TyporaCopilot'))
}

function Assert-CopilotLocalPath([string] $Path) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    if ($fullPath.StartsWith('\\')) { throw 'Network paths are not supported for the launcher.' }
    # Do not follow junctions/symlinks when patching or removing installed files.
    $current = $fullPath
    while ($current) {
        if ((Test-Path -LiteralPath $current) -and
            ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Refusing to modify a symbolic link or junction: $current"
        }
        $current = Split-Path -Path $current -Parent
    }
    return $fullPath
}

function Get-CopilotTyporaPath([string] $Path) {
    $candidates = @($Path)
    if (-not $Path) {
        $candidates = @(
            foreach ($key in @(
                'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Typora.exe',
                'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\Typora.exe'
            )) {
                if (Test-Path -LiteralPath $key) {
                    $exe = (Get-Item -LiteralPath $key).GetValue('')
                    if ($exe) { Split-Path -Path $exe.Trim('"') -Parent }
                }
            }
            'C:\Program Files\Typora'
            'C:\Program Files (x86)\Typora'
            "$env:LOCALAPPDATA\Programs\Typora"
        )
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'Typora.exe') -PathType Leaf)) {
            return Assert-CopilotLocalPath $candidate
        }
    }
    throw 'Cannot find Typora.exe. Re-run install_windows.ps1 -Path <Typora directory>.'
}

function Get-CopilotWindow([string] $TyporaPath) {
    foreach ($relative in @('resources\app\window.html', 'resources\appsrc\window.html', 'resources\window.html')) {
        $candidate = Join-Path $TyporaPath $relative
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return Assert-CopilotLocalPath $candidate
        }
    }
    throw 'This Typora layout is not supported: window.html was not found.'
}

function Remove-CopilotTags([string] $Content) {
    $content = $Content.Replace('<script src="./copilot/index.js" defer="defer"></script>', '')
    return [regex]::Replace($content, '<script id="typora-copilot-loader" src="[^"]+" defer="defer"></script>', '')
}

function Write-CopilotHtml([string] $Path, [string] $Original, [string] $Content) {
    if ($Original -ceq $Content) { return }
    $null = Assert-CopilotLocalPath $Path
    $backup = Assert-CopilotLocalPath "$Path.copilot-backup"
    $temporary = "$Path.copilot-$([Guid]::NewGuid()).tmp"
    try {
        [IO.File]::WriteAllText($temporary, $Content, (New-Object Text.UTF8Encoding $false))
        if ([IO.File]::ReadAllText($Path) -cne $Original) {
            throw 'Typora files changed during repair. Please retry after the update finishes.'
        }
        [IO.File]::Replace($temporary, $Path, $backup)
    }
    finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Repair-Copilot([string] $TyporaPath, [string] $PluginPath) {
    $null = Assert-CopilotLocalPath $PluginPath
    foreach ($relative in @('index.js', 'language-server\language-server.cjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $PluginPath $relative) -PathType Leaf)) {
            throw 'The saved Copilot files are incomplete. Please reinstall the plugin.'
        }
    }
    $windowPath = Get-CopilotWindow $TyporaPath
    $original = [IO.File]::ReadAllText($windowPath)
    $scriptUri = (New-Object Uri (Join-Path $PluginPath 'index.js')).AbsoluteUri
    $tag = '<script id="typora-copilot-loader" src="' + [Net.WebUtility]::HtmlEncode($scriptUri) + '" defer="defer"></script>'
    $content = Remove-CopilotTags $original
    $anchor = [regex]::Match($content, '<script\s+src="\./(?:app|appsrc)/window/frame\.js"\s+defer="defer"\s*>\s*</script>')
    if (-not $anchor.Success) { throw 'This Typora version has an unknown loading entry. No files were changed.' }
    $content = $content.Insert($anchor.Index + $anchor.Length, $tag)
    if ($content -ceq $original) { return $false }
    Write-CopilotHtml $windowPath $original $content
    return $true
}

function ConvertTo-CopilotArgument([string] $Value) {
    # Windows native argument quoting; never pass file names through cmd.exe or -Command.
    return '"' + [regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}

function Test-CopilotAccessDenied($ErrorRecord) {
    $exception = $ErrorRecord.Exception
    while ($exception) {
        if ($exception -is [UnauthorizedAccessException]) { return $true }
        $exception = $exception.InnerException
    }
    return $false
}

function Show-CopilotWarning([string] $Message) {
    Write-Warning $Message
    Add-Type -AssemblyName System.Windows.Forms
    $null = [Windows.Forms.MessageBox]::Show($Message, 'Typora with Copilot', 'OK', 'Warning')
}

function Get-CopilotShellPaths {
    return @{
        Shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Typora with Copilot.lnk'
        Classes = 'HKCU:\Software\Classes'
    }
}

function Register-CopilotLauncher([string] $Root, [string] $TyporaPath) {
    $shellPaths = Get-CopilotShellPaths
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $launcher = Join-Path $Root 'bin\launch_windows.ps1'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ' + (ConvertTo-CopilotArgument $launcher)
    $null = New-Item -ItemType Directory -Path (Split-Path $shellPaths.Shortcut -Parent) -Force
    $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shellPaths.Shortcut)
    $shortcut.TargetPath = $powershell
    $shortcut.Arguments = $arguments
    $shortcut.IconLocation = (Join-Path $TyporaPath 'Typora.exe') + ',0'
    $shortcut.Description = 'Check and restore Copilot before opening Typora'
    $shortcut.Save()

    $progId = Join-Path $shellPaths.Classes 'TyporaCopilot.Markdown'
    $null = New-Item -Path "$progId\shell\open\command" -Force
    Set-Item -LiteralPath $progId -Value 'Typora with Copilot'
    Set-Item -LiteralPath "$progId\shell\open\command" -Value ((ConvertTo-CopilotArgument $powershell) + ' ' + $arguments + ' "%1"')
    $null = New-ItemProperty -LiteralPath $progId -Name FriendlyTypeName -Value 'Typora with Copilot' -PropertyType String -Force
    foreach ($extension in @('.md', '.markdown')) {
        $key = Join-Path $shellPaths.Classes "$extension\OpenWithProgids"
        $null = New-Item -Path $key -Force
        $null = New-ItemProperty -LiteralPath $key -Name 'TyporaCopilot.Markdown' -Value '' -PropertyType String -Force
    }
}

function Unregister-CopilotLauncher {
    $shellPaths = Get-CopilotShellPaths
    if (Test-Path -LiteralPath $shellPaths.Shortcut) { Remove-Item -LiteralPath $shellPaths.Shortcut -Force }
    $progId = Join-Path $shellPaths.Classes 'TyporaCopilot.Markdown'
    if (Test-Path -LiteralPath $progId) { Remove-Item -LiteralPath $progId -Recurse -Force }
    foreach ($extension in @('.md', '.markdown')) {
        $key = Join-Path $shellPaths.Classes "$extension\OpenWithProgids"
        if (Test-Path -LiteralPath $key) {
            Remove-ItemProperty -LiteralPath $key -Name 'TyporaCopilot.Markdown' -ErrorAction SilentlyContinue
        }
    }
}

function Remove-CopilotDirectory([string] $Path, [string] $Parent) {
    $fullPath = Assert-CopilotLocalPath $Path
    $fullParent = Assert-CopilotLocalPath $Parent
    if ((Split-Path $fullPath -Parent) -ine $fullParent) { throw "Unexpected cleanup path: $fullPath" }
    if (Test-Path -LiteralPath $fullPath) {
        $pending = New-Object 'Collections.Generic.Stack[string]'
        $pending.Push($fullPath)
        while ($pending.Count) {
            foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                    throw "Refusing to remove a directory containing a symbolic link or junction: $($item.FullName)"
                }
                if ($item.PSIsContainer) { $pending.Push($item.FullName) }
            }
        }
        Remove-Item -LiteralPath $fullPath -Recurse -Force
    }
}

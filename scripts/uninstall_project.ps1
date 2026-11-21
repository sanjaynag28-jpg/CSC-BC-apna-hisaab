param(
    [string]$ProjectDir
)

$ErrorActionPreference = 'Stop'
$LogPath = Join-Path $env:TEMP 'CSC-BC-Apna-Hisaab-uninstall.log'
$script:WarningCount = 0

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    if ($Level -eq 'WARN' -or $Level -eq 'ERROR') { $script:WarningCount++ }
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch {
        Write-Warning "Uninstall log write failed: $($_.Exception.Message)"
    }
}

function Test-ProjectPathReference {
    param([string]$Value)
    if (-not $Value) { return $false }
    return $Value.Replace('/', '\').IndexOf(($ProjectDir.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-DotEnvValue {
    param([string]$FilePath, [string]$Name)
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { return $null }
    foreach ($line in Get-Content -LiteralPath $FilePath -ErrorAction Stop) {
        if ($line -match ("^\s*" + [regex]::Escape($Name) + "\s*=\s*(.*)$")) {
            $value = $Matches[1].Trim()
            if ($value.Length -ge 2 -and
                (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                 ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            return $value
        }
    }
    return $null
}

function Test-LocalSqlServerName {
    param([string]$ServerName)
    return $ServerName -match '^(localhost|127\.0\.0\.1|\.|\(local\))(\\[A-Za-z0-9_$.-]+)?$'
}

function New-IntegratedSqlConnection {
    param([string]$ServerName)
    $connection = New-Object System.Data.SqlClient.SqlConnection
    $connection.ConnectionString = "Server=$ServerName;Database=master;Integrated Security=True;TrustServerCertificate=True;Connection Timeout=5;"
    return $connection
}

function Remove-ProjectDatabase {
    $envPath = Join-Path $ProjectDir '.env'
    $serverName = Get-DotEnvValue -FilePath $envPath -Name 'DB_SERVER'
    $databaseName = Get-DotEnvValue -FilePath $envPath -Name 'DB_NAME'

    if ($databaseName -ne 'CashManagement') {
        Write-Log 'Project database was not identified as CashManagement; no SQL database was deleted.' 'WARN'
        return
    }
    if (-not (Test-LocalSqlServerName -ServerName $serverName)) {
        Write-Log 'Configured SQL Server is not a recognized local instance; leaving the database untouched.' 'WARN'
        return
    }

    $connection = New-IntegratedSqlConnection -ServerName $serverName
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = "SELECT IS_SRVROLEMEMBER('sysadmin')"
        if ([int]$command.ExecuteScalar() -ne 1) {
            throw 'The current Windows account is not a SQL Server sysadmin; database removal was refused.'
        }
        $command.CommandText = "SELECT CASE WHEN DB_ID(N'CashManagement') IS NULL THEN 0 ELSE 1 END"
        $databaseExists = [int]$command.ExecuteScalar() -eq 1
        if (-not $databaseExists) {
            Write-Log "CashManagement database was not found on $serverName."
            return
        }

        Write-Host ""
        Write-Host "Local project database found: $serverName / CashManagement" -ForegroundColor Yellow
        Write-Host "This permanently deletes that database. Other databases will be left alone." -ForegroundColor Yellow
        $answer = Read-Host 'Type DROP CashManagement to delete it'
        if ($answer -cne 'DROP CashManagement') {
            Write-Log 'User kept the CashManagement database.'
            return
        }

        $command.CommandText = 'ALTER DATABASE [CashManagement] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [CashManagement];'
        [void]$command.ExecuteNonQuery()
        Write-Log "Deleted project database CashManagement from $serverName." 'OK'
    } catch {
        Write-Log "Could not safely remove the configured CashManagement database: $($_.Exception.Message)" 'WARN'
    } finally {
        if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
        $connection.Dispose()
    }
}

function Remove-AppScheduledTasks {
    $taskNames = @(
        'CSC BC Apna Hisaab Server',
        'CSC BC Apna Hissab Server',
        'CSC BC Apna Hissab Server (Login)',
        'CSC BC Apna Hisaab Server (Login)'
    )

    foreach ($taskName in $taskNames) {
        try {
            $tasks = @(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)
            foreach ($task in $tasks) {
                $actions = @($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join ' '
                if (-not (Test-ProjectPathReference -Value $actions)) {
                    Write-Log "Kept scheduled task '$taskName' because it does not point to this project." 'WARN'
                    continue
                }

                if ($task.State -eq 'Running') {
                    Stop-ScheduledTask -InputObject $task -ErrorAction SilentlyContinue
                }
                Unregister-ScheduledTask -InputObject $task -Confirm:$false -ErrorAction Stop
                Write-Log "Removed project scheduled task '$taskName'."
            }
        } catch {
            Write-Log "Could not remove scheduled task '$taskName': $($_.Exception.Message)" 'WARN'
        }
    }
}

function Remove-AppStartupEntries {
    $startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    $startupFile = Join-Path $startupDir 'CSC BC Apna Hisaab (Auto).vbs'
    if (Test-Path -LiteralPath $startupFile -PathType Leaf) {
        $content = Get-Content -LiteralPath $startupFile -Raw -ErrorAction SilentlyContinue
        if (Test-ProjectPathReference -Value $content) {
            Remove-Item -LiteralPath $startupFile -Force
            Write-Log 'Removed project Startup-folder entry.'
        }
    }

    $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $runValueNames = @('CSC BC Apna Hisaab', 'CSC BC Apna Hissab')
    if (Test-Path $runKey) {
        $runValues = Get-ItemProperty -Path $runKey -ErrorAction SilentlyContinue
        if ($runValues) {
            foreach ($runValueName in $runValueNames) {
                $runProperty = $runValues.PSObject.Properties[$runValueName]
                if ($runProperty -and (Test-ProjectPathReference -Value $runProperty.Value)) {
                    Remove-ItemProperty -Path $runKey -Name $runValueName -Force
                    Write-Log "Removed project HKCU Run entry '$runValueName'."
                }
            }
        }
    }
}

function Remove-AppShortcuts {
    $programsDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
    $shortcutDirs = @(
        [Environment]::GetFolderPath('Desktop'),
        $programsDir,
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('CommonPrograms')
    ) | Where-Object { $_ } | Select-Object -Unique

    $shell = New-Object -ComObject WScript.Shell
    foreach ($directory in $shortcutDirs) {
        $shortcutPath = Join-Path $directory 'CSC BC Apna Hisaab.lnk'
        if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { continue }
        try {
            $shortcut = $shell.CreateShortcut($shortcutPath)
            if ((Test-ProjectPathReference -Value $shortcut.TargetPath) -or
                (Test-ProjectPathReference -Value $shortcut.Arguments) -or
                (Test-ProjectPathReference -Value $shortcut.WorkingDirectory)) {
                Remove-Item -LiteralPath $shortcutPath -Force
                Write-Log "Removed project shortcut: $shortcutPath"
            }
        } catch {
            Write-Log "Could not inspect shortcut '$shortcutPath': $($_.Exception.Message)" 'WARN'
        }
    }
}

function Remove-AppFirewallRule {
    try {
        $rules = @(Get-NetFirewallRule -DisplayName 'CSC BC Apna Hisaab (Port 3000)' -ErrorAction SilentlyContinue)
        foreach ($rule in $rules) {
            $portFilters = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)
            $isProjectPortRule = $rule.Direction -eq 'Inbound' -and
                @($portFilters | Where-Object { $_.LocalPort -contains '3000' -or $_.LocalPort -eq '3000' }).Count -gt 0
            if ($isProjectPortRule) {
                Remove-NetFirewallRule -InputObject $rule -ErrorAction Stop
                Write-Log 'Removed the project firewall rule for TCP port 3000.'
            }
        }
    } catch {
        Write-Log "Could not remove the project firewall rule: $($_.Exception.Message)" 'WARN'
    }
}

function Remove-AppDesktopFiles {
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not (Test-Path -LiteralPath $desktop -PathType Container)) { return }

    $markers = @{
        'SQL_FIX_LOG.txt' = 'CSC & BC APNA HISAAB - SQL SERVER SELF-REPAIR TOOL'
        'SQL_INSTANCE_INFO.txt' = 'SQL Server Express - is PC par'
        'CSC_DOCTOR_LOG.txt' = 'CSC & BC APNA HISAAB - DOCTOR'
    }
    foreach ($name in $markers.Keys) {
        $file = Join-Path $desktop $name
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
        $content = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
        if ($content -and $content.IndexOf($markers[$name], [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            Remove-Item -LiteralPath $file -Force
            Write-Log "Removed project diagnostic file: $file"
        }
    }
}

function Stop-AppServerProcesses {
    try {
        $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
        $byId = @{}
        foreach ($process in $processes) { $byId[[int]$process.ProcessId] = $process }

        foreach ($process in $processes) {
            if ($process.Name -notlike 'node*.exe' -or $process.CommandLine -notmatch 'server\.js') { continue }

            $ancestor = $process
            $belongsToProject = $false
            for ($depth = 0; $depth -lt 5 -and $ancestor; $depth++) {
                if (Test-ProjectPathReference -Value $ancestor.CommandLine) {
                    $belongsToProject = $true
                    break
                }
                $parentId = [int]$ancestor.ParentProcessId
                if (-not $byId.ContainsKey($parentId)) { break }
                $ancestor = $byId[$parentId]
            }

            if ($belongsToProject) {
                Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction Stop
                Write-Log "Stopped this project's Node server process (PID $($process.ProcessId))."
            }
        }
    } catch {
        Write-Log "Could not identify/stop every project server process: $($_.Exception.Message)" 'WARN'
    }
}

function Get-SqlUserDatabaseNames {
    param([string]$ServerName)
    $connection = New-IntegratedSqlConnection -ServerName $ServerName
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = "SELECT IS_SRVROLEMEMBER('sysadmin')"
        if ([int]$command.ExecuteScalar() -ne 1) {
            throw 'The current Windows account is not a SQL Server sysadmin; database enumeration was refused.'
        }
        $command.CommandText = 'SELECT name FROM sys.databases WHERE database_id > 4 ORDER BY name'
        $reader = $command.ExecuteReader()
        $names = @()
        while ($reader.Read()) { $names += [string]$reader['name'] }
        $reader.Close()
        return $names
    } finally {
        if ($connection.State -ne [System.Data.ConnectionState]::Closed) { $connection.Close() }
        $connection.Dispose()
    }
}

function Find-SqlSetupExecutable {
    $instanceNamesKey = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
    if (-not (Test-Path $instanceNamesKey)) { return $null }

    $instanceMap = Get-ItemProperty -Path $instanceNamesKey -ErrorAction SilentlyContinue
    $instanceId = [string]$instanceMap.CMBCSQL
    if ($instanceId -notmatch '^MSSQL(\d+)\.') { return $null }

    $bootstrapRoot = Join-Path $env:ProgramFiles ("Microsoft SQL Server\{0}\Setup Bootstrap" -f $Matches[1])
    if (-not (Test-Path -LiteralPath $bootstrapRoot)) { return $null }
    return Get-ChildItem -LiteralPath $bootstrapRoot -Filter 'setup.exe' -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Remove-ProjectSqlInstance {
    $serviceName = 'MSSQL$CMBCSQL'
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Log 'Project SQL instance CMBCSQL is not installed.'
        return
    }

    try {
        $userDatabases = @(Get-SqlUserDatabaseNames -ServerName 'localhost\CMBCSQL')
    } catch {
        Write-Log "Could not inspect CMBCSQL databases; keeping the SQL instance: $($_.Exception.Message)" 'WARN'
        return
    }
    if ($userDatabases.Count -gt 0) {
        Write-Log ("Keeping CMBCSQL because it contains user database(s): " + ($userDatabases -join ', ')) 'WARN'
        return
    }

    $setupExe = Find-SqlSetupExecutable
    if (-not $setupExe) {
        Write-Log 'Could not find the matching SQL setup.exe; keeping CMBCSQL installed.' 'WARN'
        return
    }

    Write-Host ""
    Write-Host 'CMBCSQL has no user databases. SQL Server 2012 (MSSQLSERVER) will not be removed.' -ForegroundColor Yellow
    Write-Host 'Uninstalling this SQL instance can affect any other program configured to use CMBCSQL.' -ForegroundColor Yellow
    $answer = Read-Host 'Type REMOVE CMBCSQL to uninstall only this named instance'
    if ($answer -cne 'REMOVE CMBCSQL') {
        Write-Log 'User kept the CMBCSQL SQL instance.'
        return
    }

    $arguments = @(
        '/Action=Uninstall',
        '/InstanceName=CMBCSQL',
        '/FEATURES=SQLENGINE',
        '/Quiet',
        '/IACCEPTSQLSERVERLICENSETERMS'
    )
    $process = Start-Process -FilePath $setupExe.FullName -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) {
        Write-Log "Uninstalled SQL Server instance CMBCSQL (exit $($process.ExitCode))." 'OK'
    } else {
        Write-Log "SQL Server instance CMBCSQL uninstall failed (exit $($process.ExitCode)); other SQL instances were left untouched." 'WARN'
    }
}

try {
    if (-not $ProjectDir) { $ProjectDir = Join-Path $env:USERPROFILE 'CSC-BC-Apna-Hisaab' }
    $ProjectDir = [System.IO.Path]::GetFullPath($ProjectDir).TrimEnd([char[]]@('\', '/'))

    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )) {
        throw 'Administrator rights are required. Right-click UNINSTALL_PROJECT.bat and choose Run as administrator.'
    }

    if ((Split-Path -Path $ProjectDir -Leaf) -ne 'CSC-BC-Apna-Hisaab') {
        throw "Refusing to remove unexpected folder: $ProjectDir"
    }
    $rootPath = [System.IO.Path]::GetPathRoot($ProjectDir).TrimEnd([char[]]@('\', '/'))
    $profilePath = [System.IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd([char[]]@('\', '/'))
    if ($ProjectDir -eq $rootPath -or $ProjectDir -eq $profilePath) {
        throw "Refusing to remove a protected/root folder: $ProjectDir"
    }
    $projectParent = [System.IO.Path]::GetFullPath((Split-Path -Path $ProjectDir -Parent)).TrimEnd([char[]]@('\', '/'))
    if ($projectParent -match '\\Users\\[^\\]+$' -and
        -not [string]::Equals($projectParent, $profilePath, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Run this uninstaller from the same Windows account that owns the project folder.'
    }
    if (-not (Test-Path -LiteralPath $ProjectDir -PathType Container)) {
        throw "Project folder not found: $ProjectDir"
    }

    $projectItem = Get-Item -LiteralPath $ProjectDir -Force
    if (($projectItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Refusing to remove a project path that is a junction or symbolic link.'
    }
    $identityFiles = @('server.js', 'package.json', 'ONE_CLICK_SETUP.bat', 'version.json', 'database\setup.sql')
    $hasProjectMarker = @($identityFiles | Where-Object { Test-Path -LiteralPath (Join-Path $ProjectDir $_) -PathType Leaf }).Count -gt 0
    if (-not $hasProjectMarker) {
        throw 'Project identity files were not found; refusing to delete this folder.'
    }

    Write-Host "Target project folder: $ProjectDir" -ForegroundColor Cyan
    Write-Host 'This deletes the project folder, including its .env, uploads, backups, logs, and local node_modules.' -ForegroundColor Yellow
    Write-Host 'The configured local CashManagement database is a separate deletion prompt.' -ForegroundColor Yellow
    Write-Host 'Global Node.js and SQL Server 2012 (MSSQLSERVER) will be kept.' -ForegroundColor Green
    Write-Host 'CMBCSQL can be removed only if it has no user databases and you confirm separately.' -ForegroundColor Green
    $confirmation = Read-Host 'Type DELETE CSC-BC-APNA-HISAAB to continue'
    if ($confirmation -cne 'DELETE CSC-BC-APNA-HISAAB') {
        Write-Log 'Uninstall cancelled by user.'
        exit 0
    }

    Remove-AppScheduledTasks
    Remove-AppStartupEntries
    Remove-AppShortcuts
    Remove-AppFirewallRule
    Remove-AppDesktopFiles
    Stop-AppServerProcesses
    Remove-ProjectDatabase
    Remove-ProjectSqlInstance

    Write-Log 'Global Node.js and SQL Server 2012 were intentionally left installed.'
    Set-Location -LiteralPath $env:TEMP
    Remove-Item -LiteralPath $ProjectDir -Recurse -Force -ErrorAction Stop
    Write-Log "Removed project folder and all files under it: $ProjectDir" 'OK'
    if ($script:WarningCount -gt 0) {
        Write-Log 'Project folder was removed, but some optional cleanup steps were skipped; review the log.' 'WARN'
        Write-Host "Project folder removed with warnings. Details: $LogPath" -ForegroundColor Yellow
        exit 2
    }
    Write-Host "Project uninstall complete. Details: $LogPath" -ForegroundColor Green
} catch {
    Write-Log $_.Exception.Message 'ERROR'
    Write-Host "Uninstall stopped safely. Details: $LogPath" -ForegroundColor Red
    exit 1
}

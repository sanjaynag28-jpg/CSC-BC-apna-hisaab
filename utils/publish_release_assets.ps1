# ============================================================================
# utils/publish_release_assets.ps1
# PUBLISH_UPDATE.bat ke baad chalta hai:
# - version.json ka version uthata hai (e.g. 1.0.3 -> v1.0.3)
# - GitHub Release banata hai (agar nahi hai)
# - SETUP.bat aur INSTALL_FROM_GITHUB.bat assets attach karta hai
# Token stored git credential se aata hai (print nahi hota).
# ============================================================================
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$repo = 'sanjaynag28-jpg/CSC-BC-apna-hisaab'

try {
    $version = (Get-Content (Join-Path $root 'version.json') -Raw | ConvertFrom-Json).version
    $tag = "v$version"
    Write-Host "  [..] GitHub Release $tag prepare ho raha hai..."

    $credRaw = "protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null
    $token = ($credRaw | Where-Object { $_ -match '^password=' }) -replace '^password=', ''
    if (-not $token) {
        Write-Host "  [!] GitHub token nahi mila - release assets skip (push phir bhi successful hai)."
        exit 0
    }

    $headers = @{
        Authorization = "token $token"
        'User-Agent'  = 'cmbc-release-helper'
        Accept        = 'application/vnd.github+json'
    }

    $rel = $null
    try {
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $headers -Method Get
    } catch {
        $json = (@{
            tag_name         = $tag
            name             = "$tag - 1-Click Installer"
            body             = 'Windows single-file installer. Download SETUP.bat and run it as Administrator.'
            draft            = $false
            prerelease       = $false
            target_commitish = 'main'
        } | ConvertTo-Json -Compress)
        $rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases" -Headers $headers -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8'
    }

    $assets = @(
        @{ Name = 'SETUP.bat';                  Path = (Join-Path $root 'INSTALL_FROM_GITHUB.bat') },
        @{ Name = 'INSTALL_FROM_GITHUB.bat';    Path = (Join-Path $root 'INSTALL_FROM_GITHUB.bat') },
        @{ Name = 'SQL_FIX.bat';                Path = (Join-Path $root 'SQL_FIX.bat') }
    )

    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/$($rel.id)/assets" -Headers $headers -Method Get
    foreach ($a in $assets) {
        $found = $existing | Where-Object { $_.name -eq $a.Name } | Select-Object -First 1
        if ($found) {
            Write-Host "  [OK] $($a.Name) already attached"
            continue
        }
        try {
            $url = "https://uploads.github.com/repos/$repo/releases/$($rel.id)/assets?name=$($a.Name)"
            $uploaded = $false
            for ($i = 1; $i -le 3 -and -not $uploaded; $i++) {
                try {
                    $up = Invoke-RestMethod -Uri $url -Headers $headers -Method Post -ContentType 'application/octet-stream' -InFile $a.Path
                    $uploaded = $true
                } catch {
                    Write-Host "  [!] $($a.Name) upload attempt $i/3 fail: $($_.Exception.Message)"
                    if ($i -lt 3) { Start-Sleep -Seconds (3 * $i) }
                }
            }
            if ($uploaded) { Write-Host "  [OK] $($a.Name) uploaded" }
        } catch {
            Write-Host "  [!] $($a.Name) upload skip: $($_.Exception.Message)"
        }
    }

    Write-Host "  [OK] Release page: $($rel.html_url)"
    Write-Host "  [OK] Direct download (naye PC): https://github.com/$repo/releases/download/$tag/SETUP.bat"
} catch {
    Write-Host "  [!] Release assets skip: $($_.Exception.Message)"
}

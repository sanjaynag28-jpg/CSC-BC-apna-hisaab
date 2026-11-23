# ============================================================================
# utils/cleanup_old_releases.ps1
# GitHub par sirf latest releases rakhta hai (default: 3 = latest + 2 purane)
# - Purane releases + unke git tags delete ho jate hain
# - Installed PCs par koi asar nahi: auto-update main branch + version.json se
#   chalta hai, releases se nahi.
# - Token git credential se aata hai (kabhi print nahi hota).
# Manual run:
#   powershell -ExecutionPolicy Bypass -File utils\cleanup_old_releases.ps1
#   powershell -ExecutionPolicy Bypass -File utils\cleanup_old_releases.ps1 -Keep 3
# ============================================================================

param(
    [int]$Keep = 2
)

$ErrorActionPreference = 'Continue'
$repo = 'sanjaynag28-jpg/CSC-BC-apna-hisaab'

if ($Keep -lt 1) { $Keep = 1 }

try {
    $credRaw = "protocol=https`nhost=github.com`n`n" | & git credential fill 2>$null
    $token = ($credRaw | Where-Object { $_ -match '^password=' }) -replace '^password=', ''
    if (-not $token) {
        Write-Host "  [!] GitHub token nahi mila - releases cleanup skip."
        exit 0
    }

    $headers = @{
        Authorization = "token $token"
        'User-Agent'  = 'cmbc-release-helper'
        Accept        = 'application/vnd.github+json'
    }

    # Note: Invoke-RestMethod array ko ek hi object ki tarah deta hai (PS 5.1),
    # isliye pehle variable me le kar phir @() karte hain.
    $releasesRaw = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases?per_page=100" -Headers $headers -Method Get
    $releases = @($releasesRaw)
    if ($releases.Count -le $Keep) {
        Write-Host "  [OK] Releases cleanup: $($releases.Count) releases hain (keep $Keep) - kuch delete nahi."
        exit 0
    }

    $sorted = @($releases | Sort-Object -Property { [datetime]$_.published_at } -Descending)
    $keepIds = @($sorted | Select-Object -First $Keep | ForEach-Object { $_.id })
    $toDelete = @($sorted | Where-Object { $keepIds -notcontains $_.id })

    Write-Host "  [..] Purane releases cleanup (latest $Keep rahenge, $($toDelete.Count) delete honge)..."

    $deleted = 0
    foreach ($r in $toDelete) {
        $removed = $false
        try {
            Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/$($r.id)" -Headers $headers -Method Delete | Out-Null
            $removed = $true
        } catch {
            Write-Host "  [!] Release $($r.tag_name) delete fail: $($_.Exception.Message)"
        }
        if ($removed) {
            $deleted++
            Write-Host "  [OK] Deleted release $($r.tag_name)"
            # Git tag bhi saaf karo (release delete karne se tag nahi hadta)
            try {
                Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/git/refs/tags/$($r.tag_name)" -Headers $headers -Method Delete | Out-Null
            } catch { }
        }
    }

    Write-Host "  [OK] Releases cleanup done: $deleted delete hue, latest $Keep GitHub par safe hain."
} catch {
    Write-Host "  [!] Releases cleanup skip: $($_.Exception.Message)"
}

exit 0

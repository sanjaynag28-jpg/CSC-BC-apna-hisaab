# Auto local backup (zip) for Cash Management BC
# Excludes node_modules, logs, backups to keep size small.
$src = "D:\Cash Managment BC"
$dest = "D:\Cash Managment BC\backups\auto"
if (!(Test-Path $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$zip = Join-Path $dest "project_$stamp.zip"
$exclude = @('node_modules','backups','logs','.git')
$items = Get-ChildItem -Path $src -Force | Where-Object { $exclude -notcontains $_.Name }
Compress-Archive -Path $items.FullName -DestinationPath $zip -Force
Write-Host "Backup created: $zip"

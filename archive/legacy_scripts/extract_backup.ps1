
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('backups/CMBC_Full_Backup_2026-11-14_12-44-14.zip')
foreach ($entry in $zip.Entries) {
    if ($entry.FullName -eq 'public/index.html') {
        Write-Host "Found entry: $($entry.FullName), Length: $($entry.Length)"
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, 'scripts/restored_index.html', $true)
        Write-Host "Extracted successfully!"
    }
}
$zip.Dispose()

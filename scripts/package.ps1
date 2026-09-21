$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
# Explicit allowlist: never recursively copy a developer's workspace.
$releaseFiles = @(
    'manifest.json', 'popup.html', 'options.html', 'README.md', 'PRIVACY.md',
    'docs/specification.md', 'docs/publishing.md',
    'src/background.js', 'src/core.js', 'src/sites.js', 'src/content.js',
    'src/content.css', 'src/ui.js', 'src/ui.css', 'src/popup.js', 'src/options.js'
)
foreach ($relative in $releaseFiles) {
    $item = Get-Item -LiteralPath (Join-Path $projectRoot $relative)
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Release files must not be links: $relative"
    }
}
$releaseDir = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
$releaseName = 'novel-filter-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.zip'
$releasePath = Join-Path $releaseDir $releaseName
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($releasePath, [System.IO.FileMode]::CreateNew)
try {
    $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($relative in $releaseFiles) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $projectRoot $relative), $relative) | Out-Null
        }
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
Write-Output $releasePath

param(
  [string]$HostName = "10.6.10.246",
  [string]$SshUser = "suporte",
  [string]$DatabaseName = "uniparchamados",
  [string]$UploadDir = "/var/lib/unipar-atendimentos/uploads",
  [string]$OutputRoot = "backups/unipar"
)

$ErrorActionPreference = "Stop"

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$localOutput = Join-Path $OutputRoot $timestamp
$remoteOutput = "/tmp/unipar-backup-$timestamp"
$remoteTarget = "${SshUser}@${HostName}"
$normalizedUploadDir = $UploadDir.TrimEnd("/")
$uploadParent = $normalizedUploadDir -replace "/[^/]+$", ""
$uploadLeaf = $normalizedUploadDir -replace "^.*/", ""

if ([string]::IsNullOrWhiteSpace($uploadParent)) {
  $uploadParent = "/"
}

New-Item -ItemType Directory -Path $localOutput -Force | Out-Null

$remoteScript = @"
set -euo pipefail
rm -rf '$remoteOutput'
mkdir -p '$remoteOutput'
sudo -u postgres pg_dump -Fc '$DatabaseName' > '$remoteOutput/database.dump'
if [ -d '$UploadDir' ]; then
  tar -czf '$remoteOutput/uploads.tar.gz' -C '$uploadParent' '$uploadLeaf'
else
  tar -czf '$remoteOutput/uploads.tar.gz' --files-from /dev/null
fi
cat > '$remoteOutput/metadata.txt' <<META
created_at=$timestamp
host=$HostName
database=$DatabaseName
upload_dir=$UploadDir
META
"@

ssh -t $remoteTarget $remoteScript

scp "${remoteTarget}:$remoteOutput/database.dump" (Join-Path $localOutput "database.dump")
scp "${remoteTarget}:$remoteOutput/uploads.tar.gz" (Join-Path $localOutput "uploads.tar.gz")
scp "${remoteTarget}:$remoteOutput/metadata.txt" (Join-Path $localOutput "metadata.txt")

ssh $remoteTarget "rm -rf '$remoteOutput'"

Write-Host "Backup salvo em: $localOutput"

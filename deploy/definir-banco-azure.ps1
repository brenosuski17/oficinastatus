# Grava a DATABASE_URL de produção como secret do Azure Container Apps, sem a senha passar por arquivo nem pelo histórico.
# Uso (PowerShell, com az login feito):  powershell -File deploy\definir-banco-azure.ps1
param(
  [string]$Grupo = 'rg-oficinastatus',
  [string]$App = 'oficinastatus',
  [string]$Servidor = 'oficinastatus-db-breno.postgres.database.azure.com',
  [string]$Usuario = 'oficina_admin',
  [string]$Banco = 'oficina',
  [string]$Az = 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd'
)
$ErrorActionPreference = 'Stop'

$segura = Read-Host "Senha do $Usuario no $Servidor" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
try {
  $senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if (-not $senha) { throw 'Senha vazia.' }
  # Caracteres como @ : / # na senha quebrariam a URL
  $url = "postgresql://${Usuario}:$([uri]::EscapeDataString($senha))@${Servidor}:5432/${Banco}?sslmode=require"

  & $Az containerapp secret set -g $Grupo -n $App --secrets "database-url=$url" -o none
  if ($LASTEXITCODE) { throw 'Falha ao gravar o secret database-url.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  $senha = $null; $url = $null
}

# Nova revisão: o contêiner reinicia lendo o secret (e roda as migrations antes de subir)
& $Az containerapp update -g $Grupo -n $App --set-env-vars 'DATABASE_URL=secretref:database-url' -o none
if ($LASTEXITCODE) { throw 'Falha ao ligar DATABASE_URL ao secret.' }
Write-Host "DATABASE_URL gravada como secret 'database-url' do app $App."

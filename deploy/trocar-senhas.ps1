# Troca as senhas das contas de produção pela API (HTTPS), sem acessar o banco.
# Para cada conta, o admin gera um link de convite e a nova senha é gravada por ele, como na tela "Criar senha".
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File deploy\trocar-senhas.ps1 [-Url https://oficinastatus.com.br]
param(
  [string]$Url = 'https://oficinastatus.graystone-3f5d3230.brazilsouth.azurecontainerapps.io',
  [string]$Admin = 'admin@oficina.com'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Url = $Url.TrimEnd('/')

function Texto([Security.SecureString]$s) {
  $p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($p) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }
}

function Api([string]$Metodo, [string]$Caminho, $Corpo, [string]$Token) {
  $req = @{ Method = $Metodo; Uri = "$Url$Caminho"; Headers = @{} }
  if ($Token) { $req.Headers.Authorization = "Bearer $Token" }
  if ($null -ne $Corpo) {
    # UTF-8 explícito: o PowerShell 5.1 mandaria acentos da senha em outra codificação
    $req.Body = [Text.Encoding]::UTF8.GetBytes(($Corpo | ConvertTo-Json -Compress))
    $req.ContentType = 'application/json; charset=utf-8'
  }
  # No PowerShell 5.1 a lista JSON chega como um objeto só; o ForEach-Object a desenrola
  Invoke-RestMethod @req | ForEach-Object { $_ }
}

$atual = Texto (Read-Host "Senha ATUAL de $Admin (Enter = oficina123, a do seed)" -AsSecureString)
if (-not $atual) { $atual = 'oficina123' }
$sessao = (Api POST '/api/auth/login' @{ email = $Admin; senha = $atual }).token
$atual = $null

# Contas com senha: equipe e clientes com acesso ao portal. O admin fica por último.
$contas = @()
foreach ($u in @(Api GET '/api/equipe' $null $sessao)) {
  if ($u.tem_senha -and $u.ativo) { $contas += [pscustomobject]@{ id = $u.id; email = $u.email } }
}
foreach ($c in @(Api GET '/api/clientes' $null $sessao)) {
  if ($c.tem_acesso -and $c.usuario_id) { $contas += [pscustomobject]@{ id = $c.usuario_id; email = $c.email } }
}
$contas = @($contas | Sort-Object { $_.email -eq $Admin }, email)
Write-Host "`nContas encontradas: $($contas.Count). Mínimo de 8 caracteres. Enter vazio repete a senha da conta anterior.`n"

$anterior = $null
foreach ($c in $contas) {
  while ($true) {
    $nova = Texto (Read-Host "Nova senha de $($c.email)" -AsSecureString)
    if (-not $nova -and $anterior) { $nova = $anterior; break }
    if ($nova.Length -lt 8) { Write-Host '  Precisa ter pelo menos 8 caracteres.'; continue }
    if ($nova -cne (Texto (Read-Host '  Repita' -AsSecureString))) { Write-Host '  As senhas não conferem.'; continue }
    break
  }
  $link = (Api POST "/api/equipe/$($c.id)/convite" @{} $sessao).link_convite
  $r = Api POST "/api/auth/convite/$($link.Split('/')[-1])" @{ senha = $nova }
  if ($r.usuario.email -ne $c.email) { throw "Resposta inesperada ao trocar a senha de $($c.email)." }
  Write-Host "  OK: $($c.email)"
  $anterior = $nova
}
$nova = $null; $anterior = $null

# Conferência: a senha do seed não entra mais no admin
try { Api POST '/api/auth/login' @{ email = $Admin; senha = 'oficina123' } | Out-Null; Write-Host "`nATENÇÃO: oficina123 ainda entra em $Admin." }
catch { Write-Host "`nSenhas trocadas. oficina123 não entra mais em $Admin." }

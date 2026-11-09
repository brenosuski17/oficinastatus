#!/usr/bin/env bash
# Prepara a VM Ubuntu do Azure para rodar o OficinaStatus com o docker-compose.prod.yml.
#
# Na VM, como o usuário normal (não root):
#   curl -fsSL https://raw.githubusercontent.com/brenosuski17/oficinastatus/main/deploy/instalar-vm.sh -o instalar-vm.sh
#   bash instalar-vm.sh
#
# O que faz: cria 2 GB de swap, instala o Docker com o plugin compose (repositório oficial), põe o usuário no
# grupo docker, clona o repositório e cria o server/.env a partir do server/.env.production.example, já com
# JWT_SECRET e TELEGRAM_WEBHOOK_SECRET aleatórios. Pode rodar de novo: o que já existe é mantido.
# Não sobe a aplicação: falta preencher o .env (domínio, banco e Telegram).
#
# Variáveis opcionais: REPO (URL do git), PASTA (destino, padrão ~/oficinastatus), RAMO (padrão main).
set -euo pipefail

REPO="${REPO:-https://github.com/brenosuski17/oficinastatus.git}"
PASTA="${PASTA:-$HOME/oficinastatus}"
RAMO="${RAMO:-main}"
USUARIO="$(id -un)"
COMPOSE="docker compose --env-file server/.env -f docker-compose.prod.yml"

passo() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
aviso() { printf '\033[1;33m  %s\033[0m\n' "$*"; }
erro() { printf '\033[1;31mErro: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || erro "rode como o usuário normal da VM (sem sudo). O script pede o sudo quando precisa."
# shellcheck source=/dev/null
[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = "ubuntu" ] || erro "este script é para Ubuntu (encontrado: ${PRETTY_NAME:-desconhecido})."
sudo -v || erro "o usuário precisa poder usar sudo."

passo "Swap de 2 GB (1 GB de RAM da B1s não basta para compilar o site)"
if swapon --show=NAME --noheadings | grep -q .; then
  aviso "já existe swap: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
else
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

passo "Pacotes básicos e atualizações de segurança automáticas"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl git openssl unattended-upgrades >/dev/null

passo "Docker Engine e plugin compose (repositório oficial do Docker)"
if docker compose version >/dev/null 2>&1 || sudo docker compose version >/dev/null 2>&1; then
  aviso "Docker já instalado: $(sudo docker --version)"
else
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || aviso "não deu para ativar o serviço docker pelo systemctl."
# Logs dos containers com limite de tamanho, para não encher o disco de 30 GB
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker >/dev/null 2>&1 || true
fi
if ! id -nG "$USUARIO" | grep -qw docker; then
  sudo usermod -aG docker "$USUARIO"
  PRECISA_RELOGAR=1
fi

passo "Código em $PASTA"
if [ -d "$PASTA/.git" ]; then
  git -C "$PASTA" pull --ff-only origin "$RAMO"
else
  git clone --branch "$RAMO" "$REPO" "$PASTA"
fi
cd "$PASTA"

passo "server/.env de produção"
segredo() { openssl rand -hex 32; }
if [ -f server/.env ]; then
  aviso "server/.env já existe: mantido sem mudanças."
else
  cp server/.env.production.example server/.env
  sed -i "s/^JWT_SECRET=$/JWT_SECRET=$(segredo)/" server/.env
  sed -i "s/^TELEGRAM_WEBHOOK_SECRET=$/TELEGRAM_WEBHOOK_SECRET=$(segredo)/" server/.env
  aviso "criado com JWT_SECRET e TELEGRAM_WEBHOOK_SECRET aleatórios."
fi
chmod 600 server/.env

IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<IP público da VM>')
cat <<FIM

Pronto. Próximos passos:

  1. Preencha DOMINIO, APP_URL, DATABASE_URL e TELEGRAM_TOKEN / TELEGRAM_BOT_USERNAME:
       nano $PASTA/server/.env
  2. Confira se o domínio já aponta para esta VM (IP $IP):
       getent hosts <seu-domínio>
  3. Suba a aplicação e o Caddy (a primeira compilação leva alguns minutos):
       cd $PASTA && $COMPOSE up -d --build
       $COMPOSE logs -f app      # espere "Migrations aplicadas"
  4. Registre o webhook do Telegram no domínio:
       $COMPOSE exec app node scripts/webhook.js --url https://<seu-domínio>
FIM
if [ "${PRECISA_RELOGAR:-0}" = 1 ]; then
  aviso "Seu usuário entrou no grupo docker agora: saia da VM e entre de novo antes do passo 3 (ou use sudo)."
fi

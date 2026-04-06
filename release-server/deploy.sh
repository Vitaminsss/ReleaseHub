#!/bin/bash
# ============================================
# Release Hub 一键部署脚本（无交互提问；依赖环境变量默认值）
# 使用方法：在仓库根目录执行 bash deploy.sh
#
# 安装目录 = 本脚本所在目录（与 server.js、releases/、.env 同级），不再使用 /opt
#
# Nginx：默认安装；关闭：USE_NGINX=0 或 SKIP_NGINX=1
#   USE_NGINX=0    不安装 Nginx
#   SKIP_NGINX=1   等同于 USE_NGINX=0（兼容旧用法）
#   NGINX_PREFIX   未设置时默认路径前缀 releasehub；显式 NGINX_PREFIX= 空字符串=整站根路径 /
#
# HTTPS（Let's Encrypt + Certbot，仅在已启用 Nginx 时可用）：
#   USE_HTTPS=0              不尝试自动申请证书（仅 HTTP；仍可用 DOMAIN 生成 http://域名 的 BASE_URL）
#   USE_HTTPS=1 或未设置     尝试自动 HTTPS：DNS 预检 → certbot --dry-run → 成功后再正式签发；失败则回退 HTTP
#   DOMAIN=releases.example.com      优先使用的域名（须解析到本机公网 IP）；未设置时尝试 hostname -f
#   CERTBOT_EMAIL=you@example.com    Certbot 注册邮箱（可选，缺省为 admin@域名）
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"
SERVICE_NAME="release-hub"
PORT=3721
NGINX_ENABLED=0
HTTPS_ENABLED=0
DOMAIN_RESOLVED=""

# 写入 /etc/nginx/sites-available/release-hub
# $1 = server_name（域名或 _ 表示默认占位）
write_nginx_release_hub_config() {
  local srv="${1:-_}"
  local NGINX_SITE="/etc/nginx/sites-available/release-hub"
  if [ -n "$NGINX_PREFIX_SLUG" ]; then
    sudo tee "$NGINX_SITE" > /dev/null <<NGX
# Release Hub — 由 deploy.sh 生成；访问 http://本机/${NGINX_PREFIX_SLUG}/
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${srv};

    client_max_body_size 500M;
    client_body_timeout 300s;

    location /${NGINX_PREFIX_SLUG}/ {
        proxy_pass http://127.0.0.1:${PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGX
  else
    sudo tee "$NGINX_SITE" > /dev/null <<NGX
# Release Hub — 由 deploy.sh 生成，请勿手动改端口除非同步修改 Node PORT
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${srv};

    client_max_body_size 500M;
    client_body_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGX
  fi
  if [ -L /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/release-hub
}

# DNS 预检：域名 A/AAAA 是否包含本机公网 IP。返回 0=可继续试签发；1=已知不匹配应跳过 certbot
dns_resolves_to_public_ip() {
  local dom="$1"
  local pub="$2"
  local line
  [ -z "$dom" ] || [ -z "$pub" ] && return 1
  [ "$pub" = "YOUR_SERVER_IP" ] && return 1
  if ! command -v dig &>/dev/null; then
    echo "⚠ 未找到 dig 命令，跳过 DNS 预检，将直接尝试 certbot dry-run"
    return 0
  fi
  while read -r line; do
    [ -n "$line" ] && [ "$line" = "$pub" ] && return 0
  done < <(dig +short "$dom" A 2>/dev/null)
  while read -r line; do
    [ -n "$line" ] && [ "$line" = "$pub" ] && return 0
  done < <(dig +short "$dom" AAAA 2>/dev/null)
  return 1
}

echo ""
echo "  ◈ Release Hub 部署脚本"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  安装目录: $INSTALL_DIR"
echo ""

# ── 检查 Node.js ──────────────────────────
if ! command -v node &> /dev/null; then
  echo "▸ 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "✓ Node.js $(node -v) 已安装"
fi

# ── 安装 PM2 ──────────────────────────────
if ! command -v pm2 &> /dev/null; then
  echo "▸ 安装 PM2（全局）..."
  sudo npm install -g pm2
else
  echo "✓ PM2 已安装"
fi

# ── 目录与文件（与 server 同级；同目录时不可 cp 自身，否则 set -e 会中断脚本）──
echo "▸ 准备目录 $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR/public"
mkdir -p "$INSTALL_DIR/releases"

if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  cp -f "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
  cp -f "$SCRIPT_DIR/package.json" "$INSTALL_DIR/"
  cp -f "$SCRIPT_DIR/public/index.html" "$INSTALL_DIR/public/"
else
  echo "✓ 已在项目目录内运行，跳过自复制（避免 cp 与自身为同一文件导致脚本中断）"
fi

# ── 公网 IP（用于 BASE_URL 与提示）──────────
PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || echo "YOUR_SERVER_IP")

# ── 是否启用 Nginx（默认启用）────────────────
USE_NGINX_RESOLVED=0
if [ "${SKIP_NGINX:-0}" = "1" ]; then
  echo "✓ 跳过 Nginx（SKIP_NGINX=1）"
elif [ "${USE_NGINX:-}" = "0" ]; then
  echo "✓ 跳过 Nginx（USE_NGINX=0）"
else
  USE_NGINX_RESOLVED=1
  echo "▸ 默认启用 Nginx（HTTP 80 → 本机 :${PORT}；USE_NGINX=0 或 SKIP_NGINX=1 可关闭）"
fi

# ── Nginx 路径前缀（未设置时默认 releasehub；显式 NGINX_PREFIX= 为空表示整站根）──
NGINX_PREFIX_SLUG=""
if [ "$USE_NGINX_RESOLVED" = "1" ]; then
  NGINX_PREFIX_RAW="${NGINX_PREFIX-releasehub}"
  NGINX_PREFIX_SLUG="$(echo "$NGINX_PREFIX_RAW" | sed 's/^\/\+//;s/\/\+$//')"
  NGINX_PREFIX_SLUG="$(echo "$NGINX_PREFIX_SLUG" | tr -cd 'a-zA-Z0-9_-')"
  if [ -n "$NGINX_PREFIX_SLUG" ]; then
    echo "▸ Nginx 路径前缀: /${NGINX_PREFIX_SLUG}/（NGINX_PREFIX= 置空可改为整站 /）"
  else
    echo "▸ Nginx 路径前缀: /（整站根）"
  fi
fi

# ── Nginx 反向代理 ─────────────────────────
if [ "$USE_NGINX_RESOLVED" = "1" ]; then
  echo "▸ 安装并配置 Nginx 反向代理..."
  if sudo apt-get update -qq && sudo apt-get install -y nginx; then
    write_nginx_release_hub_config "_"
    if sudo nginx -t; then
      sudo systemctl enable nginx
      sudo systemctl reload nginx
      NGINX_ENABLED=1
      if [ -n "$NGINX_PREFIX_SLUG" ]; then
        echo "✓ Nginx 已启用（http://<IP>/${NGINX_PREFIX_SLUG}/ → 127.0.0.1:${PORT}）"
      else
        echo "✓ Nginx 已启用（HTTP 80 → 127.0.0.1:${PORT}）"
      fi
    else
      echo "⚠ nginx -t 失败，请检查配置后手动执行: sudo nginx -t && sudo systemctl reload nginx"
    fi
  else
    echo "⚠ Nginx 安装失败，将仅通过端口 ${PORT} 访问"
  fi
fi

# ── HTTPS（Certbot：DNS 预检 → dry-run → 正式签发；失败回退 HTTP，保留域名供 BASE_URL）──
CERTBOT_EMAIL_VAL=""
if [ "$NGINX_ENABLED" = "1" ]; then
  if [ "${USE_HTTPS:-}" = "0" ]; then
    echo ""
    echo "▸ USE_HTTPS=0，跳过自动申请证书（仅 HTTP）"
    DOMAIN_RESOLVED="$(echo "${DOMAIN:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -n "$DOMAIN_RESOLVED" ]; then
      echo "  将使用 DOMAIN=$DOMAIN_RESOLVED 生成 BASE_URL（http）"
    fi
    else
    echo ""
    echo "▸ HTTPS：将自动尝试 Let's Encrypt（DNS 预检 → certbot --dry-run → 正式签发），失败则使用 HTTP。"
    echo "  需域名 DNS（A/AAAA）指向本机公网 IP（当前检测: $PUBLIC_IP），且公网可访问 80。"
    DOMAIN_RESOLVED="$(echo "${DOMAIN:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -z "$DOMAIN_RESOLVED" ]; then
      HFN="$(hostname -f 2>/dev/null || true)"
      if [ -n "$HFN" ] && [ "$HFN" != "localhost" ] && [[ "$HFN" == *.* ]]; then
        DOMAIN_RESOLVED="$HFN"
        echo "▸ 未设置 DOMAIN，使用 hostname -f: $DOMAIN_RESOLVED"
      fi
    else
      echo "▸ 使用 DOMAIN=$DOMAIN_RESOLVED"
    fi
    CERTBOT_EMAIL_VAL="$(echo "${CERTBOT_EMAIL:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    echo "▸ USE_HTTPS=${USE_HTTPS:-未设置} → 尝试自动 HTTPS（USE_HTTPS=0 可关闭）；邮箱：环境变量 CERTBOT_EMAIL 或 admin@域名"

    if [ -z "$DOMAIN_RESOLVED" ]; then
      echo "⚠ 未配置域名，跳过 HTTPS。可稍后执行: sudo certbot --nginx -d 你的域名"
    else
      if [ -z "$CERTBOT_EMAIL_VAL" ]; then
        CERTBOT_EMAIL_VAL="admin@${DOMAIN_RESOLVED}"
        echo "▸ 使用默认 Certbot 邮箱: $CERTBOT_EMAIL_VAL"
      fi

      if ! dns_resolves_to_public_ip "$DOMAIN_RESOLVED" "$PUBLIC_IP"; then
        echo "⚠ DNS 记录未指向本机公网 IP（$PUBLIC_IP），跳过 certbot。请修正 DNS 后重新运行本脚本或手动: sudo certbot --nginx -d $DOMAIN_RESOLVED"
      else
        echo "▸ DNS 预检通过（$DOMAIN_RESOLVED → $PUBLIC_IP）"
        echo "▸ 将 Nginx server_name 设为 $DOMAIN_RESOLVED 并试签发..."
        write_nginx_release_hub_config "$DOMAIN_RESOLVED"
        if ! sudo nginx -t; then
          echo "⚠ nginx -t 失败，恢复默认 server_name _"
          write_nginx_release_hub_config "_"
          sudo nginx -t && sudo systemctl reload nginx
        else
          sudo systemctl reload nginx
          echo "▸ 安装 certbot 与 nginx 插件..."
          if sudo apt-get install -y certbot python3-certbot-nginx; then
            echo "▸ certbot --dry-run（staging，不占正式额度）..."
            set +e
            sudo certbot certonly --nginx \
              --dry-run \
              --non-interactive \
              --agree-tos \
              --email "$CERTBOT_EMAIL_VAL" \
              -d "$DOMAIN_RESOLVED"
            DRY_EXIT=$?
            set -e
            if [ "$DRY_EXIT" -ne 0 ]; then
              echo "⚠ certbot dry-run 失败（退出码 $DRY_EXIT），不执行正式签发，恢复 HTTP（server_name _）"
              write_nginx_release_hub_config "_"
              sudo nginx -t && sudo systemctl reload nginx
              echo "  保留域名 $DOMAIN_RESOLVED 用于 BASE_URL（http）。修复 DNS/防火墙后可重新运行 deploy.sh 或: sudo certbot --nginx -d $DOMAIN_RESOLVED"
            else
              echo "▸ dry-run 成功，正式申请证书并配置 HTTPS..."
              set +e
              sudo certbot --nginx \
                --non-interactive \
                --agree-tos \
                --email "$CERTBOT_EMAIL_VAL" \
                -d "$DOMAIN_RESOLVED" \
                --redirect
              CERTBOT_EXIT=$?
              set -e
              if [ "$CERTBOT_EXIT" -eq 0 ]; then
                HTTPS_ENABLED=1
                echo "✓ HTTPS 已启用（Let's Encrypt）"
              else
                echo "⚠ certbot 正式申请失败（退出码 $CERTBOT_EXIT），恢复 HTTP（server_name _）"
                write_nginx_release_hub_config "_"
                sudo nginx -t && sudo systemctl reload nginx
                echo "  保留域名 $DOMAIN_RESOLVED 用于 BASE_URL（http）。可稍后: sudo certbot --nginx -d $DOMAIN_RESOLVED"
              fi
            fi
          else
            echo "⚠ certbot 安装失败，保持 HTTP（server_name _）"
            write_nginx_release_hub_config "_"
            sudo nginx -t && sudo systemctl reload nginx
          fi
        fi
      fi
    fi
  fi
fi

# ── 配置环境变量 ─────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "▸ 初始化配置..."

  JWT_SECRET=$(openssl rand -hex 32)
  DEFAULT_HASH=$(node -e "const bcrypt=require('bcryptjs');console.log(bcrypt.hashSync('admin123',10))" 2>/dev/null || echo "")

  if [ "$HTTPS_ENABLED" = "1" ] && [ -n "$DOMAIN_RESOLVED" ]; then
    if [ -n "$NGINX_PREFIX_SLUG" ]; then
      BASE_URL_VAL="https://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}"
    else
      BASE_URL_VAL="https://${DOMAIN_RESOLVED}"
    fi
  elif [ "$USE_NGINX_RESOLVED" = "1" ] && [ -n "$DOMAIN_RESOLVED" ]; then
    if [ -n "$NGINX_PREFIX_SLUG" ]; then
      BASE_URL_VAL="http://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}"
    else
      BASE_URL_VAL="http://${DOMAIN_RESOLVED}"
    fi
  elif [ "$USE_NGINX_RESOLVED" = "1" ]; then
    if [ -n "$NGINX_PREFIX_SLUG" ]; then
      BASE_URL_VAL="http://${PUBLIC_IP}/${NGINX_PREFIX_SLUG}"
    else
      BASE_URL_VAL="http://${PUBLIC_IP}"
    fi
  else
    BASE_URL_VAL="http://${PUBLIC_IP}:${PORT}"
  fi

  cat > "$ENV_FILE" <<EOF
JWT_SECRET=$JWT_SECRET
ADMIN_PASSWORD_HASH=$DEFAULT_HASH
RELEASES_DIR=$INSTALL_DIR/releases
BASE_URL=$BASE_URL_VAL
PORT=$PORT
EOF
  echo "✓ 配置文件已生成: $ENV_FILE（BASE_URL=$BASE_URL_VAL）"
else
  echo "✓ 配置文件已存在，跳过: $ENV_FILE"
  if [ "$NGINX_ENABLED" = "1" ]; then
    echo "  提示：已启用 Nginx。若下载链接仍不对，请在后台「设置」中修改 BASE_URL 或编辑 $ENV_FILE 后执行: pm2 restart $SERVICE_NAME"
  fi
  if [ "$HTTPS_ENABLED" = "1" ] && [ -n "$DOMAIN_RESOLVED" ]; then
    echo "  提示：本次已配置 HTTPS。请确认 BASE_URL 为 https://$DOMAIN_RESOLVED${NGINX_PREFIX_SLUG:+/$NGINX_PREFIX_SLUG}，必要时在后台「设置」中更新。"
  elif [ "$NGINX_ENABLED" = "1" ] && [ -n "$DOMAIN_RESOLVED" ] && [ "$HTTPS_ENABLED" != "1" ]; then
    echo "  提示：当前为 HTTP。若 BASE_URL 非 http://$DOMAIN_RESOLVED${NGINX_PREFIX_SLUG:+/$NGINX_PREFIX_SLUG}，请在「设置」中修改或编辑 $ENV_FILE 后: pm2 restart $SERVICE_NAME"
  fi
fi

# ── 安装依赖 ──────────────────────────────
echo "▸ 安装依赖..."
cd "$INSTALL_DIR"
npm install --production

# ── 启动服务 ──────────────────────────────
echo "▸ 启动服务..."

pm2 stop "$SERVICE_NAME" 2>/dev/null || true
pm2 delete "$SERVICE_NAME" 2>/dev/null || true

pm2 start "$INSTALL_DIR/server.js" \
  --name "$SERVICE_NAME" \
  --cwd "$INSTALL_DIR"

echo "▸ 写入 PM2 进程列表..."
pm2 save

echo "▸ 配置开机自启（PM2 + systemd）..."
# 尝试直接注册 systemd（常见 Linux；root 与带 systemd 的环境）
set +e
if command -v systemctl &>/dev/null && { [ -d /run/systemd/system ] || [ -d /usr/lib/systemd/system ]; }; then
  if [ "$(id -u)" -eq 0 ]; then
    env PATH="$PATH" pm2 startup systemd -u root --hp /root
  else
    env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"
  fi
  PM2_SU=$?
  if [ "$PM2_SU" -ne 0 ]; then
    echo "  （自动注册未成功，将打印 pm2 startup 提示，请按提示执行一次 sudo 命令）"
    pm2 startup
  fi
else
  pm2 startup
fi
set -e

echo "▸ 再次保存 PM2 列表（确保与自启一致）..."
pm2 save

# ── 配置防火墙 ────────────────────────────
if command -v ufw &> /dev/null; then
  if [ "$NGINX_ENABLED" = "1" ]; then
    echo "▸ 开放 HTTP 80 与应用端口 $PORT..."
    sudo ufw allow 80/tcp
    sudo ufw allow "$PORT/tcp"
    if [ "$HTTPS_ENABLED" = "1" ]; then
      echo "▸ 开放 HTTPS 443..."
      sudo ufw allow 443/tcp
    fi
  else
    echo "▸ 开放端口 $PORT..."
    sudo ufw allow "$PORT/tcp"
  fi
fi

# ── 完成 ──────────────────────────────────
SERVER_IP="$PUBLIC_IP"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  数据目录: $INSTALL_DIR/releases/"
echo "  配置文件: $INSTALL_DIR/.env"
echo ""
if [ "$HTTPS_ENABLED" = "1" ] && [ -n "$DOMAIN_RESOLVED" ]; then
  if [ -n "$NGINX_PREFIX_SLUG" ]; then
    echo "  管理后台（HTTPS）: https://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}/"
    echo "  Tauri updater（公开）: https://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}/releases/<appName>/latest.json"
  else
    echo "  管理后台（HTTPS）: https://${DOMAIN_RESOLVED}/"
    echo "  Tauri updater（公开）: https://${DOMAIN_RESOLVED}/releases/<appName>/latest.json"
  fi
  echo "  直连 Node（排障用）: http://$SERVER_IP:$PORT"
elif [ "$NGINX_ENABLED" = "1" ]; then
  if [ -n "$DOMAIN_RESOLVED" ]; then
    if [ -n "$NGINX_PREFIX_SLUG" ]; then
      echo "  管理后台（经 Nginx HTTP）: http://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}/"
      echo "  Tauri updater（公开）: http://${DOMAIN_RESOLVED}/${NGINX_PREFIX_SLUG}/releases/<appName>/latest.json"
    else
      echo "  管理后台（经 Nginx HTTP）: http://${DOMAIN_RESOLVED}/"
      echo "  Tauri updater（公开）: http://${DOMAIN_RESOLVED}/releases/<appName>/latest.json"
    fi
    echo "  直连 Node（排障用）: http://$SERVER_IP:$PORT"
    echo "  启用 HTTPS：修正 DNS/防火墙后重新运行 deploy.sh，或: sudo certbot --nginx -d $DOMAIN_RESOLVED"
    echo "            成功后请在后台将 BASE_URL 改为 https://$DOMAIN_RESOLVED${NGINX_PREFIX_SLUG:+/$NGINX_PREFIX_SLUG}"
  else
    if [ -n "$NGINX_PREFIX_SLUG" ]; then
      echo "  管理后台（经 Nginx HTTP）: http://$SERVER_IP/${NGINX_PREFIX_SLUG}/"
    else
      echo "  管理后台（经 Nginx HTTP）: http://$SERVER_IP/"
    fi
    echo "  直连 Node（排障用）: http://$SERVER_IP:$PORT"
    echo "  启用 HTTPS：设置 DOMAIN 后重新运行 deploy.sh，或: sudo certbot --nginx -d 你的域名"
  fi
else
  echo "  管理后台：http://$SERVER_IP:$PORT"
fi
echo "  默认密码：admin123（请登录后立即修改）"
echo ""
echo "  查看日志：pm2 logs $SERVICE_NAME"
echo "  重启服务：pm2 restart $SERVICE_NAME"
echo "  停止服务：pm2 stop $SERVICE_NAME"
echo "  再次启动：pm2 start $SERVICE_NAME"
echo "  运行状态：pm2 status"
echo "  彻底移除：pm2 delete $SERVICE_NAME"
echo "  开机自启：若重启后进程未起来，执行: pm2 resurrect 或再次 bash deploy.sh"
echo "          或手动: pm2 startup 按输出执行 sudo 一行后，再 pm2 save"
echo ""

#!/bin/bash
# ============================================
# Release Hub 一键部署脚本
# 使用方法：在仓库根目录执行 bash deploy.sh
#
# 安装目录 = 本脚本所在目录（与 server.js、releases/、.env 同级），不再使用 /opt
#
# Nginx：交互终端会询问是否启用；非交互请设置 USE_NGINX=0 或 USE_NGINX=1
#   USE_NGINX=1    安装并配置 Nginx（HTTP 80 → 本机 :3721）
#   USE_NGINX=0    不安装 Nginx
#   SKIP_NGINX=1   等同于 USE_NGINX=0（兼容旧用法）
#   NGINX_PREFIX   非交互时：HTTP 路径前缀（如 release-hub），留空=整站根路径 /
#
# HTTPS（Let's Encrypt + Certbot，仅在已启用 Nginx 时可用）：
#   USE_HTTPS=1              非交互：启用 HTTPS
#   USE_HTTPS=0 或未设置     非交互：不启用 HTTPS
#   DOMAIN=releases.example.com        域名（必须解析到本机）
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

# ── 是否启用 Nginx ────────────────────────
USE_NGINX_RESOLVED=0
if [ "${SKIP_NGINX:-0}" = "1" ]; then
  echo "✓ 跳过 Nginx（SKIP_NGINX=1）"
elif [ -t 0 ]; then
  echo ""
  read -r -p "是否安装并启用 Nginx，将 HTTP 80 反代到本机 :${PORT}？[Y/n] " NGINX_REPLY
  case "${NGINX_REPLY:-Y}" in
    [yY][eE][sS]|[yY]|'') USE_NGINX_RESOLVED=1 ;;
    *) USE_NGINX_RESOLVED=0 ;;
  esac
else
  if [ "${USE_NGINX:-}" = "1" ]; then
    USE_NGINX_RESOLVED=1
  else
    USE_NGINX_RESOLVED=0
  fi
  echo "▸ 非交互模式：USE_NGINX=${USE_NGINX:-未设置} → $([ "$USE_NGINX_RESOLVED" = "1" ] && echo 启用 Nginx || echo 不安装 Nginx)"
fi

# ── Nginx 路径前缀（与子路径反代一致；留空=整站根路径）────────
NGINX_PREFIX_SLUG=""
if [ "$USE_NGINX_RESOLVED" = "1" ]; then
  if [ -t 0 ]; then
    echo ""
    read -r -p "HTTP 路径前缀（仅字母数字下划线连字符，留空=整站 / ；示例 release-hub）: " NGINX_PREFIX_INPUT
    NGINX_PREFIX_RAW="${NGINX_PREFIX_INPUT:-}"
  else
    NGINX_PREFIX_RAW="${NGINX_PREFIX:-}"
  fi
  NGINX_PREFIX_SLUG="$(echo "$NGINX_PREFIX_RAW" | sed 's/^\/\+//;s/\/\+$//')"
  NGINX_PREFIX_SLUG="$(echo "$NGINX_PREFIX_SLUG" | tr -cd 'a-zA-Z0-9_-')"
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

# ── HTTPS（Certbot，需域名已解析到本机）────────────────
USE_HTTPS_RESOLVED=0
CERTBOT_EMAIL_VAL=""
if [ "$NGINX_ENABLED" = "1" ]; then
  if [ -t 0 ]; then
    echo ""
    echo "▸ HTTPS：需域名 DNS（A/AAAA）已指向本机，且公网可访问 80（验证）与 443（HTTPS）。"
    read -r -p "是否使用 Let's Encrypt（certbot）自动配置 HTTPS？[Y/n] " HTTPS_REPLY
    case "${HTTPS_REPLY:-Y}" in
      [yY][eE][sS]|[yY]|'') USE_HTTPS_RESOLVED=1 ;;
      *) USE_HTTPS_RESOLVED=0 ;;
    esac
  else
    if [ "${USE_HTTPS:-}" = "1" ]; then
      USE_HTTPS_RESOLVED=1
    else
      USE_HTTPS_RESOLVED=0
    fi
    echo "▸ 非交互模式：USE_HTTPS=${USE_HTTPS:-未设置} → $([ "$USE_HTTPS_RESOLVED" = "1" ] && echo 启用 Certbot || echo 跳过 HTTPS)"
  fi

  if [ "$USE_HTTPS_RESOLVED" = "1" ]; then
    if [ -t 0 ]; then
      echo ""
      read -r -p "域名（例如 releases.example.com，须已解析到本机）: " DOMAIN_INPUT
      DOMAIN_RESOLVED="$(echo "${DOMAIN_INPUT:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      read -r -p "Certbot 注册邮箱（Let's Encrypt 通知用）: " EMAIL_INPUT
      CERTBOT_EMAIL_VAL="$(echo "${EMAIL_INPUT:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    else
      DOMAIN_RESOLVED="$(echo "${DOMAIN:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      CERTBOT_EMAIL_VAL="$(echo "${CERTBOT_EMAIL:-}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    fi

    if [ -z "$DOMAIN_RESOLVED" ]; then
      echo "⚠ 未填写域名，跳过 HTTPS。可稍后执行: sudo certbot --nginx -d 你的域名"
      USE_HTTPS_RESOLVED=0
    else
      if [ -z "$CERTBOT_EMAIL_VAL" ]; then
        CERTBOT_EMAIL_VAL="admin@${DOMAIN_RESOLVED}"
        echo "▸ 使用默认 Certbot 邮箱: $CERTBOT_EMAIL_VAL"
      fi

      echo "▸ 将 Nginx server_name 设为 $DOMAIN_RESOLVED 并申请证书..."
      write_nginx_release_hub_config "$DOMAIN_RESOLVED"
      if ! sudo nginx -t; then
        echo "⚠ nginx -t 失败，恢复默认 server_name _"
        write_nginx_release_hub_config "_"
        sudo nginx -t && sudo systemctl reload nginx
        USE_HTTPS_RESOLVED=0
      else
        sudo systemctl reload nginx
        echo "▸ 安装 certbot 与 nginx 插件..."
        if sudo apt-get install -y certbot python3-certbot-nginx; then
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
            echo "⚠ certbot 失败（退出码 $CERTBOT_EXIT）。请检查 DNS、防火墙 80/443，或稍后手动:"
            echo "    sudo certbot --nginx -d $DOMAIN_RESOLVED"
            echo "▸ 恢复为 HTTP（server_name _）..."
            write_nginx_release_hub_config "_"
            sudo nginx -t && sudo systemctl reload nginx
            DOMAIN_RESOLVED=""
            USE_HTTPS_RESOLVED=0
          fi
        else
          echo "⚠ certbot 安装失败，保持 HTTP"
          write_nginx_release_hub_config "_"
          sudo nginx -t && sudo systemctl reload nginx
          DOMAIN_RESOLVED=""
          USE_HTTPS_RESOLVED=0
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
  if [ -n "$NGINX_PREFIX_SLUG" ]; then
    echo "  管理后台（经 Nginx HTTP）: http://$SERVER_IP/${NGINX_PREFIX_SLUG}/"
  else
    echo "  管理后台（经 Nginx HTTP）: http://$SERVER_IP/"
  fi
  echo "  直连 Node（排障用）: http://$SERVER_IP:$PORT"
  echo "  启用 HTTPS：重新运行本脚本并选择 Certbot，或: sudo certbot --nginx -d 你的域名"
  echo "            然后在后台将 BASE_URL 改为 https://你的域名"
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

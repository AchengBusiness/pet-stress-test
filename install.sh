#!/bin/bash
# Pet Stress Test — One-click installer for Claude Code / OpenClaw
# Usage: curl -sSL https://raw.githubusercontent.com/AchengBusiness/pet-stress-test/main/install.sh | bash

set -e

REPO="https://github.com/AchengBusiness/pet-stress-test.git"
INSTALL_DIR="${HOME}/.pet-stress-test"
SKILL_DIR="${HOME}/.claude/skills/pet-stress-monitor"
CONFIG="${HOME}/.claude/config.toml"

echo "🐱 Pet Stress Test — 一键安装"
echo "================================"

# 1. Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
  echo "📦 更新已有安装..."
  cd "$INSTALL_DIR" && git pull --quiet
else
  echo "📦 下载 pet-stress-test..."
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# 2. Register MCP server
echo "🔧 注册 MCP Server..."
mkdir -p "$(dirname "$CONFIG")"
if [ -f "$CONFIG" ] && grep -q "mcp_servers.pet-stress" "$CONFIG" 2>/dev/null; then
  echo "   MCP Server 已注册，跳过"
else
  cat >> "$CONFIG" << EOF

[mcp_servers.pet-stress]
type = "stdio"
command = "python3"
args = ["${INSTALL_DIR}/mcp_server.py"]
EOF
  echo "   已添加到 $CONFIG"
fi

# 3. Install Skill
echo "📝 安装 Skill..."
mkdir -p "$SKILL_DIR"
cp "$INSTALL_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "   已安装到 $SKILL_DIR"

# 4. Verify
echo ""
echo "✅ 安装完成！"
echo ""
echo "📍 安装位置: $INSTALL_DIR"
echo "📍 MCP配置: $CONFIG"
echo "📍 Skill: $SKILL_DIR/SKILL.md"
echo ""
echo "🎮 使用方式:"
echo "   1. 重启 Claude Code / OpenClaw"
echo "   2. 正常对话即可 — 压力自动监控"
echo "   3. 输入 /stress 查看压力报告"
echo "   4. 输入 /stress reset 重置"
echo ""
echo "🌐 Web版: cd $INSTALL_DIR/web && npm install && npm run dev"
echo ""
echo "🐱 你的AI猫咪已就位！"

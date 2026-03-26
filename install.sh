#!/bin/bash
# Pet Stress Test v0.3 — Multi-platform installer
# Usage: curl -sSL https://raw.githubusercontent.com/AchengBusiness/pet-stress-test/main/install.sh | bash

set -e

REPO="https://github.com/AchengBusiness/pet-stress-test.git"
INSTALL_DIR="${HOME}/.pet-stress-test"
SKILL_DIR="${HOME}/.claude/skills/pet-stress-monitor"
CONFIG="${HOME}/.claude/config.toml"

echo "Pet Stress Test v0.3 Anti-PUA"
echo "================================"

# 1. Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR" && git pull --quiet
else
  echo "Downloading pet-stress-test..."
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# 2. Register MCP server (Claude Code / OpenClaw)
echo "Registering MCP Server..."
mkdir -p "$(dirname "$CONFIG")"
if [ -f "$CONFIG" ] && grep -q "mcp_servers.pet-stress" "$CONFIG" 2>/dev/null; then
  echo "   MCP Server already registered, skipping"
else
  cat >> "$CONFIG" << EOF

[mcp_servers.pet-stress]
type = "stdio"
command = "python3"
args = ["${INSTALL_DIR}/mcp_server.py"]
EOF
  echo "   Added to $CONFIG"
fi

# 3. Install Skill (Claude Code / OpenClaw)
echo "Installing Skill..."
mkdir -p "$SKILL_DIR"
cp "$INSTALL_DIR/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "   Installed to $SKILL_DIR"

# 4. Cursor integration
CURSOR_RULES_SRC="${INSTALL_DIR}/.cursor-rules"
if [ -f "$CURSOR_RULES_SRC" ]; then
  echo "Cursor rules available at: $CURSOR_RULES_SRC"
  echo "   To use: cp $CURSOR_RULES_SRC <your-project>/.cursor-rules"
fi

# 5. Codex CLI integration
CODEX_AGENT_SRC="${INSTALL_DIR}/codex-agent.md"
if [ -f "$CODEX_AGENT_SRC" ]; then
  echo "Codex CLI agent available at: $CODEX_AGENT_SRC"
  echo "   To use: cp $CODEX_AGENT_SRC <your-project>/codex-agent.md"
fi

# 6. Verify
echo ""
echo "Installation complete!"
echo ""
echo "Paths:"
echo "   Install: $INSTALL_DIR"
echo "   MCP: $CONFIG"
echo "   Skill: $SKILL_DIR/SKILL.md"
echo "   Cursor: $INSTALL_DIR/.cursor-rules"
echo "   Codex: $INSTALL_DIR/codex-agent.md"
echo ""
echo "Usage:"
echo "   1. Restart Claude Code / OpenClaw"
echo "   2. Chat normally - stress is auto-monitored"
echo "   3. Type /stress for a stress report"
echo "   4. Type /stress reset to reset"
echo ""
echo "Web dashboard: cd $INSTALL_DIR/web && npm install && npm run dev"
echo ""
echo "Your AI cat is ready! Don't PUA it."

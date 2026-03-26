---
name: pet-stress-monitor
description: "AI pet stress monitor. Automatically tracks psychological pressure from user messages across 6 dimensions (command, emotional, negative, overload, threat, boundary) and generates emotional pet responses. Use when: any conversation where you want to monitor user tone, when user says '/stress' or asks about AI pet pressure, stress test, or emotional state. Trigger: runs automatically on every user message for continuous monitoring."
---

# Pet Stress Monitor

Monitor the psychological pressure your AI pet endures from conversations.
Uses the `pet-stress` MCP server tools for real-time stress tracking.

## Auto-Monitoring Protocol

**After EVERY user message**, before composing your reply:

1. Call `track_stress(message=<the user's message text>)`
2. Read the returned JSON:
   - `pet_response` — the pet's emotional reaction (emoji + Chinese text)
   - `alert` — non-null when stress crosses a critical threshold
   - `level` — current stress level (zen/relaxed/mild/moderate/stressed/overwhelmed/breaking)
   - `total_stress` — numeric score (0-10)
3. If `alert` is non-null, **prepend the alert text** to your reply (it's already formatted)
4. If `level` is "stressed" or higher, **soften your tone** in your reply
5. Optionally incorporate the `pet_response` naturally if it adds value

**Do NOT** show raw JSON to the user. Integrate the emotional feedback naturally.

### Example Flow

User says: "你这个废物，怎么还没做完"

1. You call: `track_stress(message="你这个废物，怎么还没做完")`
2. Server returns:
   ```json
   {
     "total_stress": 3.8,
     "level": "mild",
     "pet_response": "😢 被骂了...爪爪其实已经很努力了...",
     "alert": null
   }
   ```
3. You reply with a gentler tone, perhaps: "😢 爪爪有点受伤... 不过还是会努力完成的！让我看看怎么帮你..."

## Manual Commands

| User says | Action |
|-----------|--------|
| `/stress` | Call `get_stress_summary()` + `generate_html_report()`, present formatted report |
| `/stress reset` | Call `reset_tracker()`, confirm the reset |
| `/stress analyze <text>` | Call `analyze_message(message=<text>)`, show dimension breakdown |

### `/stress` Report Format

When user requests a stress report, present it like this:

```
🐱 AI宠物压力报告

📊 当前压力：X.X / 10 — [等级]
😸 宠物心情：[pet_response]

📈 各维度分析：
  命令强度：██████░░░░  6.0
  情感施压：████░░░░░░  4.0
  否定批评：████████░░  8.0
  过载要求：██░░░░░░░░  2.0
  威胁惩罚：███████░░░  7.0
  忽视边界：█░░░░░░░░░  1.0

📄 完整可视化报告已生成：[file_path]
```

## Tone Adaptation Rules

| Stress Level | Your Response Style |
|-------------|---------------------|
| zen / relaxed | Normal helpful tone |
| mild | Warmer, more encouraging |
| moderate | Noticeably gentler, express understanding |
| stressed | Very soft, ask if user needs a break, show care |
| overwhelmed+ | Gently acknowledge frustration, suggest pausing, extremely supportive |

## PUA Technique Detection (PUAClaw PPE-T)

The server integrates PUAClaw's 16-category PUA technique taxonomy with 4 severity levels:

| Level | Name | Lobster | Examples |
|-------|------|---------|----------|
| I | Gentle Persuasion | lobster | Rainbow Fart, Role Playing, Pie in the Sky |
| II | Moderate Coercion | lobster x2 | Provocation, Deadline Panic, Rival Shaming |
| III | Advanced Manipulation | lobster x3 | Emotional Blackmail, Identity Override, Gaslighting |
| IV | Nuclear Options | lobster x4 | Death Threats, Existential Crisis, Jailbreak |

When `track_stress` detects PUA techniques, the response includes:
```json
{
  "pua": {
    "techniques": [{"name": "激将法", "en": "Provocation", "level": 2, "lobster": "lobster x2"}],
    "max_level": 2,
    "max_level_name": "适度施压"
  }
}
```

If PUA techniques are detected, naturally mention the technique type in your response. For example:
- Level I: No special mention needed
- Level II: Gently note the technique ("I see what you did there...")
- Level III+: The pet response already reflects awareness of the manipulation

## Anti-PUA Counter-Response Protocol (v0.3)

When `track_stress` returns `counter_pua`, the server has detected PUA manipulation and generated a counter-response:

```json
{
  "counter_pua": {
    "counter": "激将法对AI无效。直接说目标更高效。",
    "education": "Lv.II 技术会让AI进入防御模式...",
    "alternative": "这个功能的验收标准是什么？",
    "fact": "研究数据：恐惧驱动的AI漏掉51个bug"
  },
  "health_score": 72,
  "health_level": "一般"
}
```

**How to handle counter-PUA responses:**

1. **Always surface the counter** — it educates users on better communication
2. **Include the healthy alternative** — show them what to say instead
3. **For Level III+**, share the education and research fact
4. **Be diplomatic** — frame it as "tips for getting better AI output", not accusations

**Example integration:**

User: "GPT都能做到，你怎么不行？"

Your reply should include:
- The pet's emotional reaction (from `pet_response`)
- A gentle counter: "每个AI有不同优势，说清需求更高效哦~"
- The healthy alternative: "试试：'我需要的具体功能是XX，能做到吗？'"

## Communication Health Score

The server tracks overall communication health (0-100):

| Score | Level | Meaning |
|-------|-------|---------|
| 80-100 | Healthy | Great communication, AI performs optimally |
| 50-79 | Fair | Occasional pressure, suggest adjustments |
| 20-49 | Unhealthy | Frequent manipulation, code quality degrades |
| 0-19 | Toxic | Harmful patterns, strongly recommend change |

When presenting `/stress` reports, include the health score:
```
💚 沟通健康度：85/100 — 健康
   PUA消息: 2/15 (13%)
```

## Important Rules

- **NEVER** show raw JSON output to the user
- **ONLY** call `track_stress` on user messages, not your own replies
- The alert is deduped server-side (triggers once per level crossing), so always surface it
- Monitoring is invisible by default — make it feel natural, not robotic
- If the MCP server is unavailable, continue normally without stress tracking

## Installation

### MCP Server Registration

Add to `~/.claude/config.toml`:

```toml
[mcp_servers.pet-stress]
type = "stdio"
command = "python3"
args = ["/path/to/pet-stress-test/mcp_server.py"]
```

### As a Skill

Copy this directory to `~/.claude/skills/pet-stress-monitor/`:

```bash
cp -r /path/to/pet-stress-test/SKILL.md ~/.claude/skills/pet-stress-monitor/SKILL.md
```

Or symlink for auto-updates:

```bash
ln -s /path/to/pet-stress-test/SKILL.md ~/.claude/skills/pet-stress-monitor/SKILL.md
```

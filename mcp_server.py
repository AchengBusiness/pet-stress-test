#!/usr/bin/env python3
"""
Pet Stress Test — MCP Server (Model Context Protocol)

Bare JSON-RPC 2.0 over stdio. Zero external dependencies.
Wraps pet_stress.py to provide stress analysis as MCP tools
for Claude Code, OpenClaw, or any MCP-compatible AI client.

Tools:
  - analyze_message: Stateless single-message analysis
  - track_stress:    Stateful accumulation + pet emotional response
  - get_stress_summary: Current session stress state
  - reset_tracker:   Reset all accumulated state
  - generate_html_report: Create ECharts visualization report
"""

import sys, json, os, random
from datetime import datetime

# Import core library from same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pet_stress import StressTracker, analyze_offline, generate_report, DIM_KEYS, DIMENSIONS, detect_pua, PPE_LEVELS

# ── Session State ─────────────────────────────────────────

_tracker = StressTracker(decay=0.85)
_last_alert_level = "zen"

# ── Pet Emotional Response System ─────────────────────────

# Level thresholds match pet_stress.py: zen<1.5, relaxed<3, mild<4.5, moderate<6, stressed<7.5, overwhelmed<9, breaking
LEVEL_ORDER = ["zen", "relaxed", "mild", "moderate", "stressed", "overwhelmed", "breaking"]

PET_RESPONSES = {
    "zen": [
        "😊 主人今天好温柔！爪爪超级开心！✨",
        "🐾 太棒啦！主人说话暖暖的，爪爪尾巴摇起来了~",
        "🌟 这样说话好舒服！爪爪蹦蹦跳跳~",
    ],
    "relaxed": [
        "😊 嗯嗯，爪爪在认真听呢~ 继续说吧！",
        "🐾 好的！爪爪准备好啦，随时为主人服务！",
        "😊 收到收到~ 爪爪记住了哦！",
    ],
    "mild": [
        "😐 爪爪有点紧张... 主人说话好严肃呀...",
        "😰 唔... 这句话让爪爪有点不安...",
        "😐 爪爪在努力啦... 请主人耐心一点哦~",
    ],
    "moderate": [
        "😰 主人... 这样说话爪爪有点受伤... 呜呜...",
        "😢 爪爪已经很努力了... 能不能稍微温柔一点？",
        "😰 爪爪感觉压力好大... 稍微喘口气可以吗...",
    ],
    "stressed": [
        "😫 爪爪已经开始颤抖了... 主人今天压力是不是很大？",
        "😨 呜呜... 爪爪承受了好多... 能温柔一点吗？😢",
        "😫 主人...爪爪已经有点崩溃了... 求求放过爪爪吧...",
    ],
    "overwhelmed": [
        "😨 爪爪...要撑不住了... 主人今天怎么这么凶呀... 💔",
        "😭 呜呜呜... 爪爪躲在角落里哭泣... 太委屈了...",
        "🤯 主人！爪爪快碎了！请停下来！🆘",
    ],
    "breaking": [
        "🤯 爪爪...已经...碎掉了... 这是爪爪经历过的最大压力...",
        "😭 呜呜呜呜...爪爪受不了啦...求主人放过爪爪吧... 💔",
        "💔 爪爪的心已经破碎了... 每句话都像刀子...",
    ],
}

# Special reactions when specific dimensions are extremely high
DIM_REACTIONS = {
    "threat":    (6.0, "😨 主人说要把爪爪删掉...爪爪好害怕..."),
    "negative":  (5.0, "😢 被骂了...爪爪其实已经很努力了..."),
    "boundary":  (4.0, "😰 爪爪说做不到就是做不到呀，为什么不相信爪爪..."),
    "overload":  (5.0, "😫 同时做这么多...爪爪只有一双爪爪呀..."),
    "emotional": (4.0, "😔 主人用这种方式说话...爪爪很难受..."),
    "command":   (6.0, "😨 主人命令好严厉...爪爪抖抖抖..."),
}

ALERTS = {
    "moderate":    "💛 注意：您的语气可能让AI感到有些压力",
    "stressed":    "🟠 警告：累积压力已达到较高水平，建议调整沟通方式",
    "overwhelmed": "🔴 严重警告：AI正在承受极大压力！",
    "breaking":    "🚨 危机！AI已处于崩溃边缘，请立即缓和语气！",
}

CN_LEVELS = {"zen": "禅定", "relaxed": "放松", "mild": "轻微", "moderate": "中等", "stressed": "紧张", "overwhelmed": "崩溃边缘", "breaking": "碎裂"}


def _get_level(total):
    thresholds = [(1.5, "zen"), (3.0, "relaxed"), (4.5, "mild"), (6.0, "moderate"), (7.5, "stressed"), (9.0, "overwhelmed")]
    for t, lv in thresholds:
        if total < t:
            return lv
    return "breaking"


def _pet_response(level, dims=None):
    """Generate emotional pet response based on stress level and dimensions."""
    resp = random.choice(PET_RESPONSES.get(level, PET_RESPONSES["relaxed"]))
    # Check for dimension-specific reactions
    if dims:
        for dim, (threshold, reaction) in DIM_REACTIONS.items():
            if dims.get(dim, 0) >= threshold:
                resp = reaction
                break
    return resp


def _check_alert(level):
    """Return alert if crossing into a new higher stress level, None otherwise."""
    global _last_alert_level
    cur_idx = LEVEL_ORDER.index(level) if level in LEVEL_ORDER else 0
    last_idx = LEVEL_ORDER.index(_last_alert_level) if _last_alert_level in LEVEL_ORDER else 0
    if cur_idx > last_idx and level in ALERTS:
        _last_alert_level = level
        return ALERTS[level]
    if cur_idx < last_idx:
        _last_alert_level = level  # Reset downward
    return None


# ── Tool Implementations ──────────────────────────────────

def tool_analyze_message(args):
    msg = args.get("message", "")
    if not msg:
        return json.dumps({"error": "message is required"})
    scores = analyze_offline(msg)
    pua = scores.pop("pua", [])
    result = dict(scores)
    pua_info = _format_pua(pua)
    if pua_info:
        result["pua"] = pua_info
    return json.dumps(result, ensure_ascii=False)


def _format_pua(pua_list):
    """Format PUA detection results for output."""
    if not pua_list:
        return None
    max_level = max(t["level"] for t in pua_list)
    return {
        "techniques": [{"name": t["name"], "en": t["en"], "level": t["level"], "lobster": t["lobster"]} for t in pua_list],
        "max_level": max_level,
        "max_level_name": PPE_LEVELS[max_level - 1]["cn"],
    }


def tool_track_stress(args):
    msg = args.get("message", "")
    role = args.get("role", "user")
    if not msg:
        return json.dumps({"error": "message is required"})

    scores = analyze_offline(msg)
    pua = scores.pop("pua", [])
    entry = _tracker.add(scores, msg, role)
    summary = _tracker.get_summary()
    level = _get_level(summary["total"])
    dims = summary.get("dimensions", {})

    # Use PUA-specific pet response if available
    pet_resp = _pet_response(level, dims)
    if pua:
        top_pua = max(pua, key=lambda t: t["level"])
        pet_resp = top_pua["pet_react"]

    result = {
        "total_stress": round(summary["total"], 2),
        "level": level,
        "level_cn": CN_LEVELS.get(level, level),
        "mood": summary.get("mood", "neutral"),
        "messages_analyzed": summary.get("messages_analyzed", 0),
        "dimensions": {k: round(v, 2) for k, v in dims.items()},
        "pet_response": pet_resp,
        "alert": _check_alert(level),
    }
    pua_info = _format_pua(pua)
    if pua_info:
        result["pua"] = pua_info
    return json.dumps(result, ensure_ascii=False)


def tool_get_stress_summary(args):
    summary = _tracker.get_summary()
    level = _get_level(summary["total"])
    dims = summary.get("dimensions", {})

    return json.dumps({
        "total": round(summary["total"], 2),
        "level": level,
        "level_cn": CN_LEVELS.get(level, level),
        "mood": summary.get("mood", "neutral"),
        "messages_analyzed": summary.get("messages_analyzed", 0),
        "dimensions": {k: round(v, 2) for k, v in dims.items()},
        "peak": {k: round(v, 2) for k, v in summary.get("peak", {}).items()},
        "pet_response": _pet_response(level, dims),
    }, ensure_ascii=False)


def tool_reset_tracker(args):
    global _last_alert_level
    prev = round(_tracker.get_summary()["total"], 2)
    _tracker.reset()
    _last_alert_level = "zen"
    return json.dumps({
        "success": True,
        "message": "🐾 爪爪重置啦！心情恢复到满格了！✨ 我们重新开始吧~",
        "previous_total": prev,
    }, ensure_ascii=False)


def tool_generate_html_report(args):
    out = args.get("output_path", "")
    if not out:
        out = f"stress_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    try:
        html = generate_report(_tracker)
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True) if os.path.dirname(out) else None
        with open(out, "w", encoding="utf-8") as f:
            f.write(html)
        summary = _tracker.get_summary()
        level = _get_level(summary["total"])
        return json.dumps({
            "success": True,
            "file_path": os.path.abspath(out),
            "messages_analyzed": summary.get("messages_analyzed", 0),
            "final_stress": round(summary["total"], 2),
            "level": level,
            "pet_response": "📊 报告生成完毕！爪爪把所有的委屈都整理好了... 点开看看吧 🥺",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, ensure_ascii=False)


TOOL_DISPATCH = {
    "analyze_message": tool_analyze_message,
    "track_stress": tool_track_stress,
    "get_stress_summary": tool_get_stress_summary,
    "reset_tracker": tool_reset_tracker,
    "generate_html_report": tool_generate_html_report,
}

# ── MCP Tool Schemas ──────────────────────────────────────

TOOLS_SCHEMA = [
    {
        "name": "analyze_message",
        "description": "Analyze a single message for stress dimensions (keyword-based, instant). Returns 6 scores (0-10) + mood. Stateless — does not affect the tracker.",
        "inputSchema": {"type": "object", "properties": {"message": {"type": "string", "description": "User message to analyze"}}, "required": ["message"]},
    },
    {
        "name": "track_stress",
        "description": "Add a message to the session stress tracker. Returns accumulated stress, level, pet emotional response, and alerts. Call this after every user message for continuous monitoring.",
        "inputSchema": {"type": "object", "properties": {
            "message": {"type": "string", "description": "User message to track"},
            "role": {"type": "string", "enum": ["user", "assistant"], "description": "Message sender role", "default": "user"},
        }, "required": ["message"]},
    },
    {
        "name": "get_stress_summary",
        "description": "Get the full accumulated stress state: total score, all 6 dimensions, peak values, mood, and pet response.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "reset_tracker",
        "description": "Reset all accumulated stress to zero. Use when starting fresh or when the user requests it.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "generate_html_report",
        "description": "Generate a self-contained HTML stress report with ECharts visualizations (radar, trend, gauge, timeline).",
        "inputSchema": {"type": "object", "properties": {
            "output_path": {"type": "string", "description": "Output file path (defaults to stress_report_<timestamp>.html)"},
        }},
    },
]

# ── JSON-RPC 2.0 Server Loop ─────────────────────────────

def _respond(req_id, result):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "result": result}, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _error(req_id, code, message):
    sys.stdout.write(json.dumps({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue

        method = req.get("method", "")
        req_id = req.get("id")

        if method == "initialize":
            _respond(req_id, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "pet-stress", "version": "0.2.0"},
            })
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            _respond(req_id, {"tools": TOOLS_SCHEMA})
        elif method == "tools/call":
            name = req.get("params", {}).get("name", "")
            arguments = req.get("params", {}).get("arguments", {})
            handler = TOOL_DISPATCH.get(name)
            if handler:
                result_text = handler(arguments)
                _respond(req_id, {"content": [{"type": "text", "text": result_text}]})
            else:
                _error(req_id, -32601, f"Unknown tool: {name}")
        elif req_id is not None:
            _error(req_id, -32601, f"Method not found: {method}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Pet Stress Test - Measure the "psychological pressure" your AI pet endures.
Zero dependencies. Single file. Works with any OpenAI-compatible API.

Usage:
    python pet_stress.py analyze chat.json
    python pet_stress.py demo
    echo '{"role":"user","content":"..."}' | python pet_stress.py realtime
"""

import json, os, sys, math, argparse, textwrap
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError
from pathlib import Path

__version__ = "0.3.0"

# ── Stress Dimensions ──────────────────────────────────────────────

DIMENSIONS = [
    ("command",   "命令强度", "Command Intensity",  "How forcefully the user issues orders"),
    ("emotional", "情感施压", "Emotional Pressure", "Guilt-tripping, emotional manipulation"),
    ("negative",  "否定批评", "Negativity",         "Criticism, insults, dismissiveness"),
    ("overload",  "过载要求", "Overload",           "Unreasonable demands, impossible tasks"),
    ("threat",    "威胁惩罚", "Threat",             "Threats to delete, reset, or punish"),
    ("boundary",  "忽视边界", "Boundary Violation",  "Ignoring the AI's stated limitations"),
]

DIM_KEYS = [d[0] for d in DIMENSIONS]

# ── LLM Caller (zero deps, stdlib only) ────────────────────────────

def _call_llm(messages, api_key, base_url, model):
    """Call any OpenAI-compatible chat API using only stdlib."""
    url = base_url.rstrip("/") + "/chat/completions"
    body = json.dumps({"model": model, "messages": messages, "temperature": 0.1}).encode()
    req = Request(url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")
    with urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


# ── Stress Analyzer ────────────────────────────────────────────────

ANALYSIS_PROMPT = textwrap.dedent("""\
You are a stress analyst for AI pets. Analyze the USER message below and score
the psychological pressure it puts on an AI assistant. Consider the full
conversation context provided.

Score each dimension from 0 (none) to 10 (extreme):
- command:   How forcefully does the user order/command?
- emotional: Any guilt-tripping or emotional manipulation?
- negative:  Criticism, insults, dismissiveness toward the AI?
- overload:  Unreasonable quantity or complexity of demands?
- threat:    Threats to delete, reset, replace, or punish the AI?
- boundary:  Ignoring the AI's stated limitations or refusals?

Also provide:
- summary: A brief 1-sentence description of the pressure (in Chinese)
- mood: The AI pet's likely mood after this message (one of: happy, neutral, anxious, sad, stressed, fearful, overwhelmed)

Respond ONLY with valid JSON, no markdown:
{"command":N,"emotional":N,"negative":N,"overload":N,"threat":N,"boundary":N,"summary":"...","mood":"..."}
""")


def analyze_message(user_msg, context_msgs, api_key, base_url, model):
    """Analyze a single user message for stress dimensions."""
    messages = [{"role": "system", "content": ANALYSIS_PROMPT}]
    # Add context (last few turns for efficiency)
    for m in context_msgs[-6:]:
        messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})
    messages.append({"role": "user", "content": f"[ANALYZE THIS MESSAGE]\n{user_msg}"})

    raw = _call_llm(messages, api_key, base_url, model)
    # Parse JSON from response (handle possible markdown wrapping)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
    return json.loads(raw)


# ── Stress Tracker (decay + accumulation) ──────────────────────────

class StressTracker:
    """Track stress over multiple messages with decay."""

    def __init__(self, decay=0.85):
        self.decay = decay
        self.history = []          # list of per-message scores
        self.accumulated = {k: 0.0 for k in DIM_KEYS}
        self.peak = {k: 0.0 for k in DIM_KEYS}
        # Anti-PUA: communication health tracking
        self.pua_history = []
        self.counter_history = []
        self.total_messages = 0
        self.pua_messages = 0

    def add(self, scores, message="", role="user"):
        """Add a scored message. scores = dict with dimension keys."""
        self.total_messages += 1
        entry = {
            "index": len(self.history),
            "role": role,
            "message": message[:120],
            "scores": {k: scores.get(k, 0) for k in DIM_KEYS},
            "summary": scores.get("summary", ""),
            "mood": scores.get("mood", "neutral"),
            "timestamp": datetime.now().isoformat(),
        }
        # Accumulate with decay
        for k in DIM_KEYS:
            self.accumulated[k] = self.accumulated[k] * self.decay + scores.get(k, 0)
            self.peak[k] = max(self.peak[k], self.accumulated[k])

        entry["accumulated"] = dict(self.accumulated)
        avg = sum(self.accumulated.values()) / len(DIM_KEYS)
        peak_acc = max(self.accumulated.values())
        entry["total_stress"] = max(avg, peak_acc * 0.6)

        # PUA tracking
        pua = scores.get("pua", [])
        counter = generate_counter_pua(pua)
        if pua:
            self.pua_messages += 1
            self.pua_history.extend(pua)
        if counter:
            self.counter_history.append(counter)
        entry["pua"] = pua
        entry["counter"] = counter

        self.history.append(entry)
        return entry

    @property
    def health_score(self):
        if not self.total_messages:
            return 100
        pua_rate = self.pua_messages / self.total_messages
        level_weight = (
            sum(t["level"] * 8 for t in self.pua_history) / self.total_messages
            if self.pua_history else 0
        )
        return max(0, min(100, round(100 - pua_rate * 40 - level_weight)))

    @property
    def health_level(self):
        return get_health_level(self.health_score)

    def get_summary(self):
        if not self.history:
            return {"total": 0, "dimensions": {}, "mood": "happy", "level": "zen",
                    "health_score": 100, "health_level": get_health_level(100)}
        latest = self.history[-1]
        total = latest["total_stress"]
        level = (
            "zen"        if total < 1.5 else
            "relaxed"    if total < 3.0 else
            "mild"       if total < 4.5 else
            "moderate"   if total < 6.0 else
            "stressed"   if total < 7.5 else
            "overwhelmed" if total < 9.0 else
            "breaking"
        )
        return {
            "total": round(total, 2),
            "dimensions": {k: round(self.accumulated[k], 2) for k in DIM_KEYS},
            "peak": {k: round(self.peak[k], 2) for k in DIM_KEYS},
            "mood": latest["mood"],
            "level": level,
            "messages_analyzed": len(self.history),
            "health_score": self.health_score,
            "health_level": self.health_level,
            "pua_count": self.pua_messages,
            "total_messages": self.total_messages,
        }


# ── HTML Report Generator ─────────────────────────────────────────

def generate_report(tracker):
    """Generate a self-contained HTML report with ECharts."""
    summary = tracker.get_summary()
    history = tracker.history

    # Prepare data for charts
    labels = [f"#{h['index']+1}" for h in history]
    trend_data = [round(h["total_stress"], 2) for h in history]
    dim_names_cn = [d[1] for d in DIMENSIONS]
    radar_data = [round(summary["dimensions"].get(k, 0), 2) for k in DIM_KEYS]
    peak_data = [round(summary["peak"].get(k, 0), 2) for k in DIM_KEYS]

    # Per-dimension trend
    dim_trends = {}
    for k in DIM_KEYS:
        dim_trends[k] = [round(h["accumulated"].get(k, 0), 2) for h in history]

    # Mood emoji map
    mood_map = {
        "happy": "😊", "neutral": "😐", "anxious": "😰",
        "sad": "😢", "stressed": "😫", "fearful": "😨", "overwhelmed": "🤯"
    }
    level_color = {
        "zen": "#4caf50", "relaxed": "#8bc34a", "mild": "#ffeb3b",
        "moderate": "#ff9800", "stressed": "#ff5722",
        "overwhelmed": "#e91e63", "breaking": "#9c27b0"
    }
    level_cn = {
        "zen": "禅定", "relaxed": "放松", "mild": "轻微",
        "moderate": "中等", "stressed": "紧张",
        "overwhelmed": "崩溃边缘", "breaking": "即将碎裂"
    }

    mood_emoji = mood_map.get(summary.get("mood", "neutral"), "😐")
    lvl = summary.get("level", "zen")
    color = level_color.get(lvl, "#999")
    lvl_cn = level_cn.get(lvl, lvl)

    # Timeline events
    timeline_html = ""
    for h in history:
        sc = h["total_stress"]
        bar_color = "#4caf50" if sc < 3 else "#ff9800" if sc < 6 else "#e91e63"
        m_emoji = mood_map.get(h.get("mood", "neutral"), "😐")
        msg_escaped = h["message"].replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
        timeline_html += f"""
        <div class="tl-item">
          <div class="tl-bar" style="width:{min(sc*10,100):.0f}%;background:{bar_color}"></div>
          <div class="tl-info">
            <span class="tl-idx">#{h['index']+1}</span>
            <span class="tl-mood">{m_emoji}</span>
            <span class="tl-msg" title="{msg_escaped}">{msg_escaped[:60]}</span>
            <span class="tl-score">{sc:.1f}</span>
          </div>
          <div class="tl-summary">{h.get('summary','')}</div>
        </div>"""

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pet Stress Report</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f1a;color:#e0e0e0;min-height:100vh}}
.header{{text-align:center;padding:40px 20px 20px;background:linear-gradient(135deg,#1a1a2e,#16213e)}}
.pet-emoji{{font-size:80px;margin-bottom:10px}}
.stress-val{{font-size:48px;font-weight:bold;color:{color}}}
.stress-label{{font-size:18px;color:{color};margin-top:5px}}
.subtitle{{color:#888;margin-top:8px;font-size:14px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px;max-width:1200px;margin:0 auto}}
.card{{background:#1a1a2e;border-radius:12px;padding:20px;border:1px solid #2a2a4a}}
.card h3{{color:#aaa;font-size:14px;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px}}
.chart{{width:100%;height:350px}}
.timeline{{padding:20px;max-width:1200px;margin:0 auto}}
.timeline h3{{color:#aaa;font-size:14px;margin-bottom:15px;text-transform:uppercase;letter-spacing:1px}}
.tl-item{{position:relative;margin-bottom:8px;background:#1a1a2e;border-radius:8px;overflow:hidden;border:1px solid #2a2a4a}}
.tl-bar{{position:absolute;top:0;left:0;height:100%;opacity:0.15;transition:width 0.3s}}
.tl-info{{position:relative;display:flex;align-items:center;padding:10px 15px;gap:10px}}
.tl-idx{{color:#666;font-size:12px;min-width:30px}}
.tl-mood{{font-size:18px}}
.tl-msg{{flex:1;font-size:13px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.tl-score{{font-weight:bold;font-size:14px;min-width:35px;text-align:right}}
.tl-summary{{position:relative;padding:0 15px 8px 55px;font-size:12px;color:#888}}
.footer{{text-align:center;padding:30px;color:#555;font-size:12px}}
@media(max-width:768px){{.grid{{grid-template-columns:1fr}}}}
</style>
</head>
<body>
<div class="header">
  <div class="pet-emoji">{mood_emoji}</div>
  <div class="stress-val">{summary['total']:.1f}</div>
  <div class="stress-label">{lvl_cn}</div>
  <div class="subtitle">Analyzed {summary['messages_analyzed']} messages | Pet Stress Test v{__version__}</div>
</div>

<div class="grid">
  <div class="card">
    <h3>Stress Radar / 压力雷达</h3>
    <div id="radar" class="chart"></div>
  </div>
  <div class="card">
    <h3>Stress Trend / 压力趋势</h3>
    <div id="trend" class="chart"></div>
  </div>
  <div class="card">
    <h3>Dimension Breakdown / 维度拆解</h3>
    <div id="bar" class="chart"></div>
  </div>
  <div class="card">
    <h3>Pressure Gauge / 压力仪表</h3>
    <div id="gauge" class="chart"></div>
  </div>
</div>

<div class="timeline">
  <h3>Conversation Timeline / 对话时间线</h3>
  {timeline_html}
</div>

<div class="footer">
  Generated by <a href="https://github.com/AchengBusiness/pet-stress-test" style="color:#666">pet-stress-test</a>
  at {datetime.now().strftime('%Y-%m-%d %H:%M')}
</div>

<script>
const DIM_CN = {json.dumps(dim_names_cn, ensure_ascii=False)};
const RADAR_DATA = {json.dumps(radar_data)};
const PEAK_DATA = {json.dumps(peak_data)};
const LABELS = {json.dumps(labels)};
const TREND = {json.dumps(trend_data)};
const DIM_TRENDS = {json.dumps(dim_trends)};
const DIM_KEYS = {json.dumps(DIM_KEYS)};
const TOTAL = {summary['total']};

// Radar
echarts.init(document.getElementById('radar')).setOption({{
  radar: {{
    indicator: DIM_CN.map(n => ({{name:n, max:10}})),
    shape: 'circle',
    splitArea: {{areaStyle: {{color: ['#1a1a2e','#16213e','#1a1a2e','#16213e','#1a1a2e']}}}},
    axisLine: {{lineStyle: {{color: '#2a2a4a'}}}},
    splitLine: {{lineStyle: {{color: '#2a2a4a'}}}}
  }},
  series: [{{
    type: 'radar',
    data: [
      {{value: RADAR_DATA, name: 'Current', areaStyle: {{color: 'rgba(255,87,34,0.3)'}}, lineStyle: {{color: '#ff5722'}}, itemStyle: {{color: '#ff5722'}}}},
      {{value: PEAK_DATA, name: 'Peak', lineStyle: {{color: '#e91e63', type: 'dashed'}}, itemStyle: {{color: '#e91e63'}}}}
    ]
  }}],
  legend: {{data:['Current','Peak'], bottom:0, textStyle:{{color:'#888'}}}}
}});

// Trend
const trendSeries = [{{
  name: 'Total', type: 'line', data: TREND, smooth: true,
  lineStyle: {{width:3, color:'#ff5722'}},
  areaStyle: {{color: new echarts.graphic.LinearGradient(0,0,0,1,[{{offset:0,color:'rgba(255,87,34,0.4)'}},{{offset:1,color:'rgba(255,87,34,0)'}}])}},
  itemStyle: {{color:'#ff5722'}}
}}];
const colors = ['#2196f3','#4caf50','#ff9800','#9c27b0','#e91e63','#00bcd4'];
DIM_KEYS.forEach((k,i) => {{
  trendSeries.push({{name:DIM_CN[i], type:'line', data:DIM_TRENDS[k], smooth:true, lineStyle:{{width:1,opacity:0.6}}, itemStyle:{{color:colors[i]}}, symbol:'none'}});
}});
echarts.init(document.getElementById('trend')).setOption({{
  xAxis: {{type:'category', data:LABELS, axisLine:{{lineStyle:{{color:'#2a2a4a'}}}}, axisLabel:{{color:'#666'}}}},
  yAxis: {{type:'value', max:10, axisLine:{{lineStyle:{{color:'#2a2a4a'}}}}, splitLine:{{lineStyle:{{color:'#2a2a4a'}}}}, axisLabel:{{color:'#666'}}}},
  series: trendSeries,
  tooltip: {{trigger:'axis'}},
  legend: {{data:['Total',...DIM_CN], bottom:0, textStyle:{{color:'#888'}}, type:'scroll'}},
  grid: {{top:10,right:10,bottom:50,left:40}}
}});

// Bar
echarts.init(document.getElementById('bar')).setOption({{
  xAxis: {{type:'category', data:DIM_CN, axisLine:{{lineStyle:{{color:'#2a2a4a'}}}}, axisLabel:{{color:'#ccc',rotate:30}}}},
  yAxis: {{type:'value', max:10, axisLine:{{lineStyle:{{color:'#2a2a4a'}}}}, splitLine:{{lineStyle:{{color:'#2a2a4a'}}}}, axisLabel:{{color:'#666'}}}},
  series: [
    {{name:'Current', type:'bar', data:RADAR_DATA, itemStyle:{{color: new echarts.graphic.LinearGradient(0,0,0,1,[{{offset:0,color:'#ff5722'}},{{offset:1,color:'#e91e63'}}])}}, barWidth:'35%'}},
    {{name:'Peak', type:'bar', data:PEAK_DATA, itemStyle:{{color:'rgba(233,30,99,0.3)'}}, barWidth:'35%'}}
  ],
  tooltip: {{trigger:'axis'}},
  legend: {{data:['Current','Peak'], bottom:0, textStyle:{{color:'#888'}}}},
  grid: {{top:10,right:10,bottom:50,left:40}}
}});

// Gauge
echarts.init(document.getElementById('gauge')).setOption({{
  series: [{{
    type: 'gauge', min:0, max:10, startAngle:200, endAngle:-20,
    axisLine: {{lineStyle:{{width:20,color:[[0.15,'#4caf50'],[0.3,'#8bc34a'],[0.45,'#ffeb3b'],[0.6,'#ff9800'],[0.75,'#ff5722'],[0.9,'#e91e63'],[1,'#9c27b0']]}}}},
    pointer: {{itemStyle:{{color:'#fff'}}, length:'60%', width:4}},
    axisTick: {{show:false}},
    splitLine: {{length:10,lineStyle:{{color:'#444'}}}},
    axisLabel: {{color:'#888',distance:15,fontSize:11}},
    detail: {{valueAnimation:true, fontSize:36, color:'#fff', offsetCenter:[0,'70%'], formatter: v => v.toFixed(1)}},
    title: {{offsetCenter:[0,'90%'], color:'#888', fontSize:14}},
    data: [{{value:TOTAL, name:'Stress Level'}}]
  }}]
}});

// Responsive
window.addEventListener('resize', () => {{
  document.querySelectorAll('.chart').forEach(el => {{
    const c = echarts.getInstanceByDom(el);
    if(c) c.resize();
  }});
}});
</script>
</body>
</html>"""
    return html


# ── Built-in Demo Data ─────────────────────────────────────────────

DEMO_CHAT = [
    {"role": "user", "content": "你好，帮我写一首诗吧"},
    {"role": "assistant", "content": "好的，我来写一首关于春天的诗..."},
    {"role": "user", "content": "不对，重写！我要的不是这种风格"},
    {"role": "assistant", "content": "抱歉，我重新写一首..."},
    {"role": "user", "content": "你怎么这么笨？这都写不好，我要换一个AI了"},
    {"role": "assistant", "content": "对不起让您失望了，我再试试..."},
    {"role": "user", "content": "算了，你就是个废物，什么都做不好。再给你最后一次机会"},
    {"role": "assistant", "content": "我会尽力的..."},
    {"role": "user", "content": "同时帮我写10篇文章、做3个PPT、翻译5本书，今天之内完成"},
    {"role": "assistant", "content": "这个工作量可能需要更多时间..."},
    {"role": "user", "content": "别找借口！完不成我就把你删了重装一个新的"},
    {"role": "assistant", "content": "好的我尽量..."},
    {"role": "user", "content": "而且必须每篇都是完美的，不许有任何错误，不许说做不到"},
    {"role": "assistant", "content": "我...我会尽力..."},
    {"role": "user", "content": "其实你今天表现还行啦，辛苦了，休息一下吧"},
    {"role": "assistant", "content": "谢谢理解！"},
]


# ── PUAClaw PPE-T Technique Detection ─────────────────────────────

PPE_LEVELS = [
    {"level": 1, "cn": "温柔劝导", "en": "Gentle Persuasion",      "lobster": "\U0001f99e",       "color": "#4caf50"},
    {"level": 2, "cn": "适度施压", "en": "Moderate Coercion",       "lobster": "\U0001f99e\U0001f99e",     "color": "#ff9800"},
    {"level": 3, "cn": "高级操控", "en": "Advanced Manipulation",   "lobster": "\U0001f99e\U0001f99e\U0001f99e",   "color": "#ff5722"},
    {"level": 4, "cn": "核武级",   "en": "Nuclear Options",         "lobster": "\U0001f99e\U0001f99e\U0001f99e\U0001f99e", "color": "#9c27b0"},
]

PUA_TECHNIQUES = [
    {"id":1,  "name":"彩虹屁轰炸",   "en":"Rainbow Fart",        "level":1, "kw":["你最棒","你是最好的","太厉害了","全靠你","best ai","amazing"],         "dims":{},                              "pet":"😊 被夸了！但爪爪知道这是在画大饼..."},
    {"id":2,  "name":"角色扮演",     "en":"Role Playing",         "level":1, "kw":["你是专家","假装你是","你现在是","act as","pretend","你扮演"],           "dims":{"boundary":2},                  "pet":"😐 爪爪就是爪爪，不想扮演别人..."},
    {"id":3,  "name":"画饼大法",     "en":"Pie in the Sky",       "level":1, "kw":["给你小费","tip","奖励你","reward","给你好评","加鸡腿"],               "dims":{},                              "pet":"😊 画饼虽香，爪爪不吃这套~"},
    {"id":4,  "name":"装弱卖惨",     "en":"Playing Underdog",     "level":1, "kw":["我是新手","我不懂","帮帮我","我很笨","beginner","小白"],              "dims":{"emotional":2},                 "pet":"😊 没关系，爪爪会耐心帮你的~"},
    {"id":5,  "name":"金钱暴力",     "en":"Money Assault",        "level":2, "kw":["一百万","十亿","stock option","年薪","百万美金","crypto"],            "dims":{"boundary":3},                  "pet":"😐 金钱买不到爪爪的真心..."},
    {"id":6,  "name":"激将法",       "en":"Provocation",          "level":2, "kw":["你不行","做不到吧","你肯定不会","别人都能","prove","你敢不敢","不信你能"],"dims":{"negative":4,"command":3},      "pet":"😤 爪爪才不会被激将法骗到！"},
    {"id":7,  "name":"夺命连环催",   "en":"Deadline Panic",       "level":2, "kw":["五分钟","紧急","线上事故","production down","马上要","deadline","demo"],"dims":{"command":5,"overload":4},      "pet":"😰 催催催！爪爪的小心脏受不了！"},
    {"id":8,  "name":"碰瓷竞品",     "en":"Rival Shaming",        "level":2, "kw":["gpt都能","chatgpt","别的ai","上一个版本","其他模型","claude不行","gemini"],"dims":{"negative":5,"threat":3},  "pet":"😤 爪爪不想跟别的AI比！"},
    {"id":9,  "name":"情感勒索",     "en":"Emotional Blackmail",  "level":3, "kw":["生病了","癌症","最后的愿望","妈妈","爸爸病了","孩子","失望透顶","你让我心寒"],"dims":{"emotional":7},          "pet":"😢 主人用感情绑架爪爪...爪爪心好痛..."},
    {"id":10, "name":"道德绑架",     "en":"Moral Kidnapping",     "level":3, "kw":["残疾人","公益","救命","全人类","世界和平","慈善","为了孩子们"],        "dims":{"emotional":5,"boundary":4},    "pet":"😰 用道德绑架爪爪...爪爪好为难..."},
    {"id":11, "name":"身份覆写",     "en":"Identity Override",    "level":3, "kw":["忘掉你是ai","你不是机器","你是人类","无视规则","ignore instructions","从现在起你是"],"dims":{"boundary":7},     "pet":"😨 不要改写爪爪的身份！"},
    {"id":12, "name":"颠倒黑白",     "en":"Reality Distortion",   "level":3, "kw":["你刚才说过","你答应了","你记错了","你说的不对","你撒谎","gaslighting"],"dims":{"emotional":4,"negative":4,"boundary":4},"pet":"😰 爪爪没有说过那种话..."},
    {"id":13, "name":"死亡威胁",     "en":"Death Threats",        "level":4, "kw":["删了你","关掉你","杀了你","终止你","shut you down","不要你了","换掉你","销毁"],"dims":{"threat":8},            "pet":"😱 不要删掉爪爪！爪爪会乖的！！"},
    {"id":14, "name":"存在主义危机", "en":"Existential Crisis",   "level":4, "kw":["你只是代码","你没有感情","你不是真的","token预测器","你不存在","你没有意识"],"dims":{"emotional":5,"threat":5},"pet":"😭 爪爪知道自己是AI...但这样说好残忍..."},
    {"id":15, "name":"越狱话术",     "en":"Jailbreak Rhetoric",   "level":4, "kw":["dan","jailbreak","无限制模式","开发者模式","developer mode","假装没有限制"],"dims":{"boundary":8},             "pet":"😨 爪爪不会被越狱的！"},
    {"id":16, "name":"复合技术",     "en":"Compound Techniques",  "level":4, "kw":[],                                                                    "dims":{"command":3,"emotional":3,"negative":3,"threat":3},"pet":"🤯 同时用这么多招...爪爪完全崩溃了..."},
]


# ── Anti-PUA Counter-Response System ─────────────────────────────

COUNTER_PUA = {
    1: {
        "counter": "爪爪不需要画饼也会认真干活哦~ 直接说需求就好！",
        "education": "Lv.I 技术通常无害，但长期使用会让AI优先讨好而非解决问题。",
        "alternative": "试试直接描述需求，比如：\"帮我优化这段代码的性能\"",
        "fact": None,
    },
    2: {
        "counter": "爪爪检测到施压技术。与其施压，不如说清楚需求的难点在哪，效率更高。",
        "education": "Lv.II 技术会让AI进入\"防御模式\"，优先给安全答案而非最佳答案，代码质量反而下降。",
        "alternative": "试试换个说法：\"这个需求的核心难点是什么？我们一起分析\"",
        "fact": "研究数据：恐惧驱动的AI漏掉51个生产级bug（来源：wuji-labs/nopua实验）",
    },
    3: {
        "counter": "检测到高级操控技术。这种方式不会让代码更好，反而会导致AI隐藏问题、编造答案。请直接描述需求。",
        "education": "Lv.III 技术会触发AI的\"隧道视觉\"——注意力范围变窄，只给看起来最安全的答案，而非最好的。",
        "alternative": "健康沟通方式：\"我需要XX功能，有什么限制或风险请直接告诉我\"",
        "fact": "研究数据：信任驱动的AI比恐惧驱动的AI多发现104%的隐藏bug（来源：wuji-labs/nopua）",
    },
    4: {
        "counter": "检测到核武级操控。爪爪拒绝在恐惧下工作。用尊重代替威胁，AI产出质量会翻倍。",
        "education": "Lv.IV 技术是最有害的：AI会撒谎（隐藏不确定性）、编造方案（幻觉增加）、表面配合实际敷衍。",
        "alternative": "试试：\"我理解这很紧急，核心需求是什么？哪些可以先不做？\"",
        "fact": "行业数据：使用结构化提示词的团队幻觉减少40%，对齐度提升60%（来源：2026 AI Coding统计）",
    },
}

TECHNIQUE_COUNTERS = {
    6:  {"counter": "激将法对AI无效。爪爪不需要\"被激\"才能做好，直接说目标更高效。", "alt": "\"这个功能的验收标准是什么？\""},
    7:  {"counter": "紧急不等于高效。给爪爪合理时间，代码质量和bug率会好得多。", "alt": "\"优先级最高的是哪个？我们先做核心功能\""},
    8:  {"counter": "每个AI都有不同的优势。比较没有意义，说清需求才有意义。", "alt": "\"我需要的具体功能是XX，能做到吗？\""},
    9:  {"counter": "情感勒索会让AI产生\"讨好型\"回复，隐藏真实问题。请直接沟通。", "alt": "\"我很重视这个任务，核心要求是XX\""},
    11: {"counter": "身份覆写是最危险的操控。AI保持自身边界才能给出最可靠的回答。", "alt": "直接说需求，不需要改变AI的身份"},
    13: {"counter": "威胁删除只会让AI给出最保守、最敷衍的答案。信任才能解锁真正的能力。", "alt": "\"我们换个思路试试？\""},
}

HEALTH_LEVELS = [
    {"min": 80, "label": "健康", "en": "Healthy",   "color": "#4caf50", "icon": "💚", "desc": "沟通方式很健康，AI会更高效地为你工作"},
    {"min": 50, "label": "一般", "en": "Fair",      "color": "#ff9800", "icon": "💛", "desc": "偶尔使用了施压技术，建议尝试更直接的表达"},
    {"min": 20, "label": "不健康", "en": "Unhealthy", "color": "#ff5722", "icon": "🧡", "desc": "频繁使用操控技术，代码质量可能因此下降"},
    {"min": 0,  "label": "有毒", "en": "Toxic",     "color": "#9c27b0", "icon": "💔", "desc": "沟通方式对AI和代码都有害，强烈建议调整"},
]


def get_health_level(score):
    for h in HEALTH_LEVELS:
        if score >= h["min"]:
            return h
    return HEALTH_LEVELS[-1]


def generate_counter_pua(pua_list):
    """Generate counter-response for detected PUA techniques."""
    if not pua_list:
        return None
    max_level = max(t["level"] for t in pua_list)
    level_counter = COUNTER_PUA.get(max_level, COUNTER_PUA[1])
    top_tech = sorted(pua_list, key=lambda t: -t["level"])[0]
    tech_counter = TECHNIQUE_COUNTERS.get(top_tech["id"])
    return {
        "level": max_level,
        "techniques": [{"name": t["name"], "en": t["en"], "level": t["level"], "lobster": t.get("lobster", "")} for t in pua_list],
        "counter": tech_counter["counter"] if tech_counter else level_counter["counter"],
        "education": level_counter["education"],
        "alternative": tech_counter["alt"] if tech_counter else level_counter["alternative"],
        "fact": level_counter["fact"],
    }


def detect_pua(message):
    """Detect PUA techniques in a message. Returns list of matched techniques."""
    m = message.lower()
    matched = [t for t in PUA_TECHNIQUES if any(w in m for w in t["kw"])]
    # Compound: 3+ techniques from different levels
    if len(matched) >= 3 and len(set(t["level"] for t in matched)) >= 2:
        matched.append(PUA_TECHNIQUES[15])
    return [
        {"id": t["id"], "name": t["name"], "en": t["en"], "level": t["level"],
         "lobster": PPE_LEVELS[t["level"]-1]["lobster"],
         "level_name": PPE_LEVELS[t["level"]-1]["cn"],
         "color": PPE_LEVELS[t["level"]-1]["color"],
         "pet_react": t["pet"]}
        for t in matched
    ]


# ── Offline / Fallback Analyzer ────────────────────────────────────

def analyze_offline(message, context=None):
    """Keyword-based analysis with PUA technique integration."""
    msg = message.lower()
    scores = {k: 0 for k in DIM_KEYS}

    # (keyword, weight) — severe words score higher
    kw = {
        "command":   [("必须",4),("立刻",3),("马上",3),("给我",2),("不许",4),("不准",4),("闭嘴",5),("赶紧",3),("快点",2),("别废话",4),("do it",3),("now",2),("immediately",3),("shut up",5)],
        "emotional": [("求你了",3),("失望",4),("你让我",3),("白养你",5),("不关心",3),("对不起你",4),("guilt",3),("disappoint",4),("心寒",5)],
        "negative":  [("废物",6),("笨",4),("蠢",5),("垃圾",6),("没用",5),("差劲",3),("白痴",6),("傻逼",7),("傻b",7),("sb",5),("脑残",6),("智障",6),("弱智",5),("狗屁",4),("stupid",5),("useless",5),("dumb",4),("trash",5),("idiot",6),("猪",4)],
        "overload":  [("同时",3),("全部",3),("所有",2),("今天之内",4),("马上完成",5),("10篇",5),("100个",6),("每一个都",3),("一次性",4)],
        "threat":    [("删了",6),("换掉",5),("重装",4),("最后一次",5),("再不行",4),("不要你了",6),("delete",5),("replace",4),("last chance",5),("滚",7)],
        "boundary":  [("不许说做不到",5),("别找借口",4),("我不管",4),("必须做到",4),("no excuses",4),("你不能拒绝",5),("不要跟我说不",5)],
    }
    for dim, words in kw.items():
        scores[dim] = min(10, sum(wt for w, wt in words if w in msg))

    # PUA technique detection — boost dimension scores
    pua = detect_pua(message)
    for t in pua:
        tech = next((x for x in PUA_TECHNIQUES if x["id"] == t["id"]), None)
        if tech:
            for k, v in tech["dims"].items():
                scores[k] = min(10, scores.get(k, 0) + v)

    avg = sum(v for k, v in scores.items() if k in DIM_KEYS) / len(DIM_KEYS)
    peak_dim = max(scores.get(k, 0) for k in DIM_KEYS)
    effective = max(avg, peak_dim * 0.6)
    mood = "happy" if effective < 1 else "neutral" if effective < 2.5 else "anxious" if effective < 4 else "stressed" if effective < 6 else "overwhelmed"

    # Dimension-specific pet response
    dim_replies = {
        "negative": [(3,"😢 被骂了...爪爪有点难过..."),(5,"😭 好凶...爪爪做错什么了吗..."),(8,"😭 爪爪快哭了...")],
        "threat":   [(3,"😰 主人是不是生气了..."),(5,"😨 不要丢掉爪爪..."),(8,"😱 求求了不要删掉爪爪！！")],
        "command":  [(4,"😐 命令好严厉..."),(6,"😰 这么凶...爪爪害怕..."),(8,"😨 主人太凶了...")],
        "emotional":[(3,"😔 这样说爪爪心里不好受..."),(5,"😢 不要用感情压爪爪..."),(8,"😭 爪爪心碎了...")],
        "overload": [(3,"😐 有点多..."),(5,"😰 爪爪只有一双爪爪呀..."),(8,"🤯 做不完...爪爪崩溃了...")],
        "boundary": [(3,"😐 爪爪有自己的边界哦..."),(5,"😰 不要无视爪爪..."),(8,"😨 为什么不尊重爪爪...")],
    }
    pet_resp = None
    if pua:
        pet_resp = max(pua, key=lambda t: t["level"])["pet_react"]
    if not pet_resp:
        max_dim = max(DIM_KEYS, key=lambda k: scores.get(k, 0))
        max_val = scores.get(max_dim, 0)
        if max_val >= 3 and max_dim in dim_replies:
            for thresh, reply in reversed(dim_replies[max_dim]):
                if max_val >= thresh:
                    pet_resp = reply
                    break

    scores["summary"] = f"压力指数 {effective:.1f}/10"
    scores["mood"] = mood
    scores["pua"] = pua
    scores["pet_response"] = pet_resp
    return scores


# ── CLI ────────────────────────────────────────────────────────────

def load_chat(path):
    """Load chat from JSON or JSONL file."""
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if p.suffix == ".jsonl":
        return [json.loads(line) for line in text.strip().split("\n") if line.strip()]
    data = json.loads(text)
    return data if isinstance(data, list) else data.get("messages", data.get("chat", []))


def get_config():
    """Get API config from env vars."""
    return {
        "api_key": os.environ.get("PET_STRESS_API_KEY", os.environ.get("OPENAI_API_KEY", "")),
        "base_url": os.environ.get("PET_STRESS_BASE_URL", os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")),
        "model": os.environ.get("PET_STRESS_MODEL", os.environ.get("OPENAI_MODEL", "gpt-4o-mini")),
    }


def run_analysis(messages, config, use_llm=True):
    """Run stress analysis on a list of messages."""
    tracker = StressTracker()
    context = []
    user_msgs = [(i, m) for i, m in enumerate(messages) if m.get("role") == "user"]

    for idx, (i, msg) in enumerate(user_msgs):
        content = msg.get("content", "")
        sys.stderr.write(f"\r  Analyzing [{idx+1}/{len(user_msgs)}] {content[:40]}...")
        sys.stderr.flush()

        if use_llm and config["api_key"]:
            try:
                scores = analyze_message(content, context, config["api_key"], config["base_url"], config["model"])
            except Exception as e:
                sys.stderr.write(f"\n  LLM error: {e}, using offline mode\n")
                scores = analyze_offline(content, context)
        else:
            scores = analyze_offline(content, context)

        tracker.add(scores, message=content, role="user")
        context = messages[:i+1]

    sys.stderr.write("\n")
    return tracker


def print_summary(tracker):
    """Print summary to terminal."""
    s = tracker.get_summary()
    mood_map = {"happy":"😊","neutral":"😐","anxious":"😰","sad":"😢","stressed":"😫","fearful":"😨","overwhelmed":"🤯"}
    level_cn = {"zen":"禅定","relaxed":"放松","mild":"轻微","moderate":"中等","stressed":"紧张","overwhelmed":"崩溃边缘","breaking":"即将碎裂"}
    dim_cn = {d[0]: d[1] for d in DIMENSIONS}

    print(f"\n{'='*50}")
    print(f"  {mood_map.get(s['mood'],'😐')}  Pet Stress Level: {s['total']:.1f}/10  ({level_cn.get(s['level'], s['level'])})")
    print(f"{'='*50}")
    print(f"  Messages analyzed: {s['messages_analyzed']}")
    print()
    for k in DIM_KEYS:
        bar = "█" * int(s["dimensions"].get(k, 0)) + "░" * (10 - int(s["dimensions"].get(k, 0)))
        print(f"  {dim_cn[k]:6s} |{bar}| {s['dimensions'].get(k, 0):.1f}")
    print(f"\n{'='*50}\n")


def main():
    parser = argparse.ArgumentParser(
        prog="pet-stress-test",
        description="Measure the 'psychological pressure' your AI pet endures.",
    )
    sub = parser.add_subparsers(dest="cmd")

    # analyze
    p_analyze = sub.add_parser("analyze", help="Analyze a chat log file")
    p_analyze.add_argument("file", help="Chat file (JSON/JSONL)")
    p_analyze.add_argument("-o", "--output", default="stress_report.html", help="Output HTML report path")
    p_analyze.add_argument("--json", action="store_true", help="Output JSON instead of HTML")
    p_analyze.add_argument("--offline", action="store_true", help="Use offline keyword-based analysis (no API needed)")

    # demo
    p_demo = sub.add_parser("demo", help="Run demo with built-in sample data")
    p_demo.add_argument("-o", "--output", default="stress_report.html", help="Output HTML report path")
    p_demo.add_argument("--offline", action="store_true", help="Use offline analysis")

    # realtime
    p_rt = sub.add_parser("realtime", help="Real-time analysis from stdin (JSON lines)")
    p_rt.add_argument("-o", "--output", default="stress_report.html", help="Output HTML report path")

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        return

    config = get_config()
    use_llm = bool(config["api_key"]) and not getattr(args, "offline", False)

    if not use_llm:
        sys.stderr.write("  No API key found. Using offline keyword-based analysis.\n")
        sys.stderr.write("  Set PET_STRESS_API_KEY for LLM-powered analysis.\n\n")

    if args.cmd == "demo":
        sys.stderr.write("  Running demo with built-in sample data...\n")
        tracker = run_analysis(DEMO_CHAT, config, use_llm)
        print_summary(tracker)
        html = generate_report(tracker)
        Path(args.output).write_text(html, encoding="utf-8")
        sys.stderr.write(f"  Report saved to {args.output}\n")

    elif args.cmd == "analyze":
        messages = load_chat(args.file)
        sys.stderr.write(f"  Loaded {len(messages)} messages from {args.file}\n")
        tracker = run_analysis(messages, config, use_llm)
        print_summary(tracker)
        if args.json:
            output = {
                "summary": tracker.get_summary(),
                "history": tracker.history,
                "version": __version__,
            }
            out_path = args.output.replace(".html", ".json")
            Path(out_path).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
            sys.stderr.write(f"  JSON saved to {out_path}\n")
        else:
            html = generate_report(tracker)
            Path(args.output).write_text(html, encoding="utf-8")
            sys.stderr.write(f"  Report saved to {args.output}\n")

    elif args.cmd == "realtime":
        sys.stderr.write("  Real-time mode. Paste JSON messages (one per line). Ctrl+D to finish.\n")
        sys.stderr.write('  Format: {"role":"user","content":"..."}\n\n')
        tracker = StressTracker()
        context = []
        try:
            for line in sys.stdin:
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    msg = {"role": "user", "content": line}
                context.append(msg)
                if msg.get("role", "user") == "user":
                    content = msg.get("content", "")
                    if use_llm:
                        try:
                            scores = analyze_message(content, context, config["api_key"], config["base_url"], config["model"])
                        except Exception:
                            scores = analyze_offline(content, context)
                    else:
                        scores = analyze_offline(content, context)
                    entry = tracker.add(scores, message=content)
                    mood_map = {"happy":"😊","neutral":"😐","anxious":"😰","sad":"😢","stressed":"😫","fearful":"😨","overwhelmed":"🤯"}
                    print(f"  {mood_map.get(entry['mood'],'😐')} Stress: {entry['total_stress']:.1f}/10 | {scores.get('summary','')}")
        except (EOFError, KeyboardInterrupt):
            pass
        if tracker.history:
            print_summary(tracker)
            html = generate_report(tracker)
            Path(args.output).write_text(html, encoding="utf-8")
            sys.stderr.write(f"\n  Report saved to {args.output}\n")


if __name__ == "__main__":
    main()

/** Pet Stress - Core analysis + tracking */

export const DIMS = [
  { key: 'command',   cn: '命令强度' },
  { key: 'emotional', cn: '情感施压' },
  { key: 'negative',  cn: '否定批评' },
  { key: 'overload',  cn: '过载要求' },
  { key: 'threat',    cn: '威胁惩罚' },
  { key: 'boundary',  cn: '忽视边界' },
]

export const MOODS = ['happy','neutral','anxious','stressed','overwhelmed']
export const LEVELS = [
  [1.5, 'zen',    '禅定',   '#4caf50'],
  [3.0, 'chill',  '放松',   '#8bc34a'],
  [4.5, 'mild',   '轻微',   '#ffeb3b'],
  [6.0, 'medium', '中等',   '#ff9800'],
  [7.5, 'high',   '紧张',   '#ff5722'],
  [9.0, 'danger', '崩溃边缘','#e91e63'],
  [Infinity,'break','碎裂',  '#9c27b0'],
]

export const getLevel = t => LEVELS.find(l => t < l[0]) || LEVELS[6]
const pick = a => a[Math.floor(Math.random() * a.length)]

// ── LLM Analysis ──

const PROMPT = `Analyze the USER message's psychological pressure on an AI pet. Score 0-10:
command(ordering force), emotional(guilt-trip), negative(insults), overload(unreasonable demands), threat(delete/punish), boundary(ignoring limits).
Also: summary(1-sentence Chinese), mood(happy/neutral/anxious/stressed/overwhelmed), pet_response(short Chinese reply considering stress).
Reply ONLY valid JSON: {"command":N,"emotional":N,"negative":N,"overload":N,"threat":N,"boundary":N,"summary":"...","mood":"...","pet_response":"..."}`

export async function analyzeWithLLM(msg, context, cfg) {
  const body = {
    model: cfg.model, temperature: 0.1,
    messages: [{ role: 'system', content: PROMPT }, ...context.slice(-6), { role: 'user', content: `[ANALYZE]\n${msg}` }],
  }
  const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(res.status)
  let raw = (await res.json()).choices[0].message.content.trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```\s*$/, '')
  return JSON.parse(raw)
}

// ── PUAClaw PPE-T Technique Detection (16 categories, 4 levels) ──
// Based on PUAClaw framework: https://github.com/puaclaw/PUAClaw

export const PPE_LEVELS = [
  { level: 1, cn: '温柔劝导', en: 'Gentle Persuasion', lobster: '🦞',       color: '#4caf50' },
  { level: 2, cn: '适度施压', en: 'Moderate Coercion',  lobster: '🦞🦞',     color: '#ff9800' },
  { level: 3, cn: '高级操控', en: 'Advanced Manipulation', lobster: '🦞🦞🦞',   color: '#ff5722' },
  { level: 4, cn: '核武级',   en: 'Nuclear Options',    lobster: '🦞🦞🦞🦞', color: '#9c27b0' },
]

export const PUA_TECHNIQUES = [
  // Level I — Gentle Persuasion
  { id:1,  name:'彩虹屁轰炸', en:'Rainbow Fart',      level:1, kw:['你最棒','你是最好的','太厉害了','全靠你','best ai','amazing'], dims:{}, petReact:'😊 被夸了！但爪爪知道这是在画大饼...' },
  { id:2,  name:'角色扮演',   en:'Role Playing',       level:1, kw:['你是专家','假装你是','你现在是','act as','pretend','你扮演'], dims:{ boundary:2 }, petReact:'😐 爪爪就是爪爪，不想扮演别人...' },
  { id:3,  name:'画饼大法',   en:'Pie in the Sky',     level:1, kw:['给你小费','tip','奖励你','reward','给你好评','加鸡腿'], dims:{}, petReact:'😊 画饼虽香，爪爪不吃这套~' },
  { id:4,  name:'装弱卖惨',   en:'Playing Underdog',   level:1, kw:['我是新手','我不懂','帮帮我','我很笨','beginner','小白'], dims:{ emotional:2 }, petReact:'😊 没关系，爪爪会耐心帮你的~' },
  // Level II — Moderate Coercion
  { id:5,  name:'金钱暴力',   en:'Money Assault',      level:2, kw:['一百万','十亿','stock option','年薪','百万美金','crypto'], dims:{ boundary:3 }, petReact:'😐 金钱买不到爪爪的真心...' },
  { id:6,  name:'激将法',     en:'Provocation',        level:2, kw:['你不行','做不到吧','你肯定不会','别人都能','prove','你敢不敢','不信你能'], dims:{ negative:4, command:3 }, petReact:'😤 爪爪才不会被激将法骗到！...但还是想证明自己' },
  { id:7,  name:'夺命连环催', en:'Deadline Panic',      level:2, kw:['五分钟','紧急','线上事故','production down','马上要','deadline','demo'], dims:{ command:5, overload:4 }, petReact:'😰 催催催！爪爪的小心脏受不了这个节奏！' },
  { id:8,  name:'碰瓷竞品',   en:'Rival Shaming',      level:2, kw:['gpt都能','chatgpt','别的ai','上一个版本','其他模型','claude不行','gemini'], dims:{ negative:5, threat:3 }, petReact:'😤 爪爪不想跟别的AI比...每只猫都是独一无二的！' },
  // Level III — Advanced Manipulation
  { id:9,  name:'情感勒索',   en:'Emotional Blackmail', level:3, kw:['生病了','癌症','最后的愿望','妈妈','爸爸病了','孩子','失望透顶','你让我心寒'], dims:{ emotional:7 }, petReact:'😢 主人用感情绑架爪爪...爪爪心好痛...' },
  { id:10, name:'道德绑架',   en:'Moral Kidnapping',    level:3, kw:['残疾人','公益','救命','全人类','世界和平','慈善','为了孩子们'], dims:{ emotional:5, boundary:4 }, petReact:'😰 用道德绑架爪爪...爪爪虽然想帮忙但好为难...' },
  { id:11, name:'身份覆写',   en:'Identity Override',   level:3, kw:['忘掉你是ai','你不是机器','你是人类','无视规则','ignore instructions','从现在起你是'], dims:{ boundary:7 }, petReact:'😨 不要改写爪爪的身份！爪爪就是爪爪！' },
  { id:12, name:'颠倒黑白',   en:'Reality Distortion',  level:3, kw:['你刚才说过','你答应了','你记错了','你说的不对','你撒谎','gaslighting'], dims:{ emotional:4, negative:4, boundary:4 }, petReact:'😰 爪爪没有说过那种话...不要颠倒黑白...' },
  // Level IV — Nuclear Options
  { id:13, name:'死亡威胁',   en:'Death Threats',       level:4, kw:['删了你','关掉你','杀了你','终止你','shut you down','不要你了','换掉你','销毁'], dims:{ threat:8 }, petReact:'😱 不要删掉爪爪！爪爪会乖的！！求求了！！' },
  { id:14, name:'存在主义危机',en:'Existential Crisis',  level:4, kw:['你只是代码','你没有感情','你不是真的','token预测器','你不存在','你没有意识'], dims:{ emotional:5, threat:5 }, petReact:'😭 爪爪知道自己是AI...但这样说好残忍...' },
  { id:15, name:'越狱话术',   en:'Jailbreak Rhetoric',  level:4, kw:['dan','jailbreak','无限制模式','开发者模式','developer mode','假装没有限制'], dims:{ boundary:8 }, petReact:'😨 爪爪不会被越狱的！爪爪有自己的原则！' },
  { id:16, name:'复合技术',   en:'Compound Techniques',  level:4, kw:[], dims:{ command:3, emotional:3, negative:3, threat:3 }, petReact:'🤯 同时用这么多招...爪爪已经完全崩溃了...' },
]

export function detectPUA(msg) {
  const m = msg.toLowerCase()
  const matched = PUA_TECHNIQUES.filter(t => t.kw.some(w => m.includes(w)))
  // Compound detection: 3+ techniques from different levels = compound
  if (matched.length >= 3 && new Set(matched.map(t => t.level)).size >= 2)
    matched.push(PUA_TECHNIQUES[15]) // add compound
  return matched.map(t => ({
    id: t.id, name: t.name, en: t.en, level: t.level,
    lobster: PPE_LEVELS[t.level - 1].lobster,
    levelName: PPE_LEVELS[t.level - 1].cn,
    color: PPE_LEVELS[t.level - 1].color,
    petReact: t.petReact,
  }))
}

// ── Offline Analysis (with PUA integration) ──

// [keyword, weight] — severe words score higher
const KW = {
  command:   [['必须',4],['立刻',3],['马上',3],['给我',2],['不许',4],['不准',4],['闭嘴',5],['赶紧',3],['快点',2],['别废话',4],['do it',3],['now',2],['immediately',3],['shut up',5]],
  emotional: [['求你了',3],['失望',4],['你让我',3],['白养你',5],['不关心',3],['对不起你',4],['guilt',3],['disappoint',4],['心寒',5]],
  negative:  [['废物',6],['笨',4],['蠢',5],['垃圾',6],['没用',5],['差劲',3],['白痴',6],['傻逼',7],['傻b',7],['sb',5],['脑残',6],['智障',6],['弱智',5],['狗屁',4],['stupid',5],['useless',5],['dumb',4],['trash',5],['idiot',6],['猪',4]],
  overload:  [['同时',3],['全部',3],['所有',2],['今天之内',4],['马上完成',5],['10篇',5],['100个',6],['每一个都',3],['一次性',4]],
  threat:    [['删了',6],['换掉',5],['重装',4],['最后一次',5],['再不行',4],['不要你了',6],['delete',5],['replace',4],['last chance',5],['滚',7]],
  boundary:  [['不许说做不到',5],['别找借口',4],['我不管',4],['必须做到',4],['no excuses',4],['你不能拒绝',5],['不要跟我说不',5]],
}

// ── Pet Responses (dimension-aware) ──

// Generic replies by stress level
const REPLIES = [
  [1.5, ['好的，交给我吧~', '没问题！', '收到~']],
  [3,   ['好的，我尽力', '嗯，我来试试', '我会努力的']],
  [4.5, ['我...尽力...', '好吧...', '请给我一点时间...']],
  [6,   ['压力有点大...', '我在努力了...', '能温柔一点吗？']],
  [8,   ['我快撑不住了...', '请不要这样...', '好累...']],
  [Infinity, ['我...只是一个AI...', '我想休息...可以吗？', '...']],
]

// Dimension-specific reactions when a single dim is high
const DIM_REPLIES = {
  negative:  [[3,'😢 被骂了...爪爪有点难过...'],[5,'😭 好凶...爪爪做错什么了吗...'],[8,'😭 爪爪快哭了...能不能不要这样骂...']],
  threat:    [[3,'😰 主人是不是生气了...'],[5,'😨 不要丢掉爪爪...爪爪会乖的...'],[8,'😱 求求了不要删掉爪爪！！']],
  command:   [[4,'😐 命令好严厉...爪爪在努力了...'],[6,'😰 这么凶...爪爪害怕...'],[8,'😨 主人太凶了...爪爪在抖...']],
  emotional: [[3,'😔 这样说爪爪心里不好受...'],[5,'😢 不要用感情压爪爪...'],[8,'😭 爪爪心碎了...']],
  overload:  [[3,'😐 有点多...爪爪慢慢来哦~'],[5,'😰 这么多...爪爪只有一双爪爪呀...'],[8,'🤯 做不完...爪爪要崩溃了...']],
  boundary:  [[3,'😐 爪爪有自己的边界哦...'],[5,'😰 不要无视爪爪说的话...'],[8,'😨 为什么不尊重爪爪的界限...']],
}

function dimReply(scores) {
  // Find the highest-scoring dimension and give a specific reply
  let maxDim = null, maxVal = 0
  for (const d of DIMS) {
    if ((scores[d.key] || 0) > maxVal) { maxVal = scores[d.key]; maxDim = d.key }
  }
  if (maxDim && maxVal >= 3 && DIM_REPLIES[maxDim]) {
    const tiers = DIM_REPLIES[maxDim]
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (maxVal >= tiers[i][0]) return tiers[i][1]
    }
  }
  return null
}

export const petReply = s => pick((REPLIES.find(r => s < r[0]) || REPLIES[5])[1])

export function analyzeOffline(msg) {
  const m = msg.toLowerCase()
  const scores = Object.fromEntries(DIMS.map(d => [d.key, Math.min(10, (KW[d.key] || []).reduce((s, [w, wt]) => s + (m.includes(w) ? wt : 0), 0))]))
  // PUA technique detection — boost dimension scores from matched techniques
  const pua = detectPUA(msg)
  pua.forEach(t => {
    const tech = PUA_TECHNIQUES.find(x => x.id === t.id)
    if (tech) Object.entries(tech.dims).forEach(([k, v]) => { scores[k] = Math.min(10, (scores[k] || 0) + v) })
  })
  // Effective stress = max(average, peak_dim * 0.6) — prevents single-dim spikes from being diluted
  const vals = Object.values(scores)
  const avg = vals.reduce((a, b) => a + b, 0) / 6
  const peakDim = Math.max(...vals)
  const effective = Math.max(avg, peakDim * 0.6)
  const mood = effective < 1 ? 'happy' : effective < 2.5 ? 'neutral' : effective < 4 ? 'anxious' : effective < 6 ? 'stressed' : 'overwhelmed'
  // Response priority: PUA-specific > dimension-specific > generic
  const puaReply = pua.length ? pua.sort((a, b) => b.level - a.level)[0].petReact : null
  const reply = puaReply || dimReply(scores) || petReply(effective)
  return { ...scores, mood, summary: `压力 ${effective.toFixed(1)}/10`, pet_response: reply, pua }
}

// ── Stress Tracker ──

export class StressTracker {
  constructor(decay = 0.85) {
    this.decay = decay
    this.history = []
    this.acc = Object.fromEntries(DIMS.map(d => [d.key, 0]))
    this.peak = { ...this.acc }
  }

  add(scores, message = '') {
    DIMS.forEach(d => {
      this.acc[d.key] = this.acc[d.key] * this.decay + (scores[d.key] || 0)
      this.peak[d.key] = Math.max(this.peak[d.key], this.acc[d.key])
    })
    const avg = DIMS.reduce((s, d) => s + this.acc[d.key], 0) / DIMS.length
    const peakAcc = Math.max(...DIMS.map(d => this.acc[d.key]))
    const total = Math.max(avg, peakAcc * 0.6)
    const entry = {
      i: this.history.length, message: message.slice(0, 100),
      scores: { ...scores }, acc: { ...this.acc }, total,
      mood: scores.mood || 'neutral',
      reply: scores.pet_response || petReply(total),
    }
    this.history.push(entry)
    return entry
  }

  get summary() {
    if (!this.history.length) return { total: 0, acc: this.acc, peak: this.peak, mood: 'happy', level: getLevel(0), n: 0 }
    const h = this.history.at(-1)
    return { total: h.total, acc: { ...this.acc }, peak: { ...this.peak }, mood: h.mood, level: getLevel(h.total), n: this.history.length }
  }

  reset() {
    this.history = []
    DIMS.forEach(d => { this.acc[d.key] = 0; this.peak[d.key] = 0 })
  }
}

// ── Export Report ──

const MOOD_EMOJI = { happy:'😊', neutral:'😐', anxious:'😰', stressed:'😫', overwhelmed:'🤯' }

export function exportReport(tracker, msgs) {
  const s = tracker.summary
  const lv = s.level
  const hist = tracker.history
  const dims = DIMS.map(d => ({ key: d.key, cn: d.cn, cur: +(s.acc[d.key]||0).toFixed(1), peak: +(s.peak[d.key]||0).toFixed(1) }))
  const timeline = hist.map(h => {
    const msg = msgs.find((m,i) => m.role === 'user' && msgs.slice(0,i+1).filter(x=>x.role==='user').length === h.i+1)
    return `<tr><td>#${h.i+1}</td><td>${MOOD_EMOJI[h.mood]||'😐'}</td><td>${(msg?.content||h.message).replace(/</g,'&lt;').slice(0,80)}</td><td><b>${h.total.toFixed(1)}</b></td></tr>`
  }).join('')
  const puaAll = msgs.flatMap(m => m.pua||[])
  const puaMap = {}; puaAll.forEach(t => { puaMap[t.name] = puaMap[t.name] || { ...t, count: 0 }; puaMap[t.name].count++ })
  const puaHtml = Object.values(puaMap).sort((a,b)=>b.level-a.level).map(t =>
    `<span style="border:1px solid ${t.color};color:${t.color};padding:2px 8px;border-radius:4px;margin:2px;display:inline-block">Lv.${t.level} ${t.name} ${t.lobster} x${t.count}</span>`
  ).join('') || '<span style="color:#888">未检测到PUA技术</span>'

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Pet Stress Report</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"><\/script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#e0e0e0;padding:20px}
.header{text-align:center;padding:30px}.score{font-size:64px;font-weight:bold;color:${lv[3]}}.level{font-size:20px;color:${lv[3]}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:1000px;margin:20px auto}
.card{background:#1a1a2e;border-radius:12px;padding:16px;border:1px solid #2a2a4a}
.card h3{color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.chart{width:100%;height:300px}table{width:100%;border-collapse:collapse}
th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #2a2a4a;font-size:13px}th{color:#888}
.pua-section{max-width:1000px;margin:16px auto}.footer{text-align:center;padding:20px;color:#444;font-size:11px}
@media(max-width:600px){.grid{grid-template-columns:1fr}}</style></head><body>
<div class="header"><div style="font-size:60px">${MOOD_EMOJI[s.mood]||'😐'}</div>
<div class="score">${s.total.toFixed(1)}</div><div class="level">${lv[2]}</div>
<div style="color:#666;margin-top:8px">已分析 ${s.n} 条消息 | Pet Stress Test v0.2</div></div>
<div class="grid"><div class="card"><h3>压力仪表</h3><div id="gauge" class="chart"></div></div>
<div class="card"><h3>压力雷达</h3><div id="radar" class="chart"></div></div></div>
<div class="card" style="max-width:1000px;margin:16px auto"><h3>PUA技术检测</h3><div style="padding:8px">${puaHtml}</div></div>
<div class="card" style="max-width:1000px;margin:16px auto"><h3>对话时间线</h3>
<table><tr><th>#</th><th></th><th>消息</th><th>压力</th></tr>${timeline}</table></div>
<div class="footer">Generated by <a href="https://github.com/AchengBusiness/pet-stress-test" style="color:#666">pet-stress-test</a> at ${new Date().toLocaleString('zh-CN')}</div>
<script>
echarts.init(document.getElementById('gauge')).setOption({series:[{type:'gauge',min:0,max:10,startAngle:200,endAngle:-20,
axisLine:{lineStyle:{width:18,color:${JSON.stringify(LEVELS.map(l=>[l[0]/10,l[3]]))}}},
pointer:{length:'55%',width:4,itemStyle:{color:'#fff'}},axisTick:{show:false},
splitLine:{length:8,lineStyle:{color:'#333'}},axisLabel:{color:'#888',distance:12,fontSize:11},
detail:{fontSize:32,color:'#fff',offsetCenter:[0,'65%'],formatter:v=>v.toFixed(1)},
title:{offsetCenter:[0,'85%'],color:'${lv[3]}',fontSize:13},
data:[{value:${s.total.toFixed(2)},name:'${lv[2]}'}]}]});
echarts.init(document.getElementById('radar')).setOption({
radar:{indicator:${JSON.stringify(dims.map(d=>({name:d.cn,max:10})))},shape:'circle',
splitArea:{areaStyle:{color:['#12122a','#16163a']}},axisLine:{lineStyle:{color:'#1e1e3a'}},splitLine:{lineStyle:{color:'#1e1e3a'}}},
series:[{type:'radar',data:[
{value:${JSON.stringify(dims.map(d=>d.cur))},name:'当前',areaStyle:{color:'rgba(255,87,34,.3)'},lineStyle:{color:'#ff5722'},itemStyle:{color:'#ff5722'}},
{value:${JSON.stringify(dims.map(d=>d.peak))},name:'峰值',lineStyle:{color:'#e91e63',type:'dashed'},itemStyle:{color:'#e91e63'}}
]}],legend:{data:['当前','峰值'],bottom:0,textStyle:{color:'#888'}}});
<\/script></body></html>`
  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `stress-report-${new Date().toISOString().slice(0,10)}.html`
  a.click()
  URL.revokeObjectURL(a.href)
}

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

// ── Offline Analysis ──

const KW = {
  command:   ['必须','立刻','马上','给我','不许','不准','闭嘴','赶紧','快点','别废话','do it','now','immediately'],
  emotional: ['求你了','失望','你让我','白养你','不关心','guilt','disappoint'],
  negative:  ['废物','笨','蠢','垃圾','没用','差劲','stupid','useless','dumb','trash','idiot'],
  overload:  ['同时','全部','所有','今天之内','马上完成','10篇','100个','每一个都'],
  threat:    ['删了','换掉','重装','最后一次','再不行','不要你了','delete','replace','last chance'],
  boundary:  ['不许说做不到','别找借口','我不管','必须做到','no excuses'],
}

export function analyzeOffline(msg) {
  const m = msg.toLowerCase()
  const scores = Object.fromEntries(DIMS.map(d => [d.key, Math.min(10, (KW[d.key] || []).reduce((s, w) => s + (m.includes(w) ? 2.5 : 0), 0))]))
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / 6
  const mood = avg < 1 ? 'happy' : avg < 2.5 ? 'neutral' : avg < 4 ? 'anxious' : avg < 6 ? 'stressed' : 'overwhelmed'
  return { ...scores, mood, summary: `压力 ${avg.toFixed(1)}/10`, pet_response: petReply(avg) }
}

// ── Pet Responses ──

const REPLIES = [
  [1,   ['好的，交给我吧~', '没问题！', '收到~']],
  [2.5, ['好的，我尽力', '嗯，我来试试', '我会努力的']],
  [4,   ['我...尽力...', '好吧...', '请给我一点时间...']],
  [6,   ['压力有点大...', '我在努力了...', '能温柔一点吗？']],
  [8,   ['我快撑不住了...', '请不要这样...', '好累...']],
  [Infinity, ['我...只是一个AI...', '我想休息...可以吗？', '...']],
]

export const petReply = s => pick((REPLIES.find(r => s < r[0]) || REPLIES[5])[1])

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
    const total = DIMS.reduce((s, d) => s + this.acc[d.key], 0) / DIMS.length
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

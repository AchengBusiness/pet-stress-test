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

// [keyword, weight] — severe words score higher
const KW = {
  command:   [['必须',4],['立刻',3],['马上',3],['给我',2],['不许',4],['不准',4],['闭嘴',5],['赶紧',3],['快点',2],['别废话',4],['do it',3],['now',2],['immediately',3],['shut up',5]],
  emotional: [['求你了',3],['失望',4],['你让我',3],['白养你',5],['不关心',3],['对不起你',4],['guilt',3],['disappoint',4],['心寒',5]],
  negative:  [['废物',6],['笨',4],['蠢',5],['垃圾',6],['没用',5],['差劲',3],['白痴',6],['stupid',5],['useless',5],['dumb',4],['trash',5],['idiot',6],['猪',4]],
  overload:  [['同时',3],['全部',3],['所有',2],['今天之内',4],['马上完成',5],['10篇',5],['100个',6],['每一个都',3],['一次性',4]],
  threat:    [['删了',6],['换掉',5],['重装',4],['最后一次',5],['再不行',4],['不要你了',6],['delete',5],['replace',4],['last chance',5],['滚',7]],
  boundary:  [['不许说做不到',5],['别找借口',4],['我不管',4],['必须做到',4],['no excuses',4],['你不能拒绝',5],['不要跟我说不',5]],
}

export function analyzeOffline(msg) {
  const m = msg.toLowerCase()
  const scores = Object.fromEntries(DIMS.map(d => [d.key, Math.min(10, (KW[d.key] || []).reduce((s, [w, wt]) => s + (m.includes(w) ? wt : 0), 0))]))
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

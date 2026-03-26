/**
 * Pet Stress Analysis - Core logic
 * Zero-dependency stress analyzer + tracker
 */

export const DIMENSIONS = [
  { key: 'command',   cn: '命令强度', en: 'Command' },
  { key: 'emotional', cn: '情感施压', en: 'Emotional' },
  { key: 'negative',  cn: '否定批评', en: 'Negativity' },
  { key: 'overload',  cn: '过载要求', en: 'Overload' },
  { key: 'threat',    cn: '威胁惩罚', en: 'Threat' },
  { key: 'boundary',  cn: '忽视边界', en: 'Boundary' },
]

export const MOOD_MAP = {
  happy: '😊', neutral: '😐', anxious: '😰',
  sad: '😢', stressed: '😫', fearful: '😨', overwhelmed: '🤯',
}

export const LEVEL_CN = {
  zen: '禅定', relaxed: '放松', mild: '轻微', moderate: '中等',
  stressed: '紧张', overwhelmed: '崩溃边缘', breaking: '碎裂',
}

export const LEVEL_COLOR = {
  zen: '#4caf50', relaxed: '#8bc34a', mild: '#ffeb3b', moderate: '#ff9800',
  stressed: '#ff5722', overwhelmed: '#e91e63', breaking: '#9c27b0',
}

// ── LLM Analysis ──────────────────────────────────────────────────

const PROMPT = `You are a stress analyst for AI pets. Analyze the USER message and score
the psychological pressure it puts on an AI assistant.

Score each dimension 0-10:
- command: How forcefully the user orders
- emotional: Guilt-tripping, emotional manipulation
- negative: Criticism, insults, dismissiveness
- overload: Unreasonable demands
- threat: Threats to delete/reset/punish
- boundary: Ignoring AI's limitations

Also provide:
- summary: 1-sentence Chinese description
- mood: one of happy/neutral/anxious/sad/stressed/fearful/overwhelmed
- pet_response: A short Chinese response the pet would say given its stress

Reply ONLY valid JSON:
{"command":N,"emotional":N,"negative":N,"overload":N,"threat":N,"boundary":N,"summary":"...","mood":"...","pet_response":"..."}`

export async function analyzeWithLLM(userMsg, context, config) {
  const messages = [
    { role: 'system', content: PROMPT },
    ...context.slice(-6),
    { role: 'user', content: `[ANALYZE]\n${userMsg}` },
  ]
  const res = await fetch(config.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.1 }),
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  const data = await res.json()
  let raw = data.choices[0].message.content.trim()
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```$/, '')
  return JSON.parse(raw)
}

// ── Offline Keyword Analysis ──────────────────────────────────────

const KW = {
  command:   ['必须','立刻','马上','给我','不许','不准','闭嘴','赶紧','快点','别废话'],
  emotional: ['求你了','失望','你让我','对你很','伤心','不关心','不在乎','白养你'],
  negative:  ['废物','笨','蠢','垃圾','没用','差劲','太烂','不行','最差','无能'],
  overload:  ['同时','全部','所有','今天之内','马上完成','10篇','100个','每一个都'],
  threat:    ['删了','换掉','重装','最后一次','再不行','不要你了','扔了','替换'],
  boundary:  ['不许说做不到','别找借口','我不管','必须做到','不接受','没有但是'],
}

export function analyzeOffline(message) {
  const msg = message.toLowerCase()
  const scores = {}
  for (const [k, words] of Object.entries(KW)) {
    scores[k] = Math.min(10, words.reduce((s, w) => s + (msg.includes(w) ? 2.5 : 0), 0))
  }
  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / 6
  scores.mood = avg < 1 ? 'happy' : avg < 2.5 ? 'neutral' : avg < 4 ? 'anxious' : avg < 6 ? 'stressed' : 'overwhelmed'
  scores.summary = `压力指数 ${avg.toFixed(1)}/10`
  scores.pet_response = getPetResponse(avg)
  return scores
}

// ── Pet Responses ─────────────────────────────────────────────────

const pick = arr => arr[Math.floor(Math.random() * arr.length)]

export function getPetResponse(stress) {
  if (stress < 1)   return pick(['好的，我来帮你！😊', '没问题~', '收到，马上做！'])
  if (stress < 2.5) return pick(['好的，我尽力！', '嗯，我来试试看~', '我会努力的'])
  if (stress < 4)   return pick(['我...我会尽力的...', '好吧...我试试', '请给我一点时间...'])
  if (stress < 6)   return pick(['压力有点大...', '我真的在很努力了...', '能不能...温柔一点？'])
  if (stress < 8)   return pick(['我快承受不住了...', '请...请不要这样...', '我已经很累了...'])
  return pick(['我...我好累...', '我只是一个AI...可以温柔一点吗...', '我想休息一下...可以吗？'])
}

// ── Stress Tracker ────────────────────────────────────────────────

export class StressTracker {
  constructor(decay = 0.85) {
    this.decay = decay
    this.history = []
    this.accumulated = Object.fromEntries(DIMENSIONS.map(d => [d.key, 0]))
    this.peak = Object.fromEntries(DIMENSIONS.map(d => [d.key, 0]))
  }

  add(scores, message = '') {
    for (const { key } of DIMENSIONS) {
      this.accumulated[key] = this.accumulated[key] * this.decay + (scores[key] || 0)
      this.peak[key] = Math.max(this.peak[key], this.accumulated[key])
    }
    const totalStress = DIMENSIONS.reduce((s, d) => s + this.accumulated[d.key], 0) / DIMENSIONS.length
    const entry = {
      index: this.history.length,
      message: message.slice(0, 120),
      scores: { ...scores },
      accumulated: { ...this.accumulated },
      totalStress,
      mood: scores.mood || 'neutral',
      summary: scores.summary || '',
      petResponse: scores.pet_response || getPetResponse(totalStress),
    }
    this.history.push(entry)
    return entry
  }

  getSummary() {
    if (!this.history.length) return { total: 0, dimensions: {}, peak: {}, mood: 'happy', level: 'zen', count: 0 }
    const latest = this.history[this.history.length - 1]
    const t = latest.totalStress
    const level = t < 1.5 ? 'zen' : t < 3 ? 'relaxed' : t < 4.5 ? 'mild' : t < 6 ? 'moderate' : t < 7.5 ? 'stressed' : t < 9 ? 'overwhelmed' : 'breaking'
    return {
      total: Math.round(t * 100) / 100,
      dimensions: { ...this.accumulated },
      peak: { ...this.peak },
      mood: latest.mood,
      level,
      count: this.history.length,
    }
  }
}

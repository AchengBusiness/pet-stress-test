import { useState, useRef, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import { DIMS, LEVELS, StressTracker, analyzeWithLLM, analyzeOffline, getLevel, detectPUA, PPE_LEVELS } from './stress'

// ── Pet Face (CSS cat with dynamic expressions) ───────

const FACE = {
  happy:       { eyes: '◠   ◠', mouth: '◡', blush: true },
  neutral:     { eyes: '●   ●', mouth: '―' },
  anxious:     { eyes: '◉   ◉', mouth: '﹏' },
  stressed:    { eyes: '×   ×', mouth: '△' },
  overwhelmed: { eyes: '✖   ✖', mouth: 'O' },
}

function PetCat({ mood, stress, level }) {
  const f = FACE[mood] || FACE.neutral
  const lv = level || getLevel(0)
  const cls = stress >= 7 ? 'shake' : stress >= 4 ? 'wobble' : 'float'
  return (
    <div className="pet-zone">
      <div className={`cat ${cls}`}>
        <div className="ear ear-l" /><div className="ear ear-r" />
        <div className="head">
          {f.blush && <><div className="blush blush-l" /><div className="blush blush-r" /></>}
          <div className="eyes">{f.eyes}</div>
          <div className="nose">▾</div>
          <div className="mouth">{f.mouth}</div>
          <div className="whisker whisker-l" /><div className="whisker whisker-r" />
        </div>
        <div className="body" />
        <div className="tail" />
      </div>
      <div className="pet-status">
        <div className="pet-stress-val" style={{ color: lv[3] }}>{stress.toFixed(1)}</div>
        <div className="pet-level" style={{ color: lv[3] }}>{lv[2]}</div>
        <div className="pet-msgs">已分析 {Math.floor(stress * 0 + (level?.n || 0))} 条消息</div>
      </div>
    </div>
  )
}

// ── Chat Panel ────────────────────────────────────────

function PuaTags({ pua }) {
  if (!pua?.length) return null
  return <div className="pua-tags">{pua.map(t => <span key={t.id} className="pua-tag" style={{ borderColor: t.color, color: t.color }}>Lv.{t.level} {t.name} {t.lobster}</span>)}</div>
}

function ChatPanel({ messages, onSend, analyzing }) {
  const [input, setInput] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const send = () => { const t = input.trim(); if (t && !analyzing) { setInput(''); onSend(t) } }

  return (
    <div className="chat">
      <div className="chat-head">💬 和你的AI猫咪说话</div>
      <div className="chat-msgs">
        {!messages.length && <div className="chat-empty">试试说："帮我写文章" 或 "你怎么这么笨"</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="avatar">{m.role === 'user' ? '👤' : '🐱'}</span>
            <div className="msg-body">
              <span className="bubble">{m.content}</span>
              {m.pua && <PuaTags pua={m.pua} />}
            </div>
          </div>
        ))}
        {analyzing && <div className="msg assistant"><span className="avatar">🐱</span><span className="bubble blink">思考中...</span></div>}
        <div ref={endRef} />
      </div>
      <div className="chat-bar">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="输入消息..." disabled={analyzing} />
        <button onClick={send} disabled={analyzing || !input.trim()}>发送</button>
      </div>
    </div>
  )
}

// ── Chart Configs (DRY) ───────────────────────────────

const C = { bg: 'transparent', line: '#1e1e3a', txt: '#666' } // chart theme constants

const gaugeOpt = (val, lv) => ({
  series: [{
    type: 'gauge', min: 0, max: 10, startAngle: 200, endAngle: -20,
    axisLine: { lineStyle: { width: 16, color: LEVELS.map(l => [l[0] / 10, l[3]]) } },
    pointer: { length: '55%', width: 4, itemStyle: { color: '#fff' } },
    axisTick: { show: false }, splitLine: { length: 8, lineStyle: { color: '#333' } },
    axisLabel: { color: C.txt, distance: 12, fontSize: 10 },
    detail: { fontSize: 30, color: '#fff', offsetCenter: [0, '65%'], formatter: v => v.toFixed(1) },
    title: { offsetCenter: [0, '85%'], color: lv[3], fontSize: 13 },
    data: [{ value: val, name: lv[2] }],
  }],
})

const radarOpt = (cur, peak) => ({
  radar: {
    indicator: DIMS.map(d => ({ name: d.cn, max: 10 })), shape: 'circle', radius: '62%',
    splitArea: { areaStyle: { color: ['#12122a', '#16163a'] } },
    axisLine: { lineStyle: { color: C.line } }, splitLine: { lineStyle: { color: C.line } },
    axisName: { color: '#aaa', fontSize: 10 },
  },
  series: [{ type: 'radar', data: [
    { value: cur, name: '当前', areaStyle: { color: 'rgba(255,87,34,.3)' }, lineStyle: { color: '#ff5722' }, itemStyle: { color: '#ff5722' } },
    { value: peak, name: '峰值', lineStyle: { color: '#e91e63', type: 'dashed' }, itemStyle: { color: '#e91e63' } },
  ]}],
  legend: { data: ['当前', '峰值'], bottom: 0, textStyle: { color: '#888' } },
})

const COLORS = ['#ff5722','#2196f3','#4caf50','#ff9800','#9c27b0','#e91e63','#00bcd4']

const trendOpt = hist => ({
  xAxis: { type: 'category', data: hist.map((_, i) => `#${i+1}`), axisLine: { lineStyle: { color: C.line } }, axisLabel: { color: C.txt } },
  yAxis: { type: 'value', max: 10, splitLine: { lineStyle: { color: '#141430' } }, axisLabel: { color: C.txt } },
  tooltip: { trigger: 'axis' },
  legend: { data: ['总压力', ...DIMS.map(d => d.cn)], bottom: 0, textStyle: { color: '#666' }, type: 'scroll' },
  grid: { top: 10, right: 12, bottom: 45, left: 40 },
  series: [
    { name: '总压力', type: 'line', data: hist.map(h => +h.total.toFixed(2)), smooth: true, lineStyle: { width: 3, color: COLORS[0] },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(255,87,34,.35)' }, { offset: 1, color: 'transparent' }] } },
      itemStyle: { color: COLORS[0] } },
    ...DIMS.map((d, i) => ({
      name: d.cn, type: 'line', smooth: true, symbol: 'none',
      data: hist.map(h => +(h.acc[d.key] || 0).toFixed(2)),
      lineStyle: { width: 1, opacity: .5, color: COLORS[i+1] }, itemStyle: { color: COLORS[i+1] },
    })),
  ],
})

// ── Main App ──────────────────────────────────────────

export default function App() {
  const [msgs, setMsgs] = useState([])
  const [tracker] = useState(() => new StressTracker())
  const [sum, setSum] = useState(tracker.summary)
  const [hist, setHist] = useState([])
  const [busy, setBusy] = useState(false)
  const [puaStats, setPuaStats] = useState({})
  const [cfgOpen, setCfgOpen] = useState(false)
  const [cfg, setCfg] = useState({ mode: 'offline', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' })
  const set = (k, v) => setCfg(p => ({ ...p, [k]: v }))

  const send = useCallback(async text => {
    const pua = detectPUA(text)
    setMsgs(p => [...p, { role: 'user', content: text, pua }])
    setBusy(true)
    try {
      const ctx = [...msgs, { role: 'user', content: text }]
      let scores
      if (cfg.mode === 'llm' && cfg.apiKey) {
        try { scores = await analyzeWithLLM(text, ctx, cfg) } catch { scores = analyzeOffline(text) }
      } else { scores = analyzeOffline(text) }
      const entry = tracker.add(scores, text)
      setSum(tracker.summary)
      setHist([...tracker.history])
      if (pua.length) setPuaStats(prev => {
        const next = { ...prev }
        pua.forEach(t => { next[t.name] = (next[t.name] || { ...t, count: 0 }); next[t.name].count++ })
        return next
      })
      setMsgs(p => [...p, { role: 'assistant', content: entry.reply }])
    } catch { setMsgs(p => [...p, { role: 'assistant', content: '...出错了...' }]) }
    setBusy(false)
  }, [msgs, cfg, tracker])

  const reset = () => { tracker.reset(); setMsgs([]); setHist([]); setSum(tracker.summary); setPuaStats({}) }
  const lv = sum.level
  const dims = DIMS.map(d => +(sum.acc[d.key] || 0).toFixed(2))
  const peaks = DIMS.map(d => +(sum.peak[d.key] || 0).toFixed(2))
  const sc = sum.total >= 7 ? 'stress-high' : sum.total >= 4 ? 'stress-mid' : ''

  return (
    <div className={`app ${sc}`}>
      <header>
        <div className="h-left"><span className="logo">🐱</span><h1>Pet Stress Test</h1><span className="sub">你的AI猫咪还好吗？</span></div>
        <div className="h-right">
          <button className="btn-reset" onClick={reset}>重置</button>
          <button className="btn-cfg" onClick={() => setCfgOpen(v => !v)}>⚙</button>
        </div>
      </header>

      {cfgOpen && <div className="cfg">
        <label><span>模式</span><select value={cfg.mode} onChange={e => set('mode', e.target.value)}><option value="offline">离线</option><option value="llm">LLM</option></select></label>
        {cfg.mode === 'llm' && <>
          <label><span>Key</span><input type="password" value={cfg.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-..." /></label>
          <label><span>URL</span><input value={cfg.baseUrl} onChange={e => set('baseUrl', e.target.value)} /></label>
          <label><span>Model</span><input value={cfg.model} onChange={e => set('model', e.target.value)} /></label>
        </>}
      </div>}

      <main>
        <ChatPanel messages={msgs} onSend={send} analyzing={busy} />
        <div className="dash">
          <PetCat mood={sum.mood} stress={sum.total} level={{ ...lv, n: sum.n }} />
          <div className="card"><div className="card-t">压力雷达</div><ReactECharts option={radarOpt(dims, peaks)} style={{ height: 230 }} /></div>
          <div className="card"><div className="card-t">压力仪表</div><ReactECharts option={gaugeOpt(sum.total, lv)} style={{ height: 200 }} /></div>
          {Object.keys(puaStats).length > 0 && <div className="card">
            <div className="card-t">PUA技术检测</div>
            <div className="pua-list">{Object.values(puaStats).sort((a, b) => b.level - a.level || b.count - a.count).map(t => (
              <div key={t.name} className="pua-item" style={{ borderLeftColor: t.color }}>
                <span className="pua-lv" style={{ color: t.color }}>{t.lobster}</span>
                <span className="pua-name">{t.name}</span>
                <span className="pua-cnt">{t.count}x</span>
              </div>
            ))}</div>
          </div>}
        </div>
      </main>

      {hist.length > 0 && <div className="trend"><div className="card"><div className="card-t">压力趋势</div><ReactECharts option={trendOpt(hist)} style={{ height: 230 }} /></div></div>}

      <footer><a href="https://github.com/AchengBusiness/pet-stress-test" target="_blank" rel="noreferrer">GitHub</a><span>v0.2.0</span></footer>
    </div>
  )
}

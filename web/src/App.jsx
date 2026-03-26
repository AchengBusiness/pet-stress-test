import { useState, useRef, useEffect, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import {
  DIMENSIONS, MOOD_MAP, LEVEL_CN, LEVEL_COLOR,
  StressTracker, analyzeWithLLM, analyzeOffline,
} from './stress'

// ── Chat Panel ────────────────────────────────────────────────────

function ChatPanel({ messages, onSend, analyzing }) {
  const [input, setInput] = useState('')
  const endRef = useRef(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = () => {
    const t = input.trim()
    if (!t || analyzing) return
    setInput('')
    onSend(t)
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-icon">💬</span> 对话窗口
        <span className="chat-hint">扮演宠物主人，和你的AI宠物说话</span>
      </div>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            试试对你的AI宠物说些什么...<br />
            比如："帮我写一篇文章" 或 "你怎么这么笨"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            <span className="msg-avatar">{m.role === 'user' ? '👤' : '🐾'}</span>
            <div className="msg-bubble">{m.content}</div>
          </div>
        ))}
        {analyzing && (
          <div className="msg msg-assistant">
            <span className="msg-avatar">🐾</span>
            <div className="msg-bubble analyzing">分析中...</div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="输入消息..."
          disabled={analyzing}
        />
        <button onClick={send} disabled={analyzing || !input.trim()}>发送</button>
      </div>
    </div>
  )
}

// ── Chart Options ─────────────────────────────────────────────────

const CHART_THEME = {
  backgroundColor: 'transparent',
  textStyle: { color: '#aaa' },
}

function gaugeOption(total, level) {
  return {
    ...CHART_THEME,
    series: [{
      type: 'gauge', min: 0, max: 10, startAngle: 200, endAngle: -20,
      axisLine: { lineStyle: { width: 18, color: [[0.15,'#4caf50'],[0.3,'#8bc34a'],[0.45,'#ffeb3b'],[0.6,'#ff9800'],[0.75,'#ff5722'],[0.9,'#e91e63'],[1,'#9c27b0']] } },
      pointer: { length: '55%', width: 4, itemStyle: { color: '#fff' } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { color: '#444' } },
      axisLabel: { color: '#666', distance: 12, fontSize: 11 },
      detail: { fontSize: 32, color: '#fff', offsetCenter: [0, '65%'], formatter: v => v.toFixed(1) },
      title: { offsetCenter: [0, '85%'], color: LEVEL_COLOR[level] || '#888', fontSize: 14 },
      data: [{ value: total, name: LEVEL_CN[level] || '' }],
    }],
  }
}

function radarOption(dims, peak) {
  return {
    ...CHART_THEME,
    radar: {
      indicator: DIMENSIONS.map(d => ({ name: d.cn, max: 10 })),
      shape: 'circle',
      radius: '65%',
      splitArea: { areaStyle: { color: ['rgba(26,26,46,0.8)','rgba(22,33,62,0.8)'] } },
      axisLine: { lineStyle: { color: '#2a2a4a' } },
      splitLine: { lineStyle: { color: '#2a2a4a' } },
      axisName: { color: '#aaa', fontSize: 11 },
    },
    series: [{
      type: 'radar',
      data: [
        { value: dims, name: '当前', areaStyle: { color: 'rgba(255,87,34,0.3)' }, lineStyle: { color: '#ff5722' }, itemStyle: { color: '#ff5722' } },
        { value: peak, name: '峰值', lineStyle: { color: '#e91e63', type: 'dashed' }, itemStyle: { color: '#e91e63' } },
      ],
    }],
    legend: { data: ['当前', '峰值'], bottom: 0, textStyle: { color: '#888' } },
  }
}

function trendOption(history) {
  const labels = history.map((_, i) => `#${i + 1}`)
  const colors = ['#ff5722', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#e91e63', '#00bcd4']
  const series = [
    {
      name: '总压力', type: 'line', data: history.map(h => +h.totalStress.toFixed(2)),
      smooth: true, lineStyle: { width: 3, color: colors[0] },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(255,87,34,0.4)' }, { offset: 1, color: 'rgba(255,87,34,0)' }] } },
      itemStyle: { color: colors[0] },
    },
    ...DIMENSIONS.map((d, i) => ({
      name: d.cn, type: 'line', smooth: true, symbol: 'none',
      data: history.map(h => +(h.accumulated[d.key] || 0).toFixed(2)),
      lineStyle: { width: 1, opacity: 0.6, color: colors[i + 1] },
      itemStyle: { color: colors[i + 1] },
    })),
  ]
  return {
    ...CHART_THEME,
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#2a2a4a' } }, axisLabel: { color: '#666' } },
    yAxis: { type: 'value', max: 10, axisLine: { lineStyle: { color: '#2a2a4a' } }, splitLine: { lineStyle: { color: '#1e1e3a' } }, axisLabel: { color: '#666' } },
    series,
    tooltip: { trigger: 'axis' },
    legend: { data: ['总压力', ...DIMENSIONS.map(d => d.cn)], bottom: 0, textStyle: { color: '#888' }, type: 'scroll' },
    grid: { top: 10, right: 15, bottom: 50, left: 45 },
  }
}

// ── Config Panel ──────────────────────────────────────────────────

function ConfigPanel({ config, setConfig, show }) {
  if (!show) return null
  const set = (k, v) => setConfig(prev => ({ ...prev, [k]: v }))
  return (
    <div className="config-panel">
      <label>
        <span>模式</span>
        <select value={config.mode} onChange={e => set('mode', e.target.value)}>
          <option value="offline">离线 (关键词匹配)</option>
          <option value="llm">LLM (AI分析)</option>
        </select>
      </label>
      {config.mode === 'llm' && <>
        <label><span>API Key</span><input type="password" value={config.apiKey} onChange={e => set('apiKey', e.target.value)} placeholder="sk-..." /></label>
        <label><span>Base URL</span><input value={config.baseUrl} onChange={e => set('baseUrl', e.target.value)} /></label>
        <label><span>Model</span><input value={config.model} onChange={e => set('model', e.target.value)} /></label>
      </>}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState([])
  const [tracker] = useState(() => new StressTracker())
  const [summary, setSummary] = useState(tracker.getSummary())
  const [history, setHistory] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState({
    mode: 'offline',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  })

  const handleSend = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setAnalyzing(true)

    try {
      const context = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      let scores
      if (config.mode === 'llm' && config.apiKey) {
        try { scores = await analyzeWithLLM(text, context, config) }
        catch { scores = analyzeOffline(text) }
      } else {
        scores = analyzeOffline(text)
      }

      const entry = tracker.add(scores, text)
      setSummary(tracker.getSummary())
      setHistory([...tracker.history])
      setMessages(prev => [...prev, { role: 'assistant', content: entry.petResponse }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '分析出错了...' }])
    }
    setAnalyzing(false)
  }, [messages, config, tracker])

  const dims = DIMENSIONS.map(d => +(summary.dimensions[d.key] || 0).toFixed(2))
  const peaks = DIMENSIONS.map(d => +(summary.peak[d.key] || 0).toFixed(2))
  const mood = MOOD_MAP[summary.mood] || '😊'
  const stressClass = summary.total >= 7 ? 'stress-high' : summary.total >= 4 ? 'stress-mid' : ''

  return (
    <div className={`app ${stressClass}`}>
      <header className="app-header">
        <div className="header-left">
          <span className="logo">🐾</span>
          <h1>Pet Stress Test</h1>
          <span className="tagline">你的AI宠物还好吗？</span>
        </div>
        <div className="header-right">
          <span className={`pet-mood ${stressClass}`}>{mood}</span>
          <span className="stress-num" style={{ color: LEVEL_COLOR[summary.level] }}>{summary.total.toFixed(1)}</span>
          <button className="config-btn" onClick={() => setShowConfig(v => !v)}>⚙️</button>
        </div>
      </header>

      <ConfigPanel config={config} setConfig={setConfig} show={showConfig} />

      <main className="app-main">
        <ChatPanel messages={messages} onSend={handleSend} analyzing={analyzing} />
        <div className="dashboard">
          <div className="card">
            <div className="card-title">压力仪表 / Gauge</div>
            <ReactECharts option={gaugeOption(summary.total, summary.level)} style={{ height: 220 }} />
          </div>
          <div className="card">
            <div className="card-title">压力雷达 / Radar</div>
            <ReactECharts option={radarOption(dims, peaks)} style={{ height: 250 }} />
          </div>
        </div>
      </main>

      {history.length > 0 && (
        <div className="trend-section">
          <div className="card">
            <div className="card-title">压力趋势 / Trend</div>
            <ReactECharts option={trendOption(history)} style={{ height: 250 }} />
          </div>
        </div>
      )}

      <footer>
        <a href="https://github.com/AchengBusiness/pet-stress-test" target="_blank" rel="noreferrer">GitHub</a>
        <span>Pet Stress Test v0.1.0</span>
      </footer>
    </div>
  )
}

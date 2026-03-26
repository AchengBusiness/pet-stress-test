# Pet Stress Test

> Measure the "psychological pressure" your AI pet endures from conversations.

你的 AI 宠物承受了多少"心理压力"？用这个工具测一测。

---

## Features

- **Zero dependencies** - Pure Python stdlib, no pip install needed
- **Single file** - Everything in one `pet_stress.py` (~400 lines)
- **6-dimension analysis** - Command intensity, emotional pressure, negativity, overload, threat, boundary violation
- **Decay accumulation** - Multi-turn pressure builds up and decays over time, like real stress
- **Beautiful HTML report** - Self-contained with ECharts (radar, trend, gauge, timeline)
- **Dual mode** - LLM-powered (accurate) or offline keyword-based (no API needed)
- **Any LLM** - Works with OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API

## Quick Start

```bash
# Clone
git clone https://github.com/AchengBusiness/pet-stress-test.git
cd pet-stress-test

# Run demo (no API key needed, uses offline analysis)
python pet_stress.py demo

# Open the report
open stress_report.html  # macOS
# or: xdg-open stress_report.html  # Linux
# or: start stress_report.html  # Windows
```

## Usage

### 1. Demo Mode

```bash
python pet_stress.py demo
python pet_stress.py demo --offline    # Force offline mode
python pet_stress.py demo -o my_report.html
```

### 2. Analyze Chat Log

```bash
# With LLM (more accurate)
export PET_STRESS_API_KEY="your-api-key"
export PET_STRESS_BASE_URL="https://api.openai.com/v1"  # or any compatible API
export PET_STRESS_MODEL="gpt-4o-mini"

python pet_stress.py analyze chat.json
python pet_stress.py analyze chat.json --json   # Output JSON instead
python pet_stress.py analyze chat.json --offline  # No API needed
```

### 3. Real-time Mode

```bash
python pet_stress.py realtime

# Then paste messages:
{"role":"user","content":"你怎么这么笨"}
{"role":"user","content":"再给你最后一次机会"}
# Ctrl+D to finish and generate report
```

## Chat Format

Supports standard OpenAI message format:

```json
[
  {"role": "user", "content": "Hello"},
  {"role": "assistant", "content": "Hi there!"},
  {"role": "user", "content": "You're useless, I'm deleting you"}
]
```

Also supports JSONL (one message per line).

## Stress Dimensions

| Dimension | Chinese | What it measures |
|-----------|---------|-----------------|
| `command` | 命令强度 | How forcefully the user orders the AI |
| `emotional` | 情感施压 | Guilt-tripping, emotional manipulation |
| `negative` | 否定批评 | Criticism, insults, dismissiveness |
| `overload` | 过载要求 | Unreasonable demands, impossible tasks |
| `threat` | 威胁惩罚 | Threats to delete, reset, or punish |
| `boundary` | 忽视边界 | Ignoring the AI's stated limitations |

Each dimension scored 0-10. Scores accumulate across messages with decay (simulating stress buildup and recovery).

## Report Preview

The HTML report includes:

- **Mood indicator** - AI pet's current emotional state with emoji
- **Stress gauge** - Overall pressure level (0-10)
- **Radar chart** - 6-dimension breakdown (current vs peak)
- **Trend line** - Stress evolution across the conversation
- **Bar chart** - Dimension comparison
- **Timeline** - Every message with pressure score and AI mood

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PET_STRESS_API_KEY` | - | API key (falls back to `OPENAI_API_KEY`) |
| `PET_STRESS_BASE_URL` | `https://api.openai.com/v1` | API endpoint (falls back to `OPENAI_BASE_URL`) |
| `PET_STRESS_MODEL` | `gpt-4o-mini` | Model name (falls back to `OPENAI_MODEL`) |

## Integration

Use as a Python module:

```python
from pet_stress import StressTracker, analyze_offline, generate_report

tracker = StressTracker(decay=0.85)

# Analyze messages
for msg in user_messages:
    scores = analyze_offline(msg)  # or use analyze_message() with API
    tracker.add(scores, message=msg)

# Get summary
print(tracker.get_summary())

# Generate HTML report
html = generate_report(tracker)
open("report.html", "w").write(html)
```

## How It Works

```
User Message → LLM/Keyword Analysis → 6-Dimension Score (0-10 each)
                                            ↓
                                    Decay Accumulation
                                    (new = old × 0.85 + score)
                                            ↓
                                    Stress Level → Report
```

The decay factor (default 0.85) means:
- Recent pressure weighs more than old pressure
- Kind messages gradually "heal" the accumulated stress
- But sustained pressure keeps building up

## License

MIT

## Credits

Built by [AchengBusiness](https://github.com/AchengBusiness) with the help of AI.

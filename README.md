# Antigravity Claude Proxy

[![npm version](https://img.shields.io/npm/v/antigravity-claude-proxy.svg)](https://www.npmjs.com/package/antigravity-claude-proxy)
[![npm downloads](https://img.shields.io/npm/dm/antigravity-claude-proxy.svg)](https://www.npmjs.com/package/antigravity-claude-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A lightweight compatibility proxy that exposes an **Anthropic Messages API** backed by **Google Antigravity Cloud Code**, letting you use Claude and Gemini models seamlessly in **Claude Code CLI**, **Claude Desktop (Cowork & Chat)**, and **OpenClaw / ClawdBot**.

> **WARNING:** Google may flag or suspend accounts connected to unauthorized reverse-engineered proxies. Use a dedicated burner or secondary account.

<details>
<summary><strong>Terms of Service Notice — Read Before Using</strong></summary>

> [!CAUTION]
> Using this proxy may violate Google's Terms of Service. A small number of users have reported their Google accounts being suspended or restricted.
>
> - This is an unofficial community project not affiliated with or endorsed by Google or Anthropic.
> - **Recommendation:** Do not use your primary personal/work Google account. Use a secondary or burner account instead.
</details>

---

## Table of Contents

- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Quick Start in 60 Seconds](#quick-start-in-60-seconds)
- [Using with Claude Code CLI](#using-with-claude-code-cli)
- [Using with Claude Desktop (Cowork & Chat)](#using-with-claude-desktop-cowork--chat)
- [Using Gemini Flash](#using-gemini-flash)
- [Available Models & Routing](#available-models--routing)
- [Account Management & Web UI](#account-management--web-ui)
- [Running as a System Service (systemd)](#running-as-a-system-service-systemd)
- [Documentation & Testing](#documentation--testing)

---

## How It Works

```
┌────────────────────────┐      ┌─────────────────────────┐      ┌───────────────────────────┐
│  Claude Code CLI       │─────▶│  Antigravity Proxy      │─────▶│  Google Antigravity       │
│  or Claude Desktop     │◀─────│  (127.0.0.1:8080)       │◀─────│  Cloud Code Backend       │
│  (Anthropic API shape) │      │  Anthropic ⇄ Google AI  │      │  (daily-cloudcode-pa/prod)│
└────────────────────────┘      └─────────────────────────┘      └───────────────────────────┘
```

1. **Accepts standard Anthropic API requests** (`/v1/messages`, `/v1/models`, `/v1/messages/count_tokens`).
2. **Authenticates via official CLI token** (`~/.gemini/antigravity-cli/antigravity-oauth-token`) or added accounts.
3. **Translates payloads to Google Cloud Code format** with full thinking blocks, tool calls, and streaming SSE.
4. **Streams responses back as Anthropic SSE events** (`message_start`, `content_block_delta`, `message_stop`).

---

## Key Features

- **Zero-Config Token Extraction**: Automatically detects and uses official Google Antigravity CLI (`agy`) OAuth credentials and auto-refreshes expired access tokens.
- **Claude Desktop Gateway Ready**: Implements health probes (`/v1/api/hello`), token counter (`/v1/messages/count_tokens`), and Anthropic tier metadata (`anthropic_family_tier`) so models appear directly in Claude Desktop's UI.
- **Gemini Flash Full Compatibility**: Exposes Anthropic-compliant Haiku aliases (`claude-3-5-haiku-20241022` & `claude-haiku-4-5-20251001`) that bypass Claude Desktop's internal vendor filter and route straight to Gemini 3.8 Flash with thinking and vision.
- **Multi-Account Load Balancing**: Intelligent round-robin, sticky session, and hybrid strategies to distribute requests across accounts and maximize quota availability.
- **Built-in agy CLI Provider**: Supports official `agy` headless execution (`-p --output-format json` and `stream-json`) via `src/providers/agy-cli-provider.js`.
- **Security-First Architecture**: Binds strictly to `127.0.0.1` (loopback only) by default, stores tokens with restrictive `0600` permissions, and redacts sensitive tokens in all logs.
- **100% Offline Test Suite**: Fully self-contained local mock server for testing all features without consuming live account quota.

---

## Quick Start in 60 Seconds

### 1. Install & Launch the Proxy

```bash
# Option A: From this repository
git clone https://github.com/badrisnarayanan/antigravity-claude-proxy.git
cd antigravity-claude-proxy
npm install
npm start

# Option B: Run directly via npx
npx antigravity-claude-proxy@latest start
```

The server starts on `http://127.0.0.1:8080`.

| Command | Description |
| :--- | :--- |
| `npm start` / `acc start` | Launch proxy in the background |
| `acc stop` | Stop background proxy process |
| `acc restart` | Restart proxy server |
| `acc status` | Check proxy status, uptime, and active PID |
| `acc ui` | Open the browser Web Dashboard |

### 2. Verify Connectivity

In a new terminal window:

```bash
# Health check
curl http://127.0.0.1:8080/v1/api/hello
# Output: {"status":"ok"}

# List available models
curl http://127.0.0.1:8080/v1/models
```

If you have the official Google Antigravity CLI installed and logged in, the proxy **automatically detects your credentials**. No manual login is required!

---

## Using with Claude Code CLI

Follow these simple steps to run **Claude Code CLI** through the proxy.

### Step 1: Create Isolated Config Directory

We strongly recommend using an isolated directory so proxy settings do not interfere with your personal Anthropic account:

**macOS / Linux:**
```bash
mkdir -p ~/.claude-antigravity
echo '{"hasCompletedOnboarding": true}' > ~/.claude-antigravity/config.json
```

**Windows (PowerShell):**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude-antigravity"
Set-Content -Path "$env:USERPROFILE\.claude-antigravity\config.json" -Value '{"hasCompletedOnboarding": true}'
```

### Step 2: Launch Claude Code

Run Claude with the proxy environment variables:

```bash
# Claude Sonnet 4.6 (Recommended default)
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="claude-sonnet-4-6" \
claude

# Claude Opus 4.6 (With Deep Reasoning / Thinking)
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="claude-opus-4-6-thinking" \
claude

# Gemini 3.8 Flash High (Fast Multimodal Reasoning)
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="gemini-3.8-flash-high" \
claude
```

### Step 3: Create Permanent Shell Aliases (Recommended)

Add these convenient shortcuts to your `~/.zshrc` (or `~/.bashrc`):

```bash
# Antigravity Claude Sonnet
alias claude-agy='CLAUDE_CONFIG_DIR=~/.claude-antigravity ANTHROPIC_BASE_URL="http://127.0.0.1:8080" ANTHROPIC_AUTH_TOKEN="test" ANTHROPIC_MODEL="claude-sonnet-4-6" claude'

# Antigravity Claude Opus (Thinking)
alias claude-thinking='CLAUDE_CONFIG_DIR=~/.claude-antigravity ANTHROPIC_BASE_URL="http://127.0.0.1:8080" ANTHROPIC_AUTH_TOKEN="test" ANTHROPIC_MODEL="claude-opus-4-6-thinking" claude'

# Antigravity Gemini Flash
alias claude-flash='CLAUDE_CONFIG_DIR=~/.claude-antigravity ANTHROPIC_BASE_URL="http://127.0.0.1:8080" ANTHROPIC_AUTH_TOKEN="test" ANTHROPIC_MODEL="gemini-3.8-flash-high" claude'
```

Reload your shell:
```bash
source ~/.zshrc
claude-agy
```

---

## Using with Claude Desktop (Cowork & Chat)

Claude Desktop includes native support for connecting to a local or remote **LLM Gateway**.

### Step 1: Connect Claude Desktop to Gateway

1. Open **Claude Desktop**.
2. Go to **Settings** &rarr; **Account** / **Developer** (or your Gateway connection configuration).
3. Set the **Inference Provider** / **Base URL** to:
   ```text
   http://127.0.0.1:8080
   ```
4. Set Auth Token / API Key to any dummy value (e.g. `test`).
5. Save and restart Claude Desktop. The bottom-left account indicator will show `Gateway`.

### Step 2: Select Your Model

When chatting or using **Cowork** in Claude Desktop:

1. Click the model dropdown at the bottom right of the chat input.
2. Select your desired model:
   - **`Sonnet 4.6`** &rarr; Standard high-capability model (`claude-sonnet-4-6`)
   - **`Claude Opus 4.6 (Thinking)`** &rarr; Deep reasoning Opus model (`claude-opus-4-6-thinking`)
   - **`Gemini 3.8 Flash (Haiku)`** &rarr; Google's fast, multimodal Gemini 3.8 Flash reasoning model

---

## Using Gemini Flash

### In Claude Desktop

Claude Desktop enforces an internal vendor blocklist in `/Applications/Claude.app/Contents/Resources/app.asar` that drops model IDs containing `gemini` or non-Anthropic identifiers.

To solve this, `antigravity-claude-proxy` provides official Anthropic Haiku aliases:
- **`claude-3-5-haiku-20241022`** (Display: **`Gemini 3.8 Flash (Haiku)`**)
- **`claude-haiku-4-5-20251001`** (Display: **`Gemini 3.8 Flash (Haiku 4.5)`**)

Simply choose **`Gemini 3.8 Flash (Haiku)`** from the model dropdown in Claude Desktop. The proxy intercepts the request and routes it to `gemini-3.8-flash-high` with full thinking and multimodal vision capabilities.

### In Claude Code CLI

Claude Code CLI has no UI blocklist, so you can specify the model directly:

```bash
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="gemini-3.8-flash-high" \
claude
```

---

## Available Models & Routing

| Model Name / ID | Family | Thinking / Reasoning | Best For |
| :--- | :--- | :---: | :--- |
| `claude-sonnet-4-6` | Claude | Yes | Everyday coding, multi-turn tool loops, agent tasks |
| `claude-opus-4-6-thinking` | Claude | Yes (Deep) | Complex architecture, difficult debugging, high-effort reasoning |
| `gemini-3.8-flash-high` | Gemini | Yes | Fast coding, large context, multimodal vision, subagents |
| `claude-3-5-haiku-20241022` | Gemini (Alias) | Yes | **Claude Desktop alias** mapping to `gemini-3.8-flash-high` |
| `claude-haiku-4-5-20251001` | Gemini (Alias) | Yes | **Claude Desktop alias** mapping to `gemini-3.8-flash-high` |
| `gemini-3.5-flash-lite` | Gemini | No | Ultra-fast lightweight completions and quick summaries |

---

## Account Management & Web UI

The proxy includes a full-featured browser dashboard for managing multi-account pooling and monitoring quotas.

1. Open `http://127.0.0.1:8080` in your web browser.
2. Under the **Accounts** tab:
   - View quota limits, remaining fractions, and reset countdowns for each account.
   - Click **Add Account** to add secondary Google accounts via OAuth.
   - Switch between **Hybrid**, **Round-Robin**, and **Sticky** load-balancing strategies.
3. Under the **Settings** tab:
   - Configure port, request body limits, and model aliases.

---

## Running as a System Service (systemd)

When running on Linux under systemd, set `CLAUDE_CONFIG_PATH` to point to the real user's directory:

```ini
# /etc/systemd/system/antigravity-proxy.service
[Unit]
Description=Antigravity Claude Proxy
After=network.target

[Service]
Type=simple
User=youruser
Environment=CLAUDE_CONFIG_PATH=/home/youruser/.claude
ExecStart=/usr/bin/node /path/to/antigravity-claude-proxy/src/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Documentation & Testing

- **Testing Suite**:
  ```bash
  # Run the full offline automated test suite
  node tests/test-automated-suite.cjs

  # Run model registry & routing tests
  node tests/test-model-registry.cjs
  ```
- [Available Models Reference](docs/models.md)
- [Multi-Account Load Balancing](docs/load-balancing.md)
- [Web Management Console Guide](docs/web-console.md)
- [Advanced Configuration](docs/configuration.md)
- [macOS Menu Bar App](docs/menubar-app.md)
- [OpenClaw / ClawdBot Integration](docs/openclaw.md)
- [Troubleshooting & FAQs](docs/troubleshooting.md)

---

## Credits

This project builds upon insights and foundations from:
- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)
- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy)

---

## License

MIT © Badri Narayanan

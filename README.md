# Antigravity Claude Proxy

[![npm version](https://img.shields.io/npm/v/antigravity-claude-proxy.svg)](https://www.npmjs.com/package/antigravity-claude-proxy)
[![npm downloads](https://img.shields.io/npm/dm/antigravity-claude-proxy.svg)](https://www.npmjs.com/package/antigravity-claude-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A proxy server that exposes an **Anthropic-compatible API** backed by **Antigravity's Cloud Code**, letting you use Claude and Gemini models with **Claude Code CLI** and **OpenClaw / ClawdBot**.

![Antigravity Claude Proxy Banner](images/banner.png)

> **⚠️ WARNING:** Google has been issuing ToS violation bans on accounts connected to this proxy. Use at your own risk.

<details>
<summary><strong>⚠️ Terms of Service Warning — Read Before Installing</strong></summary>

> [!CAUTION]
> Using this proxy may violate Google's Terms of Service. A small number of users have reported their Google accounts being **banned** or **shadow-banned** (restricted access without explicit notification).
>
> **By using this proxy, you acknowledge:**
> - This is an unofficial tool not endorsed by Google
> - Your account may be suspended or permanently banned
> - You assume all risks associated with using this proxy
>
> **Recommendation:** Do not use your main account. Use a burner account instead, and optionally add it to your main account's family plan if needed.

</details>

---

## How It Works

```
┌──────────────────┐     ┌─────────────────────┐     ┌────────────────────────────┐
│   Claude Code    │────▶│  This Proxy Server  │────▶│  Antigravity Cloud Code    │
│   (Anthropic     │     │  (Anthropic → Google│     │  (daily-cloudcode-pa.      │
│    API format)   │     │   Generative AI)    │     │   sandbox.googleapis.com)  │
└──────────────────┘     └─────────────────────┘     └────────────────────────────┘
```

1. Receives requests in **Anthropic Messages API format**
2. Uses OAuth tokens from added Google accounts (or Antigravity's local database)
3. Transforms to **Google Generative AI format** with Cloud Code wrapping
4. Sends to Antigravity's Cloud Code API
5. Converts responses back to **Anthropic format** with full thinking/streaming support

### Key Features & Official CLI Integration
- **Official CLI Credentials**: Automatically detects and uses Google Antigravity CLI (`agy`) credentials from `~/.gemini/antigravity-cli/antigravity-oauth-token`.
- **Automatic Token Lifecycle**: Seamlessly auto-refreshes OAuth access tokens against Google OAuth servers before expiry.
- **Claude Desktop & Harness Compatibility**: Implements `/v1/api/hello`, `/v1/messages/count_tokens`, route aliases (`/messages`, `/models`), and URL normalization.
- **Headless & ACP Provider**: Built-in support for official `agy` headless execution (`-p --output-format json` and stream-json) via `src/providers/agy-cli-provider.js`.
- **Secure by Default**: Binds to `127.0.0.1` (loopback only) with `0600` credential file permissions to prevent LAN exposure.
- **100% Offline Test Suite**: Self-contained mock upstream server for deterministic testing without consuming production quotas.

## Prerequisites

- **Node.js** 18 or later
- **Antigravity** installed (for single-account mode) OR Google account(s) for multi-account mode

---

## Installation

### Option 1: npm (Recommended)

```bash
# Run directly with npx (no install needed)
npx antigravity-claude-proxy@latest start

# Or install globally
npm install -g antigravity-claude-proxy@latest
antigravity-claude-proxy start
```

### Option 2: Clone Repository

```bash
git clone https://github.com/badri-s2001/antigravity-claude-proxy.git
cd antigravity-claude-proxy
npm install
npm start
```

---

## Quick Start

### 1. Start the Proxy Server

```bash
# If installed globally
acc start
# or: antigravity-claude-proxy start

# If using npx
npx antigravity-claude-proxy@latest start

# If cloned locally
npm start
```

The server launches as a **background process** on `http://localhost:8080` by default and survives terminal closure.

| Command | Description |
| :--- | :--- |
| `acc start` | Launch proxy in the background |
| `acc stop` | Shut down the proxy |
| `acc restart` | Restart the proxy |
| `acc status` | Check proxy health and PID |
| `acc ui` | Open the web dashboard |
| `acc start --log` | Run in foreground with visible logs |

### 2. Link Account(s)

Choose one of the following methods to authorize the proxy:

#### **Method A: Web Dashboard (Recommended)**

1. With the proxy running, open `http://localhost:8080` in your browser.
2. Navigate to the **Accounts** tab and click **Add Account**.
3. Complete the Google OAuth authorization in the popup window.

> **Headless/Remote Servers**: If running on a server without a browser, the WebUI supports a "Manual Authorization" mode. After clicking "Add Account", you can copy the OAuth URL, complete authorization on your local machine, and paste the authorization code back.

#### **Method B: CLI (Desktop or Headless)**

If you prefer the terminal or are on a remote server:

```bash
# Desktop (opens browser)
antigravity-claude-proxy accounts add

# Headless (Docker/SSH)
antigravity-claude-proxy accounts add --no-browser
```

> For full CLI account management options, run `antigravity-claude-proxy accounts --help`.

#### **Method C: Automatic (Antigravity Users)**

If you have the **Antigravity** app installed and logged in, the proxy will automatically detect your local session. No additional setup is required.

To use a custom port:

```bash
PORT=3001 antigravity-claude-proxy start
```

### 3. Verify It's Working

```bash
# Health check
curl http://localhost:8080/health

# Check account status and quota limits
curl "http://localhost:8080/account-limits?format=table"
```

---

## Using with Claude Code CLI

### Configure Claude Code

You can configure these settings in two ways:

#### **Via Web Console (Recommended)**

1. Open the WebUI at `http://localhost:8080`.
2. Go to **Settings** → **Claude CLI**.
3. Use the **Connection Mode** toggle to switch between:
   - **Proxy Mode**: Uses the local proxy server (Antigravity Cloud Code). Configure models, base URL, and presets here.
   - **Paid Mode**: Uses the official Anthropic Credits directly (requires your own subscription). This hides proxy settings to prevent accidental misconfiguration.
4. Click **Apply to Claude CLI** to save your changes.

> [!TIP] > **Configuration Precedence**: System environment variables (set in shell profile like `.zshrc`) take precedence over the `settings.json` file. If you use the Web Console to manage settings, ensure you haven't manually exported conflicting variables in your terminal.

#### **Manual Configuration**

Create or edit the Claude Code settings file:

**macOS:** `~/.claude/settings.json`
**Linux:** `~/.claude/settings.json`
**Windows:** `%USERPROFILE%\.claude\settings.json`

Add this configuration:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:8080",
    "ANTHROPIC_MODEL": "claude-opus-4-6-thinking",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6-thinking",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-sonnet-4-6",
    "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-4-6",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  }
}
```

Or to use Gemini models:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:8080",
    "ANTHROPIC_MODEL": "gemini-3.1-pro-low",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "gemini-3.1-pro-low",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "gemini-3.5-flash-low",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gemini-3.5-flash-low",
    "CLAUDE_CODE_SUBAGENT_MODEL": "gemini-3.5-flash-low",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  }
}
```

### Load Environment Variables

Add the proxy settings to your shell profile:

**macOS / Linux:**

```bash
echo 'export ANTHROPIC_BASE_URL="http://localhost:8080"' >> ~/.zshrc
echo 'export ANTHROPIC_AUTH_TOKEN="test"' >> ~/.zshrc
source ~/.zshrc
```

> For Bash users, replace `~/.zshrc` with `~/.bashrc`

**Windows (PowerShell):**

```powershell
Add-Content $PROFILE "`n`$env:ANTHROPIC_BASE_URL = 'http://localhost:8080'"
Add-Content $PROFILE "`$env:ANTHROPIC_AUTH_TOKEN = 'test'"
. $PROFILE
```

**Windows (Command Prompt):**

```cmd
setx ANTHROPIC_BASE_URL "http://localhost:8080"
setx ANTHROPIC_AUTH_TOKEN "test"
```

Restart your terminal for changes to take effect.

### How to Test and Run with Claude Code

The proxy exposes a fully compatible Anthropic Messages API (`/v1/messages`, `/v1/models`, `/v1/messages/count_tokens`) and automatically detects your Google Antigravity credentials.

Follow these steps to connect **Claude Code CLI** to the proxy:

#### Step 1: Start the Proxy Server

```bash
# From this repository:
npm start

# Or if installed globally / via npx:
antigravity-claude-proxy start
```

The server binds securely to `127.0.0.1:8080` (loopback only) and automatically extracts credentials from `~/.gemini/antigravity-cli/antigravity-oauth-token` (or your configured accounts):

```text
[AccountManager] Loaded default account from official CLI token: ...
[AccountManager] Using Hybrid selection strategy
[Startup] Proxy running on http://127.0.0.1:8080
```

#### Step 2: Quick Connectivity Sanity Check (Optional)

In another terminal, test that the proxy is responding:

```bash
curl http://127.0.0.1:8080/v1/api/hello
# Output: {"status":"ok"}

curl http://127.0.0.1:8080/v1/models
# Output: {"object":"list","data":[{"id":"claude-sonnet-4-6",...}]}
```

#### Step 3: Launch Claude Code Connected to the Proxy

Run `claude` with the proxy environment variables. We recommend setting `CLAUDE_CONFIG_DIR=~/.claude-antigravity` so your proxy session is completely isolated from your official Anthropic account:

```bash
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="claude-sonnet-4-6" \
claude
```

#### Step 4: First-Time Onboarding Setup (If Prompted)

If Claude Code asks you to select an authentication method or sign in through a browser, cancel with `Ctrl+C` and bypass the onboarding check for this isolated directory:

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

#### Step 5: Test Model Reasoning & Tool Execution

Once Claude Code starts:
1. **Chat & Coding**: Ask a coding question or explain a file in the workspace:
   ```text
   > Read package.json and summarize the available npm scripts.
   ```
2. **Verify Streaming in Proxy**: In the proxy server window, you will see real-time streaming requests:
   ```text
   [POST] /v1/messages 200 (120ms)
   ```
3. **Extended Thinking Mode**: To test Claude with deep reasoning / thinking:
   ```bash
   CLAUDE_CONFIG_DIR=~/.claude-antigravity \
   ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
   ANTHROPIC_AUTH_TOKEN="test" \
   ANTHROPIC_MODEL="claude-opus-4-6-thinking" \
   claude
   ```

#### Step 6: Create Shell Aliases for Daily Use (Recommended)

Add these aliases to your `~/.zshrc` (or `~/.bashrc`) to run Claude Code with Antigravity anytime:

```bash
# Standard Sonnet 3.7
alias claude-agy='CLAUDE_CONFIG_DIR=~/.claude-antigravity ANTHROPIC_BASE_URL="http://127.0.0.1:8080" ANTHROPIC_AUTH_TOKEN="test" ANTHROPIC_MODEL="claude-sonnet-4-6" claude'

# Opus 3.7 with Thinking enabled
alias claude-thinking='CLAUDE_CONFIG_DIR=~/.claude-antigravity ANTHROPIC_BASE_URL="http://127.0.0.1:8080" ANTHROPIC_AUTH_TOKEN="test" ANTHROPIC_MODEL="claude-opus-4-6-thinking" claude'
```

Then reload your shell:
```bash
source ~/.zshrc
claude-agy
```

**Windows (PowerShell `$PROFILE`):**
```powershell
function claude-agy {
    $env:CLAUDE_CONFIG_DIR = "$env:USERPROFILE\.claude-antigravity"
    $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8080"
    $env:ANTHROPIC_AUTH_TOKEN = "test"
    $env:ANTHROPIC_MODEL = "claude-sonnet-4-6"
    claude
}
```

---

## Using with Claude Desktop (Cowork & Chat)

Claude Desktop supports connecting to a custom LLM Gateway (like `antigravity-claude-proxy`).

### How to Use Gemini Flash in Claude Desktop

1. **Start or Restart the Proxy Server**:
   ```bash
   npm start
   ```
   The proxy automatically detects your official Antigravity CLI credentials (`~/.gemini/antigravity-cli/antigravity-oauth-token`) and serves `/v1/models` on `http://127.0.0.1:8080`.

2. **Select the Model in Claude Desktop**:
   In Claude Desktop (under Cowork or Chat mode with Gateway connected):
   - Click the model selector at the bottom right of the message box.
   - Select **Gemini 3.8 Flash (Haiku)** (or **Gemini 3.8 Flash (Haiku 4.5)**).
   - Your prompts will now be processed directly by Google Antigravity's **Gemini 3.8 Flash (High)** model with full multimodal and reasoning support!

> **Technical Note on Claude Desktop Filtering**:
> Reverse engineering `/Applications/Claude.app/Contents/Resources/app.asar` reveals that Claude Desktop enforces an internal regex filter (`XTe`) on Gateway routes that drops any model ID containing third-party vendor strings (including `gemini`, `gpt`, `llama`, etc.), accepting only Anthropic tier identifiers (`opus`, `sonnet`, `haiku`).
>
> To ensure seamless compatibility, `antigravity-claude-proxy` provides Anthropic-compliant Haiku aliases (`claude-3-5-haiku-20241022` and `claude-haiku-4-5-20251001` with `anthropic_family_tier: "haiku"` and display name `Gemini 3.8 Flash (Haiku)`) which automatically route upstream to `gemini-3.8-flash-high`.

### How to Use Gemini Flash in Claude Code CLI

In Claude Code CLI, there is no vendor filter, so you can reference Gemini Flash directly or via the Haiku alias:

```bash
# Direct model ID
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="gemini-3.8-flash-high" \
claude

# Or via Haiku alias
CLAUDE_CONFIG_DIR=~/.claude-antigravity \
ANTHROPIC_BASE_URL="http://127.0.0.1:8080" \
ANTHROPIC_AUTH_TOKEN="test" \
ANTHROPIC_MODEL="claude-3-5-haiku-20241022" \
claude
```

---

---

### Running as a System Service (systemd)

When running as a systemd service, the proxy runs under a different user (e.g. `root`), so it can't find your Claude CLI settings at `~/.claude/settings.json`. Set `CLAUDE_CONFIG_PATH` to point to the real user's `.claude` directory:

```ini
# /etc/systemd/system/antigravity-proxy.service
[Service]
Environment=CLAUDE_CONFIG_PATH=/home/youruser/.claude
ExecStart=/usr/bin/node /path/to/antigravity-claude-proxy/src/index.js
```

Without this, the WebUI's Claude CLI tab won't be able to read or write your Claude Code configuration.

---

## Documentation

- [Available Models](docs/models.md)
- [Multi-Account Load Balancing](docs/load-balancing.md)
- [Web Management Console](docs/web-console.md)
- [Advanced Configuration](docs/configuration.md)
- [macOS Menu Bar App](docs/menubar-app.md)
- [OpenClaw / ClawdBot Integration](docs/openclaw.md)
- [API Endpoints](docs/api-endpoints.md)
- [Testing](docs/testing.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Safety, Usage, and Risk Notices](docs/safety-notices.md)
- [Legal](docs/legal.md)
- [Development](docs/development.md)

---

## Credits

This project is based on insights and code from:

- [opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth) - Antigravity OAuth plugin for OpenCode
- [claude-code-proxy](https://github.com/1rgs/claude-code-proxy) - Anthropic API proxy using LiteLLM

---

## License

MIT

---

<a href="https://buymeacoffee.com/badrinarayanans" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="50"></a>

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=badrisnarayanan/antigravity-claude-proxy&type=date&legend=top-left&cache-control=no-cache)](https://star-history.dera.page/#badrisnarayanan/antigravity-claude-proxy&type=date&legend=top-left)

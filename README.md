# OpenUI

<p align="center">
  <img src="./assets/openui.png" width="150" alt="OpenUI" />
</p>

<p align="center">
  <strong>AI-powered UI component generation - describe it, see it rendered, iterate in real-time</strong>
</p>

Building UI components can be a slog. OpenUI aims to make the process fun, fast, and flexible. It's also a tool we're using at [W&B](https://wandb.com) to test and prototype our next generation tooling for building powerful applications on top of LLMs.

## Table of Contents

- [Features](#features)
- [Demo](#demo)
- [Quick Start](#quick-start)
- [Installation](#installation)
  - [Docker (Recommended)](#docker-recommended)
  - [From Source](#from-source--python)
- [Supported Models](#supported-models)
- [Configuration](#configuration)
- [Development](#development)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## Features

- **Natural Language UI Generation**: Describe components in plain English and see them rendered instantly
- **Multiple Framework Support**: Convert between HTML, React, Svelte, Web Components, and more
- **Real-time Iteration**: Ask for changes and refinements with live preview
- **Multi-Model Support**: Works with OpenAI, Anthropic, Groq, Gemini, and any LiteLLM-compatible model
- **Local Model Support**: Run completely offline with Ollama
- **Live Demo Available**: Try it immediately at [openui.fly.dev](https://openui.fly.dev)

## Demo

![Demo](./assets/demo.gif)

OpenUI lets you describe UI using your imagination, then see it rendered live. You can ask for changes and convert HTML to React, Svelte, Web Components, etc. It's like [v0](https://v0.dev) but open source and not as polished :stuck_out_tongue_closed_eyes:.

## Quick Start

🚀 **Try it now**: [Live Demo](https://openui.fly.dev)

🐳 **Run locally with Docker**:
```bash
docker run --rm -p 7878:7878 -e OPENAI_API_KEY=your_key_here ghcr.io/wandb/openui
```

Then visit [http://localhost:7878](http://localhost:7878)

## Installation

### Prerequisites

- **For Docker**: Docker installed on your system
- **For Source**: Python 3.8+, git, and [uv](https://github.com/astral-sh/uv)
- **API Keys**: At least one LLM provider API key (OpenAI, Anthropic, etc.) or Ollama for local models

## Supported Models

OpenUI supports multiple LLM providers through direct APIs and [LiteLLM](https://docs.litellm.ai/docs/). Set the appropriate environment variables for your chosen provider:

| Provider | Environment Variable | Get API Key |
|----------|---------------------|-------------|
| **OpenAI** | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Anthropic** | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/settings/keys) |
| **Groq** | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com/keys) |
| **Gemini** | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| **Cohere** | `COHERE_API_KEY` | [cohere.com](https://cohere.com) |
| **Mistral** | `MISTRAL_API_KEY` | [mistral.ai](https://mistral.ai) |
| **OpenAI Compatible** | `OPENAI_COMPATIBLE_ENDPOINT`<br>`OPENAI_COMPATIBLE_API_KEY` | For tools like [LocalAI](https://localai.io/) |

### Local Models with Ollama

For completely offline usage, install [Ollama](https://ollama.com/download) and pull a model:

```bash
# Install and start Ollama
ollama serve

# Pull a vision-capable model
ollama pull llava
```

**Docker configuration**: Set `OLLAMA_HOST=http://host.docker.internal:11434` when running OpenUI in Docker.

### Docker (Recommended)

**Basic usage**:
```bash
docker run --rm -p 7878:7878 -e OPENAI_API_KEY=your_key_here ghcr.io/wandb/openui
```

**With multiple providers and Ollama**:
```bash
export ANTHROPIC_API_KEY=your_anthropic_key
export OPENAI_API_KEY=your_openai_key
docker run --rm --name openui -p 7878:7878 \
  -e OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  ghcr.io/wandb/openui
```

Open [http://localhost:7878](http://localhost:7878) and start generating UIs!

### From Source / Python

**Requirements**: Python 3.8+, git, and [uv](https://github.com/astral-sh/uv)

```bash
# Clone the repository
git clone https://github.com/wandb/openui
cd openui/backend

# Install dependencies
uv sync --frozen --extra litellm
source .venv/bin/activate

# Set API keys for your chosen LLM providers
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key

# Start the server
python -m openui
```

Visit [http://localhost:7878](http://localhost:7878) to use OpenUI.

## Configuration

### Custom LiteLLM Configuration

OpenUI automatically generates a LiteLLM config from your environment variables. For advanced configurations, you can provide a custom [proxy config](https://litellm.vercel.app/docs/proxy/configs).

**Config file locations** (in order of preference):
1. `litellm-config.yaml` in the current directory
2. `/app/litellm-config.yaml` (when running in Docker)
3. Path specified by `OPENUI_LITELLM_CONFIG` environment variable

**Docker example**:
```bash
docker run -p 7878:7878 \
  -v $(pwd)/litellm-config.yaml:/app/litellm-config.yaml \
  ghcr.io/wandb/openui
```

**Source example**:
```bash
pip install .[litellm]
export ANTHROPIC_API_KEY=your_key
export OPENAI_COMPATIBLE_ENDPOINT=http://localhost:8080/v1
python -m openui --litellm
```

### Model Selection

Once running, click the settings icon (⚙️) in the navigation bar to:
- Switch between available models
- Configure model-specific settings
- View usage statistics

### Docker Compose

> **DISCLAIMER:** This is likely going to be very slow.  If you have a GPU you may need to change the tag of the `ollama` container to one that supports it.  If you're running on a Mac, follow the instructions above and run Ollama natively to take advantage of the M1/M2.

From the root directory you can run:

```bash
docker-compose up -d
docker exec -it openui-ollama-1 ollama pull llava
```

If you have your OPENAI_API_KEY set in the environment already, just remove `=xxx` from the `OPENAI_API_KEY` line. You can also replace `llava` in the command above with your open source model of choice *([llava](https://ollama.com/library/llava) is one of the only Ollama models that support images currently)*.  You should now be able to access OpenUI at [http://localhost:7878](http://localhost:7878).

*If you make changes to the frontend or backend, you'll need to run `docker-compose build` to have them reflected in the service.*

## Development

A [dev container](https://github.com/wandb/openui/blob/main/.devcontainer/devcontainer.json) is configured in this repository which is the quickest way to get started.

### Codespace

<img src="./assets/codespace.png" alt="New with options..." width="500" />

Choose more options when creating a Codespace, then select **New with options...**.  Select the US West region if you want a really fast boot time.  You'll also want to configure your OPENAI_API_KEY secret or just set it to `xxx` if you want to try Ollama *(you'll want at least 16GB of Ram)*.

Once inside the code space you can run the server in one terminal: `python -m openui --dev`.  Then in a new terminal:

```bash
cd /workspaces/openui/frontend
npm run dev
```

This should open another service on port 5173, that's the service you'll want to visit.  All changes to both the frontend and backend will automatically be reloaded and reflected in your browser.

### Ollama

The codespace installs ollama automaticaly and downloads the `llava` model.  You can verify Ollama is running with `ollama list` if that fails, open a new terminal and run `ollama serve`.  In Codespaces we pull llava on boot so you should see it in the list.  You can select Ollama models from the settings gear icon in the upper left corner of the application.  Any models you pull i.e. `ollama pull llama` will show up in the settings modal.

<img src="./assets/ollama.png" width="500" alt="Select Ollama models" />

### Gitpod

You can easily use Open UI via Gitpod, preconfigured with Open AI.

[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/wandb/openui)

On launch Open UI is automatically installed and launched.

Before you can use Gitpod:

* Make sure you have a Gitpod account.
* To use Open AI models set up the `OPENAI_API_KEY` environment variable in your Gitpod [User Account](https://gitpod.io/user/variables). Set the scope to `wandb/openui` (or your repo if you forked it).

> NOTE: Other (local) models might also be used with a bigger Gitpod instance type. Required models are not preconfigured in Gitpod but can easily be added as documented above.

### Resources

See the readmes in the [frontend](./frontend/README.md) and [backend](./backend/README.md) directories.

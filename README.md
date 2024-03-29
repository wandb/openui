# OpenUI

Building UI components can be a slog.  OpenUI aims to make the process fun, fast, and flexible.  It's also a tool we're using at [W&B](https://wandb.com) to test and prototype our next generation tooling for building powerful applications on top of LLM's.

## Overview

![Demo](./assets/demo.gif)

OpenUI let's you describe UI using your imagination, then see it rendered live.  You can ask for changes and convert HTML to React, Svelte, Web Components, etc.  It's like [v0](https://v0.dev) but open source and not as polished :stuck_out_tongue_closed_eyes:.

## Live Demo

[Try the demo](https://openui.fly.dev)

## Running Locally

You can also run OpenUI locally and use models available to [Ollama](https://olama.com).  [Install Ollama](https://ollama.com/download) and pull a model like [CodeLlama](https://ollama.com/library/codellama), then assuming you have git and python installed:

```bash
git clone https://github.com/wandb/openui
cd openui/backend
# You probably want to do this from a virtual environment
pip install .
# This must be set to use OpenAI models, find your api key here: https://platform.openai.com/api-keys
export OPENAI_API_KEY=sk_XXX
python -m openui
```

Now you can goto [http://localhost:7878](http://localhost:7878)

## Development

See the readmes in the [frontend](./frontend/README.md) and [backend](./backend/README.md) directories.




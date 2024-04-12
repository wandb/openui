# OpenUI

Building UI components can be a slog.  OpenUI aims to make the process fun, fast, and flexible.  It's also a tool we're using at [W&B](https://wandb.com) to test and prototype our next generation tooling for building powerful applications on top of LLM's.

## Overview

![Demo](./assets/demo.gif)

OpenUI let's you describe UI using your imagination, then see it rendered live.  You can ask for changes and convert HTML to React, Svelte, Web Components, etc.  It's like [v0](https://v0.dev) but open source and not as polished :stuck_out_tongue_closed_eyes:.

## Live Demo

[Try the demo](https://openui.fly.dev)

## Running Locally

You can also run OpenUI locally and use models available to [Ollama](https://ollama.com).  [Install Ollama](https://ollama.com/download) and pull a model like [CodeLlama](https://ollama.com/library/codellama), then assuming you have git and python installed:

```bash
git clone https://github.com/wandb/openui
cd openui/backend
# You probably want to do this from a virtual environment
pip install .
# This must be set to use OpenAI models, find your api key here: https://platform.openai.com/api-keys
export OPENAI_API_KEY=xxx
python -m openui
```

### Docker Compose

> DISCLAIMER: This is likely going to be very slow.  If you have a GPU you may need to change the tag of the `ollama` container to one that supports it.  If you're running on a Mac, follow the instructions above and run Ollama natively to take advantage of the M1/M2.

From the root directory you can run:

```bash
docker-compose up -d
docker exec -it openui-ollama-1 ollama pull llava
```

If you have your OPENAI_API_KEY set in the environment already, just remove `=xxx` from the `OPENAI_API_KEY` line. You can also replace `llava` in the command above with your open source model of choice *([llava](https://ollama.com/library/llava) is one of the only Ollama models that support images currently)*.  You should now be able to access OpenUI at [http://localhost:7878](http://localhost:7878).

*If you make changes to the frontend or backend, you'll need to run `docker-compose build` to have them reflected in the service.*

### Docker

You can build and run the docker file manually from the `/backend` directory:

```bash
docker build . -t wandb/openui --load
docker run -p 7878:7878 -e OPENAI_API_KEY wandb/openui
```

Now you can goto [http://localhost:7878](http://localhost:7878)

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


### Resources

See the readmes in the [frontend](./frontend/README.md) and [backend](./backend/README.md) directories.

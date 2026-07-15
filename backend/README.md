# OpenUI

[![PyPI](https://img.shields.io/pypi/v/wandb-openui.svg)](https://pypi.org/project/wandb-openui/)
[![Changelog](https://img.shields.io/github/v/release/wandb/openui?include_prereleases&label=changelog)](https://github.com/wandb/openui/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](https://github.com/wandb/openui/blob/main/LICENSE)

A backend service for generating HTML components with AI

## Installation

Clone this repo, then install using `pip`.  You'll probably want to create a virtual env.

```bash
git clone https://github.com/wandb/openui
cd openui/backend
pip install .
```

## Usage

You must set the `OPENAI_API_KEY` even if you just want to try Ollama models.  Just set it to `xxx` in that case like below.

```bash
OPENAI_API_KEY=xxx python -m openui
```

### Docker

You can build and run the docker file from the `/backend` directory:

```bash
docker build . -t wandb/openui --load
docker run -p 7878:7878 -e OPENAI_API_KEY wandb/openui
```

## Development

First be sure to install the package as editable, then passing `--dev` as an argument will live reload any local changes.

```bash
pip install -e .
python -m openui --dev
```

Now install the dependencies and test dependencies:

```bash
pip install -e '.[test]'
```

To run the tests:

```bash
pytest
```

## Evaluation

The [eval](./openui/eval) folder contains scripts for evaluating the performance of a model.  It automates generating UI, taking screenshots of the UI, then asking `gpt-4-vision-preview` to rate the elements.  More details about the eval pipeline coming soon...


## Google Vertex AI

Create a service account with the appropriate permissions and authenticate with:

```
gcloud auth application-default login --impersonate-service-account ${GCLOUD_SERVICE_ACCOUNT}@${GCLOUD_PROJECT}.iam.gserviceaccount.com
```

## GitHub Copilot provider

Copilot support is optional and disabled by default. Each OpenUI user signs in
with GitHub and uses their own Copilot entitlement and allowance.

1. Create a GitHub OAuth App with:
   - Homepage URL: `http://localhost:7878`
   - Authorization callback URL: `http://localhost:7878/v1/callback`
2. Generate the token-encryption key once:

   ```bash
   python -c "import base64,secrets; print('v1:' + base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('='))"
   ```

3. Set the environment without committing these values:

   ```bash
   export OPENUI_COPILOT_ENABLED=1
   export OPENUI_TOKEN_ENCRYPTION_KEY='v1:<generated-base64url-key>'
   export GITHUB_CLIENT_ID='<oauth-app-client-id>'
   export GITHUB_CLIENT_SECRET='<oauth-app-client-secret>'
   export OPENUI_HOST='http://localhost:7878'
   ```

4. Install and provision the pinned runtime, then start OpenUI:

   ```bash
   uv sync --frozen --extra test
   uv run python -m copilot download-runtime
   uv run python -m openui
   ```

Open `http://localhost:7878`, sign in with GitHub, and choose a model under
**GitHub Copilot**. No special OAuth scope named `copilot` is required. The
GitHub account must have an active Copilot entitlement.

`OPENUI_TOKEN_ENCRYPTION_KEY` encrypts OAuth tokens stored in SQLite. Back it up
securely: changing or losing it makes existing stored tokens unusable and users
must reconnect GitHub.

The Copilot SDK currently controls model inference settings. OpenUI's
temperature slider and `max_tokens` request field are not applied to Copilot
SDK 1.0.6 sessions.

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

> **Note:** Container deployments must use Copilot **OAuth mode**, not device
> mode. Device mode is bare-process only and refuses to start inside a container
> because bridge networking delivers requests from a non-loopback gateway.

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

Copilot support is optional and disabled by default. OpenUI supports two
authentication modes: **device mode** for local single-user use, and **OAuth
mode** for cloud or multi-user deployments.

### Device mode (local single-user)

Device mode uses the host machine's GitHub Copilot CLI credentials. It is
intended for a single trusted user running OpenUI locally. **All requests share
one machine identity and consume that account's Copilot allowance — do not
expose device mode to untrusted or multi-user access over the network.**

Multiple independent, non-overridable guards enforce that device mode stays a
strictly local, bare-process deployment:

- **Startup environment guard:** if `OPENUI_ENVIRONMENT` is not `local`, OpenUI
  refuses to start with Copilot device mode enabled.
- **Startup host guard:** `OPENUI_HOST` must bind a loopback address
  (`localhost`, `127.0.0.1`, or `::1`). A public or custom hostname is rejected
  so device mode cannot be advertised behind a reverse proxy or forwarder.
- **Startup container guard:** device mode refuses to start inside a container
  (Docker/Kubernetes). Bridge networking delivers requests from a non-loopback
  gateway, so device mode is bare-process only — container deployments must use
  OAuth mode.
- **Request guard:** even in a local environment, the device-flow API endpoints
  reject any request whose TCP peer is not loopback, whose `Host` or `Origin`
  hostname is not loopback, or that carries a proxy header (`Forwarded`,
  `X-Forwarded-For`, `X-Real-IP`, `Via`). These headers are never trusted or
  parsed — their mere presence fails the request closed, because a same-host
  reverse proxy or port forwarder connects from loopback and would otherwise
  make a remote request look local.

There is no remote-override switch. Device mode must **not** be served through a
reverse proxy, a port-forwarding or tunnel platform, a public tunnel, a custom
hostname, or Gitpod/Codespaces port exposure. The only supported private-remote
path is an SSH local port forward to a bare host process while browsing a
loopback URL (for example `ssh -L 7878:127.0.0.1:7878 your-server`) so the
request still reaches OpenUI from `127.0.0.1`. For cloud, container, or
multi-user deployments, use OAuth mode instead.

1. Install and provision the pinned runtime:

   ```bash
   uv sync --frozen
   uv run python -m copilot download-runtime
   ```

2. Set the environment without committing these values:

   ```bash
   export OPENUI_COPILOT_ENABLED=1
   export OPENUI_COPILOT_AUTH_MODE=device
   ```

3. Start OpenUI:

   ```bash
   cd backend
   uv run python -m openui
   ```

4. Open `http://localhost:7878`, click the settings icon, select **Connect
   GitHub Copilot**, copy the one-time code shown in the dialog, visit
   `https://github.com/login/device`, enter the code, and authorize. The
   model list refreshes automatically once authentication completes.

> **Warning:** Device mode is unsuitable for untrusted multi-user or remote
> access. Every request runs as the authenticated machine account and consumes
> its Copilot allowance. The local-only guards cannot be disabled; a private
> remote operator must reach the loopback interface through an SSH tunnel
> instead of exposing OpenUI on a public interface.

### OAuth mode (cloud / multi-user)

OAuth mode requires a GitHub OAuth App. Each user signs in individually and
uses their own Copilot entitlement and allowance.

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
   export OPENUI_COPILOT_AUTH_MODE=oauth
   export OPENUI_TOKEN_ENCRYPTION_KEY='v1:<generated-base64url-key>'
   export GITHUB_CLIENT_ID='<oauth-app-client-id>'
   export GITHUB_CLIENT_SECRET='<oauth-app-client-secret>'
   export OPENUI_HOST='http://localhost:7878'
   ```

   `OPENUI_HOST` must be the deployment's public base URL (scheme + host + port,
   no trailing slash) and must match the origin and path used in your OAuth App's
   Authorization callback URL. The `http://localhost:7878` value above is only
   correct for local development; change it to your public URL for cloud
   deployments.

4. Install and provision the pinned runtime, then start OpenUI:

   ```bash
   uv sync --frozen
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

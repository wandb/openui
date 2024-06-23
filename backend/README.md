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
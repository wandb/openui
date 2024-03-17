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

```bash
python -m openui
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

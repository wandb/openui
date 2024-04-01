#!/bin/bash

# Fix cache perms
mkdir -p $HOME/.cache
sudo chown -R $USER $HOME/.cache

# Ollama time
curl -fsSL https://ollama.com/install.sh | sh

# Install python packages
cd /workspaces/openui/backend
pip install -e .[test]

# addressing warning...
git config --unset-all core.hooksPath
pre-commit install --allow-missing-config

# pre-commit hooks cause permission weirdness
git config --global --add safe.directory /workspaces/openui
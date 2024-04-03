#!/bin/bash

# Fix cache perms
mkdir -p $HOME/.cache
sudo chown -R $USER $HOME/.cache

# Install node packages
cd /workspaces/openui/frontend
pnpm install

# Install python packages
cd /workspaces/openui/backend
pip install -e .[test]

# Pull a model for ollama, using llava for now as it's multi-modal
ollama pull llava

# addressing warning...
git config --unset-all core.hooksPath
pre-commit install --allow-missing-config

# pre-commit hooks cause permission weirdness
git config --global --add safe.directory /workspaces/openui
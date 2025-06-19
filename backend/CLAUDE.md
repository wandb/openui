# OpenUI Development Guide

**⚠️ Early Development Stage**: This project is in very early stages with many details still to be resolved. Commands and processes may change frequently.

## Quick Reference

For detailed Weave integration information, see [WeaveREADME.md](./WeaveREADME.md).

## Development Server Management

### Starting the Dev Server

```bash
# Navigate to backend directory
cd /Users/davidroberts/projects/quick-scripts/openui/backend

# Start server with logging to file
source .env && python -m openui --dev 2>&1 | tee server.log

# Alternative: Start server in background with logs
source .env && python -m openui --dev > server.log 2>&1 &
```

**Note**: Server typically runs on http://127.0.0.1:8080 or http://127.0.0.1:7878 depending on environment configuration.

### Stopping the Dev Server

```bash
# 1. If running in foreground
Ctrl+C

# 2. Find and kill processes using ports (7878 is configured but falls back to 8080 for unknow reasons)
lsof -i :8080
lsof -i :7878

# 3. Kill specific processes by PID:
kill 11395 15340
```

### Viewing Server Logs

```bash
# Real-time log viewing
tail -f server.log

# View recent logs
tail -100 server.log

# Search logs for errors
grep -i error server.log
```

## Evaluation System

**⚠️ Note**: Evaluation system requires additional dependencies and may have unresolved configuration issues.

### Installing Evaluation Dependencies

```bash
# Install evaluation extras (may need troubleshooting)
uv sync --frozen --extra eval
```

### Running Evaluations - theoretical, this has not been confirmed

```bash
# Basic evaluation (experimental)
source .env && python -m openui.eval.evaluate_weave

# With specific model (experimental)
source .env && python -m openui.eval.evaluate_weave gpt-4-turbo

# Prompt search optimization (experimental)
source .env && HOGWILD=1 python -m openui.eval.evaluate_weave
```

## Environment Configuration

Ensure your `.env` file contains:

```bash
# Weights & Biases / Weave Configuration
WANDB_API_KEY=your_wandb_api_key
WANDB_ENTITY=your_wandb_entity
WANDB_PROJECT=your_project_name

# LLM API Keys
OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key (optional)
# GROQ_API_KEY=your_groq_key (optional)
```

**Remember**: This is experimental software in early development. Expect issues and workarounds to be necessary.

# OpenUI + Weights & Biases Weave Integration

This document explains how OpenUI integrates with Weights & Biases (W&B) Weave for LLM tracing and evaluations.

## Overview

OpenUI is a demo project from W&B that showcases how development and customer satisfaction teams can use Weave to:
- **Trace LLM calls** for debugging and monitoring
- **Run evaluations** to assess UI component quality
- **Track model performance** across different prompts and configurations

## Weave Integration Architecture

### 1. LLM Call Tracing

OpenUI automatically traces LLM calls when Weave is enabled:

- **Entry Point**: `openui/server.py:718` - Weave initialization via `weave.init()`
- **Traced Operations**: Model predictions are decorated with `@weave.op()` in evaluation scripts
- **Project Naming**: Uses `WANDB_PROJECT` environment variable (defaults to `"openui-dev"`)

### 2. Configuration & Setup

#### Environment Variables
```bash
# Required for Weave integration
WANDB_API_KEY=your_wandb_api_key_here
WANDB_PROJECT=openui-dev  # Optional, defaults to "openui-dev" 
WANDB_ENTITY=your_wandb_entity  # Optional
```

#### Weave Server Connection
- Weave connects to W&B cloud by default (`https://api.wandb.ai`)
- No separate Weave server configuration needed - it uses W&B's hosted Weave service
- Authentication handled via `WANDB_API_KEY` or netrc file

### 3. Viewing Traces

To view LLM traces:

1. **Enable tracing**: Set `WANDB_API_KEY` environment variable
2. **Run OpenUI**: Start the server normally - tracing happens automatically  
3. **View traces**: Go to your W&B project → Weave section to see traced operations

Example trace locations:
- Project: `wandb.ai/{your_entity}/{project_name}/weave`
- Operations: Model predictions, evaluations, prompt searches

### 4. Evaluation System

#### Evaluation Components (`openui/eval/`)

The evaluation system includes:

**Core Files**:
- `evaluate_weave.py` - Main Weave-based evaluation runner
- `evaluate.py` - Legacy evaluation system  
- `model.py` - Custom model wrappers with Weave integration
- `dataset.py` - Dataset management and publishing

**Evaluation Models**:
```python
# UI Generation Model (generates HTML components)
class OpenUIModel(PromptModel):
    @weave.op()
    async def predict(self, prompt: str) -> dict:
        # Generates HTML component from text prompt
        
# Quality Scoring Model (evaluates generated components)  
class OpenUIScoringModel(Model):
    @weave.op()
    async def predict(self, prompt: str, prediction: dict) -> dict:
        # Scores components on: media quality, contrast, relevance, polish
```

#### Running Evaluations

From `backend/` directory:

```bash
# Install eval dependencies
uv sync --frozen --extra eval

# Run evaluation with default model (gpt-3.5-turbo)
python -m openui.eval.evaluate_weave

# Run with specific model
python -m openui.eval.evaluate_weave gpt-4-turbo

# Run prompt search optimization
HOGWILD=1 python -m openui.eval.evaluate_weave
```

#### Evaluation Metrics

Components are scored on 4 dimensions (1-4 scale):
- **Media Quality**: Desktop/mobile rendering quality
- **Contrast**: Light/dark mode display  
- **Relevance**: How well component matches the prompt
- **Polish**: Overall visual quality and rendering

### 5. Development Team Usage

**For UI Component Development**:
```bash
# Enable Weave tracing during development
export WANDB_API_KEY=your_key
export WANDB_PROJECT=my-openui-dev

# Start server with tracing
python -m openui --dev
```

All LLM calls for UI generation will be automatically traced in Weave.

**For Customer Satisfaction Teams**:
```bash
# Run batch evaluations on component quality
python -m openui.eval.evaluate_weave

# Analyze results in W&B Weave dashboard
# Navigate to: wandb.ai/{entity}/{project}/weave
```

### 6. Dataset Management

Evaluation datasets are managed in `openui/eval/datasets/`:

```python
# Publish new evaluation dataset
await weave.init("openui-dev")
dataset = Dataset(name="eval", rows=[...])
weave.publish(dataset)

# Reference existing dataset  
dataset = weave.ref("eval:v0").get()
```

### 7. Key Integration Points

| File | Function | Purpose |
|------|----------|---------|
| `server.py:718` | `run_with_wandb()` | Initializes Weave when WANDB_API_KEY detected |
| `evaluate_weave.py:368` | `weave.init()` | Sets up Weave project for evaluations |
| `evaluate_weave.py:164` | `@weave.op()` | Traces model predictions |
| `evaluate_weave.py:285` | `@weave.op()` | Traces scoring operations |

### 8. Troubleshooting

**Common Issues**:
- **No traces appearing**: Check `WANDB_API_KEY` is set and valid
- **Authentication errors**: Verify W&B login with `wandb login`  
- **Project not found**: Ensure `WANDB_PROJECT` exists in your W&B account

**Debug Commands**:
```bash
# Check W&B authentication
wandb whoami

# Test Weave connection
python -c "import weave; weave.init('test-project')"
```

This integration provides comprehensive observability for LLM-powered UI generation, enabling teams to monitor, evaluate, and improve their AI systems systematically.
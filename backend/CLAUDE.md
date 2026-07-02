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
python -m openui --dev 2>&1 | tee server.log

# Alternative: Start server in background with logs
python -m openui --dev > server.log 2>&1 &
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
python -m openui.eval.evaluate_weave

# With specific model (experimental)
python -m openui.eval.evaluate_weave gpt-4-turbo

# Prompt search optimization (experimental)
HOGWILD=1 python -m openui.eval.evaluate_weave
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

## Git Workflow Workarounds

### Pre-commit/Pre-push Hook Issues

The project uses Husky hooks that require `pnpm` for frontend linting. When working on backend-only changes, you may encounter:

```bash
.husky/pre-commit: line 1: pnpm: command not found
.husky/pre-push: line 1: pnpm: command not found
```

**Workaround for backend-only changes:**

```bash
# Commit with --no-verify to bypass pre-commit hook
git commit --no-verify -m "Your commit message"

# Push with --no-verify to bypass pre-push hook
git push --no-verify
```

**Note**: Only use `--no-verify` for backend changes when frontend tooling is unavailable. For mixed frontend/backend changes, ensure `pnpm` is installed.

## Testing with Playwright

### UI Generation Testing Workflow

To test UI generation and Weave tracing:

1. **Start server in background**:
   ```bash
   python -m openui --dev > server.log 2>&1 &
   ```

2. **Navigate to application**:
   ```python
   mcp__playwright__playwright_navigate(url="http://127.0.0.1:8080", headless=False)
   ```

3. **Take initial screenshot** (helpful for debugging):
   ```python
   mcp__playwright__playwright_screenshot(name="initial_state", fullPage=True)
   ```

4. **Fill the prompt textarea**:
   ```python
   # Use generic selector first, then specific if needed
   mcp__playwright__playwright_fill(
       selector="textarea", 
       value="Create a simple todo list component"
   )
   ```

5. **Submit the form**:
   ```python
   mcp__playwright__playwright_click(selector="button[type=\"submit\"]")
   ```

6. **Monitor server logs for results**:
   ```bash
   # Check for Weave trace URLs and completion success
   tail -10 server.log
   ```

7. **Look for success indicators**:
   - `weave: 🍩 https://wandb.ai/...` (trace URL)
   - `"POST /v1/chat/completions HTTP/1.1" 200 OK` (successful completion)

### Playwright Tips

- **Use `headless=False`** for debugging to see browser interactions
- **Take screenshots** at key points to understand current page state
- **Use generic selectors first** (`textarea`, `button[type="submit"]`) before specific ones
- **Wait between actions** if needed: `sleep 2 && tail server.log`
- **Always close browser** when done: `mcp__playwright__playwright_close()`

## Testing Weave Middleware Solution

### Verifying the FastAPI Middleware Works

To confirm that the WeaveContextMiddleware is properly propagating context and generating traces:

#### Quick Test Procedure

1. **Start server and clear logs**:
   ```bash
   python -m openui --dev > server.log 2>&1 &
   ```

2. **Verify Weave initialization** (should see this once at startup):
   ```bash
   tail -5 server.log
   # Look for: "weave: View Weave data at https://wandb.ai/..."
   # Look for: "Weave initialized for project: test-openui"
   ```

3. **Trigger UI generation** (using Playwright or browser):
   ```python
   # Via Playwright
   mcp__playwright__playwright_navigate(url="http://127.0.0.1:8080", headless=False)
   mcp__playwright__playwright_fill(selector="textarea", value="Create a button component")
   mcp__playwright__playwright_click(selector="button[type=\"submit\"]")
   ```

4. **Check for successful trace generation**:
   ```bash
   tail -5 server.log
   ```

#### Success Indicators

You should see **exactly this pattern** in server.log:

```bash
# ✅ Single initialization at startup
weave: View Weave data at https://wandb.ai/[entity]/[project]/weave
Weave initialized for project: test-openui

# ✅ Successful trace generation per request (with 🍩 emoji)
weave: 🍩 https://wandb.ai/[entity]/[project]/r/call/[call-id]
INFO: 127.0.0.1:xxxxx - "POST /v1/chat/completions HTTP/1.1" 200 OK
```

#### Failure Indicators

If middleware is **NOT working**, you would see:

```bash
# ❌ Missing trace URLs - only sees requests without traces
INFO: 127.0.0.1:xxxxx - "POST /v1/chat/completions HTTP/1.1" 200 OK
# (no 🍩 weave trace URL)
```

#### What This Confirms

- **✅ Single Initialization**: Weave only initializes once at server startup
- **✅ Context Propagation**: Middleware successfully propagates async context
- **✅ No Performance Overhead**: No repeated `weave.init()` calls per request
- **✅ Full Tracing**: All `@weave.op()` decorated functions generate trace URLs

#### Debugging Issues

If traces aren't appearing:

1. **Check WANDB_API_KEY is set**: `echo $WANDB_API_KEY`
2. **Verify middleware is loaded**: Look for WeaveContextMiddleware in server startup
3. **Check function decoration**: Ensure `@weave.op()` decorator is present on `generate_ui_completion`
4. **Review logs for errors**: `grep -i error server.log`

## Weave Tracing Technical Notes

### FastAPI Async Context Solution

**Solution Implemented**: FastAPI middleware with context propagation:

```python
# WeaveContextMiddleware ensures Weave context is available in all requests
class WeaveContextMiddleware:
    def __init__(self, app):
        self.app = app
        
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            context = copy_context()
            return await context.run(self._handle_request, scope, receive, send)
        return await self.app(scope, receive, send)
    
    async def _handle_request(self, scope, receive, send):
        return await self.app(scope, receive, send)

# Added to FastAPI app
app.add_middleware(WeaveContextMiddleware)
```

**Benefits**:
- ✅ Single Weave initialization at server startup
- ✅ No performance overhead from repeated `weave.init()` calls  
- ✅ Proper async context propagation
- ✅ Full tracing functionality maintained

**Previous workaround** (now unnecessary):
```python
# OLD: Required weave.init() in each traced function
@weave.op()
async def generate_ui_completion(...):
    weave.init(...)  # No longer needed!
```

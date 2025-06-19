# Weave FastAPI Async Context Issue

## Problem Analysis

### What `weave.init()` Establishes

#### 1. Global Weave Client Instance
`weave.init()` creates and stores a **global WeaveClient instance** that is accessible throughout your application:

```python
# This creates a singleton client that lives in global state
client = weave.init("project-name")
```

#### 2. Call Stack Context Variables
From the documentation, Weave uses **context variables** (mentioned in `call_context.py`) to track:

- **Current call stack** (`currentCall: CallStackEntry`)
- **Parent call references** (`parentCall?: CallStackEntry`) 
- **Call hierarchy and tracing state**

#### 3. Current Call Access Functions
The documentation shows these critical functions that depend on the initialized context:

```python
# These functions REQUIRE weave.init() to have been called first
weave.require_current_call()  # Raises NoCurrentCallError if no init
weave.get_current_call()      # Returns None if no init
```

### What Breaks Without `weave.init()`

#### The Missing Pieces

When `weave.init()` is not called in the async context, the following are missing:

1. **No Global WeaveClient**: The global client singleton doesn't exist
2. **No Call Stack Context**: The context variables for tracking call hierarchy are unset
3. **No Trace Server Connection**: No connection to the Weave backend for logging traces

#### Why `@weave.op()` Fails Silently

When you decorate a function with `@weave.op()`, it likely does something like:

```python
@weave.op()
def generate_ui_completion(...):
    # Internally, this probably tries to:
    current_call = weave.get_current_call()  # Returns None!
    if current_call is None:
        # Skip tracing silently
        return
    # Otherwise, create trace...
```

### Why the Current Solution Works

When you call `weave.init()` inside the function:

```python
@weave.op()
async def generate_ui_completion(data: dict, user_id: str, input_tokens: int):
    weave.init(os.getenv('WANDB_PROJECT', 'test-openui'))  # Re-establishes ALL context
    # Now all the context variables are available!
```

This **re-establishes the entire Weave context** in that specific async execution context:
- ✅ Creates the global WeaveClient
- ✅ Sets up call stack context variables  
- ✅ Establishes trace server connection
- ✅ Makes `weave.get_current_call()` work

### The Real Problem: Context Variable Isolation

The core issue is that **FastAPI request handlers run in isolated async contexts** where the context variables set by the original `weave.init()` are not available.

```python
# Server startup (context A)
weave.init("project")  # Sets context variables in context A

# FastAPI request (context B) 
async def chat_completions():
    # Context variables from context A are NOT available here
    result = await generate_ui_completion(...)  # No weave context!
```

From the Weave documentation:

> "Weave requires certain contextvars to be set (see call_context.py), but new threads do not automatically copy context from the parent, which can cause the call context to be lost"

This applies to both threading AND async contexts in FastAPI.

### The Overhead of Current Solution

Each `weave.init()` call:
1. **Creates a new WeaveClient instance** (HTTP connections, auth, etc.)
2. **Performs authentication with W&B** 
3. **Sets up trace server connection**
4. **Initializes project metadata**

This is why it works but creates overhead.

## Recommended Solution

### FastAPI Lifespan + Context Middleware

Based on the Weave patterns for context-aware threading, here's the proper approach:

```python
import contextvars
from contextvars import copy_context

# Context middleware to propagate Weave context
class WeaveContextMiddleware:
    def __init__(self, app):
        self.app = app
        
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            # Ensure Weave context is available in request scope
            context = copy_context()
            return await context.run(self._handle_request, scope, receive, send)
        return await self.app(scope, receive, send)
    
    async def _handle_request(self, scope, receive, send):
        return await self.app(scope, receive, send)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.setLevel("DEBUG")
    logger.debug("Starting up server in %d...", os.getpid())
    
    # Initialize Weave once at startup
    if wandb_enabled:
        import weave
        os.environ["WEAVE_PRINT_CALL_LINK"] = "true"
        weave.init(os.getenv("WANDB_PROJECT", "openui-dev"))
        print(f"Weave initialized for project: {os.getenv('WANDB_PROJECT', 'openui-dev')}", file=sys.stderr)
    
    yield

# Add the middleware
app.add_middleware(WeaveContextMiddleware)

# Remove weave.init() from generate_ui_completion
@weave.op()
async def generate_ui_completion(data: dict, user_id: str, input_tokens: int):
    """Generate UI completion using various LLM providers - traced by Weave"""
    # No weave.init() needed here anymore
    # ... rest of function
```

### Why This Solution Works

1. **Single Initialization**: ✅ Preserves single initialization (efficient)
2. **Context Propagation**: ✅ Ensures context propagation (works correctly)  
3. **Follows Weave Patterns**: ✅ Uses Weave's intended patterns
4. **Handles All Requests**: ✅ Handles all request types properly

### Alternative Solutions

#### Option 2: Manual Context Preservation

For more granular control, you can manually copy context:

```python
from contextvars import copy_context

# At server startup, capture the context
weave_context = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global weave_context
    # Initialize Weave
    weave.init(os.getenv("WANDB_PROJECT", "openui-dev"))
    # Capture the current context
    weave_context = contextvars.copy_context()
    yield

@weave.op()
async def generate_ui_completion(data: dict, user_id: str, input_tokens: int):
    # Run in the captured context
    if weave_context:
        return await weave_context.run(lambda: your_actual_logic())
    # fallback
```

#### Option 3: Environment-Based Configuration

You could also try setting Weave environment variables to modify its behavior:

```python
# In your startup code
os.environ["WEAVE_PARALLELISM"] = "1"  # Reduce parallel processing
os.environ["WEAVE_PRINT_CALL_LINK"] = "true"
```

## Implementation Steps

1. **Implement the middleware solution above**
2. **Remove `weave.init()` from `generate_ui_completion`** 
3. **Test that you get both**:
   - ✅ `weave: View Weave data at ...` (initialization)
   - ✅ `weave: 🍩 https://wandb.ai/...` (trace URLs)

## Conclusion

This is a **legitimate architectural gap** in Weave's FastAPI integration patterns. The documentation recommends single initialization, but FastAPI's request isolation breaks the context chain.

The **middleware solution** is the most robust approach, as it:
- ✅ Preserves single initialization (efficient)
- ✅ Ensures context propagation (works correctly)  
- ✅ Follows Weave's intended patterns
- ✅ Handles all request types properly

This is a sophisticated async context issue that many FastAPI + tracing library combinations face. The current workaround is functional but the middleware approach is the proper architectural solution.
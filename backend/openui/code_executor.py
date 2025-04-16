from typing import Dict, Any
from pydantic import BaseModel
import docker
from docker.errors import APIError, ContainerError
from . import config

class CodeExecutionRequest(BaseModel):
    """Request model for code execution."""
    code: str
    language: str = "python"  # "python" or "bash"
    timeout: int = 30  # seconds

class CodeExecutionResponse(BaseModel):
    """Response model for code execution results."""
    output: str
    error: str | None = None
    status: str

class CodeExecutor:
    """Handles code execution in isolated Docker containers."""
    
    def __init__(self):
        """Initialize Docker client."""
        try:
            self.client = docker.from_env()
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Docker client: {e}")
        
    async def execute(self, request: CodeExecutionRequest) -> CodeExecutionResponse:
        """
        Execute code in an isolated Docker container.
        
        Args:
            request: CodeExecutionRequest containing code and execution parameters
            
        Returns:
            CodeExecutionResponse with execution results
        """
        try:
            # Configure container based on language
            if request.language == "python":
                command = ["python", "-c", request.code]
                image = "python:3.12-slim"
            elif request.language == "bash":
                command = ["bash", "-c", request.code]
                image = "ubuntu:22.04"
            else:
                return CodeExecutionResponse(
                    output="",
                    error=f"Unsupported language: {request.language}",
                    status="error"
                )

            # Run code in isolated container
            container = self.client.containers.run(
                image,
                command,
                remove=True,
                detach=True,
                network_disabled=True,
                mem_limit="512m",
                pids_limit=50,
                stdout=True,
                stderr=True
            )
            
            try:
                # Wait for container to finish with timeout
                container.wait(timeout=request.timeout)
                # Get execution output
                output = container.logs(stdout=True, stderr=True).decode()
                return CodeExecutionResponse(
                    output=output,
                    status="success"
                )
            finally:
                try:
                    container.remove(force=True)
                except:
                    pass  # Container might already be removed
        except ContainerError as e:
            # Handle container execution errors
            error_msg = str(e)
            return CodeExecutionResponse(
                output="",
                error=error_msg,
                status="error"
            )
        except APIError as e:
            # Handle Docker API errors
            return CodeExecutionResponse(
                output="",
                error=str(e),
                status="error"
            )
        except Exception as e:
            # Handle unexpected errors
            return CodeExecutionResponse(
                output="",
                error=f"Unexpected error: {str(e)}",
                status="error"
            )

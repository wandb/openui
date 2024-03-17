from typing import List, Union, Optional, Dict, Literal, ClassVar
from pydantic import BaseModel, ConfigDict
import tiktoken
import httpx

# You need to define or import these types yourself
from openai._types import Headers, Query, Body
from openai.types.chat import (
    ChatCompletionMessageParam,
    completion_create_params,
    ChatCompletionToolChoiceOptionParam,
    ChatCompletionToolParam,
)


class ChatCompletionRequest(BaseModel):
    messages: List[ChatCompletionMessageParam]
    model: Union[
        str,
        Literal[
            "gpt-4-0125-preview",
            "gpt-4-turbo-preview",
            "gpt-4-1106-preview",
            "gpt-4-vision-preview",
            "gpt-4",
            "gpt-4-0314",
            "gpt-4-0613",
            "gpt-4-32k",
            "gpt-4-32k-0314",
            "gpt-4-32k-0613",
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
            "gpt-3.5-turbo-0301",
            "gpt-3.5-turbo-0613",
            "gpt-3.5-turbo-1106",
            "gpt-3.5-turbo-16k-0613",
        ],
    ]
    frequency_penalty: Optional[float] = None
    function_call: Optional[completion_create_params.FunctionCall] = None
    functions: Optional[List[completion_create_params.Function]] = None
    logit_bias: Optional[Dict[str, int]] = None
    logprobs: Optional[bool] = None
    max_tokens: Optional[int] = None
    n: Optional[int] = None
    presence_penalty: Optional[float] = None
    response_format: Optional[completion_create_params.ResponseFormat] = None
    seed: Optional[int] = None
    stop: Union[Optional[str], List[str]] = None
    stream: Optional[bool] = True
    temperature: Optional[float] = None
    tool_choice: Optional[ChatCompletionToolChoiceOptionParam] = None
    tools: Optional[List[ChatCompletionToolParam]] = None
    top_logprobs: Optional[int] = None
    top_p: Optional[float] = None
    user: Optional[str] = None
    extra_headers: Optional[Headers] = None
    extra_query: Optional[Query] = None
    extra_body: Optional[Body] = None
    timeout: Optional[float | httpx.Timeout] = None
    model_config: ClassVar[ConfigDict] = ConfigDict(arbitrary_types_allowed=True)

    def count_tokens(self):
        """Returns the number of tokens in a text string."""
        # TODO: we're just assuming the most recent encoding
        encoding = tiktoken.get_encoding("cl100k_base")
        text = ""
        for message in self.messages:
            if isinstance(message["content"], str):
                text += message["content"]
            else:
                text += " ".join(
                    [
                        part["text"]
                        for part in message["content"]
                        if part["type"] == "text"
                    ]
                )
        num_tokens = len(encoding.encode(text))
        return num_tokens

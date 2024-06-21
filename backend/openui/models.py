from pydantic import BaseModel
import tiktoken


class ShareRequest(BaseModel):
    prompt: str
    name: str
    emoji: str
    html: str


class VoteRequest(BaseModel):
    prompt: str
    name: str
    emoji: str
    html: str
    vote: bool


def count_tokens(messages):
    """Returns the number of tokens in a text string."""
    # TODO: we're just assuming the most recent encoding
    encoding = tiktoken.get_encoding("cl100k_base")
    text = ""
    for message in messages:
        if isinstance(message["content"], str):
            text += message["content"]
        else:
            text += " ".join(
                [part["text"] for part in message["content"] if part["type"] == "text"]
            )
    num_tokens = len(encoding.encode(text))
    return num_tokens

import sys
from pathlib import Path

try:
    from dotenv import load_dotenv

    # Look for .env in current directory and parent directories
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
        print(f"Loaded .env from {env_path}", file=sys.stderr)
    else:
        # Try current working directory
        load_dotenv()
        print("Loaded .env from current directory", file=sys.stderr)
except ImportError:
    print("python-dotenv not available, using system environment variables only", file=sys.stderr)

import weave
from openai import OpenAI

client = OpenAI()

# Weave will track the inputs, outputs and code of this function
@weave.op()
def extract_dinos(sentence: str) -> dict:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": """In JSON format extract a list of `dinosaurs`, with their `name`,
their `common_name`, and whether its `diet` is a herbivore or carnivore"""
            },
            {
                "role": "user",
                "content": sentence
            }
            ],
            response_format={ "type": "json_object" }
        )
    return response.choices[0].message.content


def main():
    # Initialise the weave project
    weave.init('jurassic-park')

    sentence = """I watched as a Tyrannosaurus rex (T. rex) chased after a Triceratops (Trike), \
both carnivore and herbivore locked in an ancient dance. Meanwhile, a gentle giant \
Brachiosaurus (Brachi) calmly munched on treetops, blissfully unaware of the chaos below."""

    result = extract_dinos(sentence)
    print(result)

if __name__ == "__main__":
    main()

from pathlib import Path
import csv
import json
import mistletoe
import yaml
import asyncio
import sys
from openui.util import gen_screenshots

from openai import AsyncOpenAI

SYSTEM_PROMPT = """You're a frontend web developer that specializes in tailwindcss. Given a description, generate HTML with tailwindcss. You should support both dark and light mode. It should render nicely on desktop, tablet, and mobile. Keep your responses concise and just return HTML that would appear in the <body> no need for <head>. Use placehold.co for placeholder images. If the user asks for interactivity, use modern ES6 javascript and native browser apis to handle events.

Always start your response with frontmatter wrapped in ---.  Set name: with a 2 to 5 word description of the component. Set emoji: with an emoji for the component, i.e.:
---
name: Fancy Button
emoji: 🎉
---

<button class="bg-blue-500 text-white p-2 rounded-lg">Click me</button>"""


def extract_html(result: str):
    fm = {}
    parts = result.split("---")
    try:
        if len(parts) > 2:
            fm = yaml.safe_load(parts[1])
            if not isinstance(fm, dict):
                fm = {"name": fm}
            md = "---".join(parts[2:])
        elif len(parts) == 2:
            fm = yaml.safe_load(parts[0])
            if not isinstance(fm, dict):
                fm = {"name": fm}
            md = parts[1]
        else:
            md = result
    except Exception as e:
        print(f"Error parsing frontmatter: {e}")
        print(parts)
        fm["name"] = "Component"
        fm["emoji"] = "🎉"
        md = result
    doc = mistletoe.Document(md)
    html = ""
    blocks = 0
    for node in doc.children:
        if isinstance(node, mistletoe.block_token.CodeFence):
            blocks += 1
            if node.language == "js" or node.language == "javascript":
                html += f"<script>\n{node.children[0].content}\n</script>\n"
            else:
                html += f"{node.children[0].content}\n"
    if blocks == 0:
        html = md
    fm["html"] = html.strip()
    return fm


async def synth(prompt, model="gpt-3.5-turbo"):
    print(f"Generating HTML for: {prompt}")
    completion = await openai.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        max_tokens=2048,
        temperature=0.5,
        model=model,
    )
    result = completion.choices[0].message.content
    parsed = extract_html(result)
    parsed["prompt"] = prompt
    return parsed


async def main(model="gpt-3.5-turbo"):
    eval_csv = Path(__file__).parent / "datasets" / "eval.csv"
    gen_json = Path(__file__).parent / "datasets" / f"{model}.json"
    screenshot_dir = Path(__file__).parent / "datasets" / model
    screenshot_dir.mkdir(exist_ok=True)
    # Regenerate screenshots only for existing generations
    if gen_json.exists():
        with open(gen_json, "r") as f:
            results = json.load(f)
        for i, row in enumerate(results):
            await gen_screenshots(f"prompt-{i}", row["html"], screenshot_dir)
            row["desktop_img"] = f"./{model}/prompt-{i}.combined.png"
            row["mobile_img"] = f"./{model}/prompt-{i}.combined.mobile.png"
        with open(gen_json, "w") as f:
            f.write(json.dumps(results, indent=4))
        return

    with open(eval_csv, "r") as f:
        reader = csv.DictReader(f)
        tasks = [synth(row["prompt"], model) for i, row in enumerate(reader)]
    results = await asyncio.gather(*tasks)
    for i, row in enumerate(results):
        await gen_screenshots(f"prompt-{i}", row["html"], screenshot_dir)
        row["desktop_img"] = f"./{model}/prompt-{i}.combined.png"
        row["mobile_img"] = f"./{model}/prompt-{i}.combined.mobile.png"

    with open(gen_json, "w") as f:
        f.write(json.dumps(results, indent=4))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        model = sys.argv[1]
    else:
        model = "gpt-3.5-turbo"
    if model.startswith("ollama/"):
        model = model.replace("ollama/", "")
        openai = AsyncOpenAI(base_url="http://localhost:11434/v1")
    else:
        openai = AsyncOpenAI()

    asyncio.run(main(model))

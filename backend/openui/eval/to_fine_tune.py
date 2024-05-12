from pathlib import Path
import hashlib
import json
import re
import tiktoken
from bs4 import BeautifulSoup
from bs4.element import Tag
from collections import Counter

LLAMA3_TEMPLATE = """<|begin_of_text|><|start_header_id|>system<|end_header_id|>

{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>

{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>

{answer}<|eot_id|><|end_of_text|>"""

SYSTEM_PROMPT = """You're a frontend web developer that specializes in tailwindcss.
Given a description or an image, generate HTML with tailwindcss. You should support
both dark and light mode. It should render nicely on desktop, tablet, and mobile.
Keep your responses concise and just return HTML that would appear in the <body>
no need for <head>. Use placehold.co for placeholder images. If the user asks for
interactivity, use modern ES6 javascript and native browser apis to handle events.

Do not generate SVG's, instead use an image tag with an alt attribute of the same
descriptive name, i.e.:

<img aria-hidden="true" alt="check" src="/icons/check.svg" />

Always start your response with frontmatter wrapped in ---.  Set name: with a 2 to 5
word description of the component. Set emoji: with an emoji for the component, i.e.:

---
name: Fancy Button
emoji: 🎉
---

<button class="bg-blue-500 text-white p-2 rounded-lg">Click me</button>
"""



SVGS = json.loads(Path("svg_labels.json").read_text())

# Rough estimate of tokens
encoding = tiktoken.get_encoding("cl100k_base")


MAX_TOKENS = 4096 * 2


def sha1_hash(input_string):
    hasher = hashlib.sha1()
    hasher.update(input_string.encode('utf-8'))
    return hasher.hexdigest()

def svg_hash(svg):
    hash_str = ""
    for element in svg.children:
        if isinstance(element, Tag):
            for k in sorted(element.attrs.keys()):
                hash_str += str(element.attrs[k] or "") + ":"
    return sha1_hash(hash_str)

def replace_svgs(html: str):
    soup = BeautifulSoup(html, "html.parser")
    svg_map = {}
    for svg in soup.find_all("svg"):
        hashed = svg_hash(svg)
        svg_map[hashed] = str(svg)
        name = SVGS.get(hashed)
        if name:
            new_svg = soup.new_tag('img')
            new_svg.src = f"/icons/{name}.svg"
            new_svg.alt = name
            svg.replace_with(new_svg)
        else:
            print("WTF:", svg)
    return str(soup)

def extract_svgs(html: str, index: dict):
    """I used this with my svg_annotator.html to turn svg's into labels"""
    counter = Counter()
    soup = BeautifulSoup(html, "html.parser")
    svg_map = {}
    for svg in soup.find_all("svg"):
        hashed = svg_hash(svg)
        svg_map[hashed] = str(svg)
        name = index.get(hashed)
        if name:
            counter.update({name: 1})
        else:
            counter.update({"fuck": 1})
            print("WTF:", svg)
    with open("fucked_svgs.json", "w") as f:
        json.dump(svg_map, f, indent=4)
    print(counter)


def main():
    data_dir = Path(__file__).parent / "components"
    tokens = 0
    examples = 0
    #index = json.loads(Path("svg_index.json").read_text())
    with open(data_dir / "eval.jsonl", "w", encoding="utf-8") as evals:
        all_html = ""
        for file in sorted(data_dir.glob("*.json")):
            comps = json.loads(file.read_text())
            for comp in comps:
                for i, name in enumerate(comp["names"]):
                    html = replace_svgs(comp["html"])
                    # TODO: maybe some more wild image stuff
                    new_src = "https://placehold.co/50x50/orange/white.png"
                    updated_html = re.sub(
                        r'src\s*=\s*["\'](.*?)["\']', f'src="{new_src}"', html
                    )
                    updated_html = re.sub(
                        r"/docs/images/dashboard-overview\.png",
                        "https://placehold.co/500x360.png?text=Dashboard",
                        updated_html,
                    )
                    updated_html = re.sub(
                        r"/docs/images/examples/image-1\.jpg",
                        "https://placehold.co/700x400/blue/white.jpg",
                        updated_html,
                    )
                    updated_html = re.sub(
                        r"/docs/images/examples/image-1@2x\.jpg",
                        "https://placehold.co/700x400/blue/white@2x.jpg",
                        updated_html,
                    )
                    updated_html = re.sub(
                        r"https://flowbite\.s3\.amazonaws\.com/docs/jumbotron/conference\.jpg",
                        "https://placehold.co/1024x768/green/white.jpg",
                        updated_html,
                    )
                    updated_html = re.sub(
                        r"https://flowbite\.s3\.amazonaws\.com/docs/jumbotron/hero-pattern-dark\.svg",
                        "https://placehold.co/256x256/blue/black.svg",
                        updated_html,
                    )
                    updated_html = re.sub(
                        r"https://flowbite\.s3\.amazonaws\.com/docs/jumbotron/hero-pattern\.svg",
                        "https://placehold.co/256x256/white/cyan.svg",
                        updated_html,
                    ).strip()
                    all_html += updated_html

                    output_tokens = len(encoding.encode(updated_html))
                    if output_tokens > MAX_TOKENS:
                        print(f"Skipping {name}, {output_tokens:,}")
                        continue
                    emoji = comp["emojis"][i]
                    answer = """---
    name: {name}
    emoji: {emoji}
    ---

    {html}
    """.format(
                        name=name, emoji=emoji, html=updated_html
                    )
                    prompt = comp["prompts"][i]
                    compiled = LLAMA3_TEMPLATE.format(
                        system_prompt=SYSTEM_PROMPT,
                        prompt=prompt,
                        answer=answer,
                    )
                    total_tokens = len(encoding.encode(compiled))
                    if total_tokens > MAX_TOKENS:
                        print(f"Warning {name} has {total_tokens:,}")
                    tokens += total_tokens
                    evals.write(
                        json.dumps({"text": compiled}, ensure_ascii=False) + "\n"
                    )
                    examples += 1
    print(f"Generated ~{tokens:,} tokens worth of training data ({examples} examples)")


if __name__ == "__main__":
    main()

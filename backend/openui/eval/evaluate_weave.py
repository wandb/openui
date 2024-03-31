import asyncio
import sys
import os
import textwrap
import yaml
import mistletoe
from openai import AsyncOpenAI
from weave import Evaluation, Model

# from .model import EvaluateQualityModel
import weave
from pathlib import Path
import base64
import json
from datetime import datetime
from openui.util import gen_screenshots


last: datetime | None = None


def pt(*args):
    global last
    now = datetime.now()
    if last:
        delta = str(now - last).split(":")[2][:5]
    else:
        delta = "00.00"
    last = now
    print(f"{now.strftime('%M:%S')} ({delta}) -", *args)


base_dir = Path(__file__).parent / "datasets"

SYSTEM_PROMPT = """You're a frontend web developer that specializes in tailwindcss. Given a description, generate HTML with tailwindcss. You should support both dark and light mode. It should render nicely on desktop, tablet, and mobile. Keep your responses concise and just return HTML that would appear in the <body> no need for <head>. Use placehold.co for placeholder images. If the user asks for interactivity, use modern ES6 javascript and native browser apis to handle events.

Always start your response with frontmatter wrapped in ---.  Set name: with a 2 to 5 word description of the component. Set emoji: with an emoji for the component, i.e.:
---
name: Fancy Button
emoji: 🎉
---

<button class="bg-blue-500 text-white p-2 rounded-lg">Click me</button>"""


@weave.type()
class OpenUIModel(Model):
    system_prompt: str
    model_name: str = "gpt-3.5-turbo"
    take_screenshot: bool = True
    temp: float = 0.5
    _iter: int = 0
    # "gpt-3.5-turbo-1106"

    @property
    def client(self):
        if self.model_name.startswith("ollama/"):
            return AsyncOpenAI(base_url="http://localhost:11434/v1")
        if self.model_name.startswith("fireworks/"):
            return AsyncOpenAI(
                api_key=os.getenv("FIREWORKS_API_KEY"),
                base_url="https://api.fireworks.ai/inference/v1",
            )
        else:
            return AsyncOpenAI()

    @property
    def model(self):
        if self.model_name.startswith("ollama/"):
            return self.model_name.replace("ollama/", "")
        if self.model_name.startswith("fireworks/"):
            return (
                f"accounts/fireworks/models/{self.model_name.replace('fireworks/', '')}"
            )
        return self.model_name

    @property
    def model_dir(self):
        return self.model_name.split("/")[-1]

    @weave.op()
    async def predict(self, prompt: str) -> dict:
        pt("Actually predicting", prompt)
        completion = await self.client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": self.system_prompt,
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            max_tokens=2048,
            temperature=self.temp,
            model=self.model,
        )
        result = completion.choices[0].message.content
        parsed = self.extract_html(result)
        if self.take_screenshot:
            name = f"prompt-{self._iter}"
            self._iter += 1
            await self.screenshot(parsed["html"], name)
            parsed["desktop_img"] = f"./{self.model_dir}/{name}.combined.png"
            parsed["mobile_img"] = f"./{self.model_dir}/{name}.combined.mobile.png"
        return parsed

    async def screenshot(self, html: str, name: str):
        screenshot_dir = base_dir / self.model_dir
        screenshot_dir.mkdir(exist_ok=True)
        await gen_screenshots(name, html, screenshot_dir)

    def extract_html(self, result: str):
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


EVAL_SYSTEM_PROMPT = textwrap.dedent(
    """
You are an expert web developer and will be assessing the quality of web components.
Given a prompt, emoji, name and 2 images, you will be asked to rate the quality of 
the component on the following criteria:

- Media Quality: How well the component is displayed on desktop and mobile
- Contrast: How well the component is displayed in light and dark mode
- Relevance: Given the users prompt, do the images, name and emoji satisfy the request

Use the following scale to rate each criteria:

1. Terrible - The criteria isn't met at all
2. Poor - The criteria is somewhat met but it looks very amateur
3. Average - The criteria is met but it could be improved
4. Good - The criteria is met and it looks professional
5. Excellent - The criteria is met and it looks exceptional

Output a JSON object with the following structure:
    
    {
        "media": 4,
        "contrast": 2,
        "relevance": 5
    }
"""
)


@weave.type()
class OpenUIScoringModel(Model):
    system_prompt: str
    model_name: str = "gpt-4-vision-preview"
    temp: float = 0.3

    def data_url(self, file_path):
        with open(file_path, "rb") as image_file:
            binary_data = image_file.read()
        base64_encoded_data = base64.b64encode(binary_data)
        base64_string = base64_encoded_data.decode("utf-8")
        data_url = f"data:image/png;base64,{base64_string}"
        return data_url

    @weave.op()
    async def predict(self, example: dict, prediction: dict) -> dict:
        client = AsyncOpenAI()

        user_message = f"""{example['prompt']}
---
name: {prediction['name']}
emoji: {prediction['emoji']}
"""
        response = await client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_message},
                        {
                            "type": "text",
                            "text": "Screenshot of the light and dark desktop versions:",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": self.data_url(
                                    base_dir / prediction["desktop_img"]
                                )
                            },
                        },
                        {
                            "type": "text",
                            "text": "Screenshot of the light and dark mobile versions:",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": self.data_url(
                                    base_dir / prediction["mobile_img"]
                                )
                            },
                        },
                    ],
                },
                {
                    "role": "assistant",
                    "content": "Here's my assessment of the component in JSON format:",
                },
            ],
            temperature=self.temp,
            max_tokens=128,
            seed=42,
        )
        extracted = response.choices[0].message.content
        pk = response.usage.prompt_tokens
        pc = pk * 0.01 / 1000
        ck = response.usage.completion_tokens
        cc = ck * 0.03 / 1000
        pt(f"Usage: {pk} prompt tokens, {ck} completion tokens, ${round(pc + cc, 3)}")
        try:
            return json.loads(extracted.replace("```json", "").replace("```", ""))
        except json.JSONDecodeError:
            pt("Failed to decode JSON!")
            return {
                "media": None,
                "contrast": None,
                "relevance": None,
                "source": extracted,
            }


scoring_model = OpenUIScoringModel(EVAL_SYSTEM_PROMPT)


@weave.op()
async def scores(example: dict, prediction: dict) -> dict:
    return await scoring_model.predict(example, prediction)


@weave.op()
def example_to_model_input(example: dict) -> str:
    return example["prompt"]


async def run(row=0, bad=False):
    pt("Initializing weave")
    weave.init("openui-test-20")
    model = OpenUIModel(SYSTEM_PROMPT)
    pt("Loading dataset")
    dataset = weave.ref("flowbite").get()
    pt("Running predict, row:", row)
    comp = dataset.rows[row]
    if bad:
        comp["prompt"] = (
            "A slider control that uses a gradient and displays a percentage."
        )
    res = await model.predict(comp)
    pt("Result:", res)


async def eval(mod="gpt-3.5-turbo"):
    pt("Initializing weave")
    weave.init("openui-test-20")
    model = OpenUIModel(SYSTEM_PROMPT, mod)
    pt("Loading dataset")
    dataset = weave.ref("eval").get()
    evaluation = Evaluation(
        dataset,
        scorers=[scores],
        preprocess_model_input=example_to_model_input,
    )
    pt("Running evaluation")
    await evaluation.evaluate(model)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        mod = sys.argv[1]
    else:
        mod = "gpt-3.5-turbo"
    asyncio.run(eval(mod))

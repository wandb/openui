import asyncio
import sys
import os
import textwrap
import yaml
import mistletoe
from typing import Optional
from openai import AsyncOpenAI
from weave import Evaluation, Model

# from .model import EvaluateQualityModel
import weave
from pathlib import Path
import base64
import json
from datetime import datetime
from openui.util import gen_screenshots

from promptsearch import PromptSearch, PromptModel


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


class OpenUIModel(PromptModel):
    prompt_template: str
    model_name: Optional[str] = "gpt-3.5-turbo"
    take_screenshot: Optional[bool] = True
    temp: Optional[float] = 0.3
    _iteration: int = 0
    # "gpt-3.5-turbo-1106"

    # TODO: share with scoring model
    def data_url(self, file_path):
        with open(file_path, "rb") as image_file:
            binary_data = image_file.read()
        base64_encoded_data = base64.b64encode(binary_data)
        base64_string = base64_encoded_data.decode("utf-8")
        data_url = f"data:image/png;base64,{base64_string}"
        return data_url

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
                    "content": self.prompt_template,
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
            name = f"prompt-{self._iteration}"
            self._iteration += 1
            await self.screenshot(parsed["html"], name)
            parsed["desktop_img"] = f"./{self.model_dir}/{name}.combined.png"
            parsed["mobile_img"] = f"./{self.model_dir}/{name}.combined.mobile.png"
            parsed["desktop_uri"] = self.data_url(
                base_dir / parsed["desktop_img"]
            )
            parsed["mobile_uri"] = self.data_url(base_dir / parsed["mobile_img"])
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
- Polish: Does it look good or are there rendering issues / lack of polish

Use the following scale to rate each criteria:

1. Terrible - The criteria isn't met at all
2. Poor - The criteria is somewhat met but it looks very amateur
3. Good - The criteria is met and it looks professional
4. Excellent - The criteria is met and it looks exceptional

Also provide a short explanation of your rationale for each rating in the "reasoning" field.

Output a JSON object with the following structure:
    
    {
        "media": 3,
        "contrast": 1,
        "relevance": 2,
        "polish": 2,
        "reasoning": "The contrast in dark mode is terrible.  The component could be more relevant.  It also lacks polish."
    }
"""
)


class OpenUIScoringModel(Model):
    system_prompt: str
    model_name: Optional[str] = "gpt-4-turbo"
    temp: Optional[float] = 0.3

    def data_url(self, file_path):
        with open(file_path, "rb") as image_file:
            binary_data = image_file.read()
        base64_encoded_data = base64.b64encode(binary_data)
        base64_string = base64_encoded_data.decode("utf-8")
        data_url = f"data:image/png;base64,{base64_string}"
        return data_url

    @weave.op()
    async def predict(self, prompt: str, prediction: dict) -> dict:
        client = AsyncOpenAI()

        user_message = f"""{prompt}
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
                        {
                            "type": "text",
                            "text": "Please assess this prompt against the images and provide your score.",
                        },
                    ],
                },
            ],
            temperature=self.temp,
            response_format={"type": "json_object"},
            max_tokens=512,
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
                "polish": None,
                "reasoning": "Failed to decode JSON!",
                "source": extracted,
            }


scoring_model = OpenUIScoringModel(system_prompt=EVAL_SYSTEM_PROMPT)


@weave.op()
async def scores(prompt: str, model_output: dict) -> dict:
    return await scoring_model.predict(prompt, model_output)


async def run(row=0, bad=False):
    pt("Initializing weave")
    weave.init("openui-dev")
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
    weave.init("openui-dev")
    model = OpenUIModel(prompt_template=SYSTEM_PROMPT, model_name=mod)
    pt("Loading dataset")
    dataset = weave.ref("eval").get()
    evaluation = Evaluation(
        dataset=dataset,
        scorers=[scores],
    )
    pt("Running evaluation")
    await evaluation.evaluate(model)

def run_prompt_search(mod: str):
    weave.init("openui-dev")
    model = OpenUIModel(prompt_template=SYSTEM_PROMPT, model_name=mod)
    pt("Loading dataset")
    dataset = weave.ref("eval").get()
    evaluation = Evaluation(
        dataset=dataset,
        scorers=[scores],
    )
    pt("Run prompt search")
    ps = PromptSearch(
        model=model,
        dataset=dataset,
        evaluation=evaluation,
        eval_result_to_score=lambda evals: evals["scores"]["polish"]["mean"] + evals["scores"]["relevance"]["mean"])
    ps.steps(10)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        mod = sys.argv[1]
    else:
        mod = "gpt-3.5-turbo"
    if os.getenv("HOGWILD"):
        run_prompt_search(mod)
    else:
        asyncio.run(eval(mod))

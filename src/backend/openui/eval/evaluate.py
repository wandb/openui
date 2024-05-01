import asyncio
import sys
import textwrap
from weave import Evaluation, Model

# from .model import EvaluateQualityModel
import weave
from pathlib import Path
import base64
import json
from datetime import datetime

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


def data_url(file_path):
    with open(file_path, "rb") as image_file:
        binary_data = image_file.read()
    base64_encoded_data = base64.b64encode(binary_data)
    base64_string = base64_encoded_data.decode("utf-8")
    data_url = f"data:image/png;base64,{base64_string}"
    return data_url


base_dir = Path(__file__).parent / "datasets"


@weave.type()
class EvaluateQualityModel(Model):
    system_message: str
    model_name: str = "gpt-4-vision-preview"
    # "gpt-3.5-turbo-1106"

    @weave.op()
    async def predict(self, input: dict) -> dict:
        from openai import OpenAI

        pt("Actually predicting", input["emoji"], input["name"] + ":", input["prompt"])
        pt("Desktop:", input["desktop_img"], "Mobile:", input["mobile_img"])
        client = OpenAI()
        user_message = f"""{input['prompt']}
---
name: {input['name']}
emoji: {input['emoji']}
"""

        response = client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": self.system_message},
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
                                "url": data_url(base_dir / input["desktop_img"])
                            },
                        },
                        {
                            "type": "text",
                            "text": "Screenshot of the light and dark mobile versions:",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url(base_dir / input["mobile_img"])
                            },
                        },
                    ],
                },
                {
                    "role": "assistant",
                    "content": "Here's my assessment of the component in JSON format:",
                },
            ],
            temperature=0.3,
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
            return extracted


@weave.op()
def media_score(example: dict, prediction: dict) -> dict:
    return prediction["media"]


@weave.op()
def contrast_score(example: dict, prediction: dict) -> dict:
    return prediction["contrast"]


@weave.op()
def overall_score(example: dict, prediction: dict) -> float:
    return prediction["relevance"]


@weave.op()
def example_to_model_input(example: dict) -> str:
    return example


SYSTEM_MESSAGE = textwrap.dedent(
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
model = EvaluateQualityModel(SYSTEM_MESSAGE)


async def run(row=0, bad=False):
    pt("Initializing weave")
    weave.init("openui-test-21")
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


async def eval(ds="gpt-3.5-turbo"):
    pt("Initializing weave")
    weave.init("openui-test-21")
    pt("Loading dataset", ds)
    dataset = weave.ref(ds).get()
    evaluation = Evaluation(
        dataset,
        scorers=[media_score, contrast_score, overall_score],
        preprocess_model_input=example_to_model_input,
    )
    pt("Running evaluation")
    await evaluation.evaluate(model)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        ds = sys.argv[1].replace(":", "-")
    else:
        ds = "gpt-3.5-turbo"
    asyncio.run(eval(ds))

from weave import Model
import weave
import json
from pathlib import Path

import base64


def data_url(file_path):
    with open(file_path, "rb") as image_file:
        binary_data = image_file.read()
    base64_encoded_data = base64.b64encode(binary_data)
    base64_string = base64_encoded_data.decode("utf-8")
    data_url = f"data:image/png;base64,{base64_string}"
    return data_url


base_dir = Path(__file__).parent / "components"


@weave.type()
class EvaluateQualityModel(Model):
    system_message: str
    model_name: str = "gpt-4-vision-preview"
    # "gpt-3.5-turbo-1106"

    @weave.op()
    async def predict(self, input: dict) -> dict:
        from openai import OpenAI

        client = OpenAI()
        user_message = f"""prompt: {input['prompt']}
name: {input['name']}
emoji: {input['emoji']}
"""

        response = client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": user_message},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Screenshot of the light and dark desktop versions:",
                        },
                        {
                            "type": "image_url",
                            "image_url": data_url(base_dir / input["desktop_img"]),
                        },
                        {
                            "type": "text",
                            "text": "Screenshot of the light and dark mobile versions:",
                        },
                        {
                            "type": "image_url",
                            "image_url": data_url(base_dir / input["mobile_img"]),
                        },
                    ],
                },
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )
        extracted = response.choices[0].message.content
        return json.loads(extracted)

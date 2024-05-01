from pathlib import Path
import json
import asyncio

from openai import AsyncOpenAI

openai = AsyncOpenAI()

SYSTEM_PROMPT = """You're a fun and creative web developer. Given a description and name of a component, I want a list of json that contain "emoji", "name", and "prompt" properties.  At least 3-5 but upto 10.  The "emoji" should represent the idea of the component and the question should be what a user would ask for, i.e.

name: Default alert
desc: A simple alert with a title and message

results: [
    {
        "emoji": "🚨",
        "prompt": "How do I create a simple alert with a title and message?",
        "name": "Simple Alert"
    },
    {
        "emoji": "🔔",
        "prompt": "I want an alert with a title and message.",
        "name": "Title Message Alert"
    },
    {
        "emoji": "📢",
        "prompt": "Let's make a nice alert with a title & message.",
        "name": "Nice Alert"
    }
]
"""


async def synth(row):
    if row.get("names"):
        print("Skipping row, already has emojis: ", row["name"])
        return None
    else:
        print(f"Generating emoji for: {row['name']} - {row['description']}")
        completion = await openai.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": f"""name: {row['name']}
desc: {row['description']}
""",
                },
            ],
            max_tokens=2048,
            temperature=0.5,
            model="gpt-3.5-turbo-1106",
            response_format={"type": "json_object"},
        )
        result = completion.choices[0].message.content
        parsed = json.loads(result)
        data = parsed.get("results") or []
        if len(data) == 0:
            print("No result, got", parsed)
            return None
        row["names"] = [d["name"] for d in data]
        row["emojis"] = [d["emoji"] for d in data]
        row["prompts"] = [d["prompt"] for d in data]
    return row


async def main():
    data_dir = Path(__file__).parent / "components"
    x = 0
    max = 10
    for file in sorted(data_dir.glob("*.json")):
        x += 1
        print(f"Loading dataset ({x} < {max}): ", file.name)
        if x > max:
            break
        dataset = json.loads(file.read_text())
        tasks = [synth(row) for row in dataset]
        results = await asyncio.gather(*tasks)
        for i, syn in enumerate(results):
            if syn is None:
                print("Bummer", dataset[i]["name"])

        with open(data_dir / file.name, "w") as f:
            f.write(json.dumps(dataset, indent=4))


asyncio.run(main())

import os
from pathlib import Path
import json
from openui.util import gen_screenshots

data_dir = Path(__file__).parent / "components"

if __name__ == "__main__":
    i = 0
    for file in sorted(data_dir.glob("*.json")):
        with open(file, "r") as f:
            data = json.load(f)
        i += 1
        if i > 10:
            continue
        img_dir = data_dir / file.name.split(".")[0]
        os.makedirs(img_dir, exist_ok=True)
        for row in data:
            root_name = row["name"].lower().replace(" ", "-")
            gen_screenshots(root_name, row["html"], img_dir)
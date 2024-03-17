from bs4 import BeautifulSoup
from urllib.request import urlopen
from pathlib import Path
import json

comps = [
    "Accordion",
    "Alerts",
    "Avatar",
    "Badge",
    "Banner",
    "Bottom Navigation",
    "Breadcrumb",
    "Buttons",
    "Button Group",
    "Card",
    "Carousel",
    "Chat Bubble",
    "Device Mockups",
    "Drawer",
    "Dropdowns",
    "Footer",
    "Forms",
    "Gallery",
    "Indicators",
    "Jumbotron",
    "List Group",
    "Mega Menu",
    "Modal",
    "Navbar",
    "Pagination",
    "Popover",
    "Progress",
    "Rating",
    "Sidebar",
    "Skeleton",
    "Speed Dial",
    "Spinner",
    "Stepper",
    "Tables",
    "Tabs",
    "Timeline",
    "Toast",
    "Tooltips",
    "Typography",
    "Video",
    "FORMS",
    "Input Field",
    "File Input",
    "Search Input",
    "Number Input",
    "Phone Input",
    "Select",
    "Textarea",
    "Checkbox",
    "Radio",
    "Toggle",
    "Range",
    "Floating Label",
    "TYPOGRAPHY",
    "Headings",
    "Paragraphs",
    "Blockquote",
    "Images",
    "Lists",
    "Links",
    "Text",
    "PLUGINS",
    "Charts",
    "Datepicker",
]

base_url = "https://flowbite.com/docs/components/"
total_examples = 0
for comp in comps:
    if comp == "FORMS":
        base_url = "https://flowbite.com/docs/forms/"
        continue
    elif comp == "TYPOGRAPHY":
        base_url = "https://flowbite.com/docs/typography/"
        continue
    elif comp == "PLUGINS":
        base_url = "https://flowbite.com/docs/plugins/"
        continue
    clean_comp = comp.lower().replace(" ", "-")
    print(f"Loading examples for: {clean_comp}, ({total_examples} total examples)")

    cached_html = Path(__file__).parent / "components" / f"{clean_comp}.html"
    cached_dataset = Path(__file__).parent / "components" / f"{comp.lower()}.json"
    if cached_dataset.exists():
        print(f"Skipping:{comp} as we parsed it back in the day")
        ds = json.load(cached_dataset.open("r"))
        total_examples += len(ds)
        continue
    if not cached_html.exists():
        response = urlopen(base_url + clean_comp)
        html_content = response.read()
        with open(cached_html, "wb") as f:
            f.write(html_content)
    else:
        with cached_html.open("rb") as f:
            html_content = f.read()

    soup = BeautifulSoup(html_content, "html.parser")

    dataset = []
    flavors = soup.find_all("h2")
    for flavor in flavors:
        row = {}
        row["name"] = flavor.text.replace("\n #", "").strip()
        row["description"] = flavor.next_sibling.text
        code_parent = flavor.find_next_sibling("div")
        if not code_parent:
            print(f"Something's fucked up with {row['name']}, skipping")
            continue
        iframe = code_parent.find("iframe")
        if not iframe or not iframe.has_attr("srcdoc"):
            print("Skipped, no iframe: ", row["name"])
            continue
        srcdoc_soup = BeautifulSoup(iframe["srcdoc"], "html.parser")
        row["html"] = srcdoc_soup.find("div", id="exampleWrapper").prettify()
        dataset.append(row)

    print(f"Collected {len(dataset)} examples for {clean_comp} like a boss\n=====\n")
    total_examples += len(dataset)

    with open(cached_dataset, "w") as f:
        json.dump(dataset, f, indent=2)

    """
    for row in dataset:
        print("======================================")
        print(row["name"], "-", row["description"])
        print("======================================\n")
        print(row["html"])
        print("\n\n")
    """
print("!!!!!!!!!!!!!")
print(f"Collected {total_examples} total examples")

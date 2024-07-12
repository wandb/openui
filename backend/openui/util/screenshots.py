import io
import json
import asyncio
from PIL import Image
from playwright.async_api import async_playwright, TimeoutError


def p(s=""):
    print(s, end=None if s == "" else "", flush=True)


def pause(secs=0.01):
    pass


async def set_window_size_for_screenshot(page, target_width, target_height):
    # Execute JavaScript to get the device pixel ratio
    device_pixel_ratio = await page.evaluate("window.devicePixelRatio")

    # Calculate the required window size considering the device pixel ratio
    adjusted_width = int(target_width / device_pixel_ratio)
    adjusted_height = int(target_height / device_pixel_ratio)

    # Set the window size
    p(f" W: {adjusted_width} ")
    await page.set_viewport_size({"width": adjusted_width, "height": adjusted_height})


# Desktop and mobile window sizes
DW = 1024
MW = 512
DH = 800
MH = 800

# Toggle mobile width in the iframe
TOGGLE_MOBILE = 'document.getElementById("exampleWrapper").classList.toggle("max-w-sm")'
TOGGLE_DARK = 'window.postMessage({"action": "toggle-dark-mode"}, "*")'
RS = Image.LANCZOS

browser = None


async def gen_screenshots(root_name, html, img_dir):
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("https://localhost:5173/annotator/index.html")

        combined_img = img_dir / f"{root_name}.combined"
        p(f"Capturing {root_name}")

        # Hydration and setup
        # Normalize to zinc color scheme, fix maybe busted urls
        html = html.replace("-gray", "-zinc")
        html = html.replace("via.placeholder.com", "placehold.co")
        if "exampleWrapper" not in html:
            html = f"<div id='exampleWrapper'>{html}</div>"
        payload = json.dumps({"action": "hydrate", "html": html})
        await page.evaluate(f'window.postMessage({payload}, "*")')
        try:
            await page.wait_for_function(
                "!!document.querySelector('#exampleWrapper')",
            )
            p(".")
            await page.wait_for_function(
                "() => Array.from(document.images).every((img) => img.complete && (typeof img.naturalWidth != 'undefined'))"
            )
            # Temp sleep to ensure we fade in...
            await asyncio.sleep(0.5)
        except TimeoutError:
            print("Timed out waiting for images to load")
            return None

        # Mobile
        # Not sure what's up here
        await page.evaluate(TOGGLE_MOBILE)
        await set_window_size_for_screenshot(page, MW, MH)
        pause()
        light_mobile_img = Image.open(io.BytesIO(await page.screenshot()))
        w_percent = MW / float(light_mobile_img.size[0])
        mobile_size = (MW, int((float(light_mobile_img.size[1]) * float(w_percent))))
        p(f"M {mobile_size}")
        light_mobile_img = light_mobile_img.resize(mobile_size, RS)
        # Dark mode
        await page.evaluate(TOGGLE_DARK)
        pause()
        dark_mobile_img = Image.open(io.BytesIO(await page.screenshot()))
        dark_mobile_img = dark_mobile_img.resize(mobile_size, RS)
        p(".")

        # Desktop
        await page.evaluate(TOGGLE_MOBILE)
        await set_window_size_for_screenshot(page, DW, DH)
        pause()
        dark_img = Image.open(io.BytesIO(await page.screenshot()))
        w_percent = DW / float(dark_img.size[0])
        desktop_size = (DW, int((float(dark_img.size[1]) * float(w_percent))))
        p(f"D {desktop_size}")
        dark_img = dark_img.resize(desktop_size, RS)
        # Light mode
        await page.evaluate(TOGGLE_DARK)
        pause()
        light_img = Image.open(io.BytesIO(await page.screenshot()))
        light_img = light_img.resize(desktop_size, RS)
        p(".")

        # Combined
        dh = desktop_size[1]
        final_img = Image.new("RGB", (DW, dh * 2))
        final_img.paste(light_img, (0, 0))
        final_img.paste(dark_img, (0, dh))
        final_img.save(f"{combined_img}.png")
        mh = mobile_size[1]
        final_img_mobile = Image.new("RGB", (MW * 2, mh))
        final_img_mobile.paste(dark_mobile_img, (0, 0))
        final_img_mobile.paste(light_mobile_img, (MW, 0))
        final_img_mobile.save(f"{combined_img}.mobile.png")
        payload = json.dumps({"action": "hydrate", "html": "<div></div>"})
        await page.evaluate(f'window.postMessage({payload}, "*")')
        p()

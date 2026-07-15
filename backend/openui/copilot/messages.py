from __future__ import annotations

import base64
import binascii
import re
from dataclasses import dataclass

from copilot import ModelInfo
from copilot.session import BlobAttachment

from .errors import CopilotProviderError


DATA_URL = re.compile(
    r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$",
    re.DOTALL,
)
DISPLAY_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}

# SDK 1.0.6 declares ModelVisionLimits, and each of its individual fields,
# as Optional (defaulting to None). A vision-capable model that omits some
# or all of them must not be treated as unrestricted (unlimited image
# count/size, any MIME type). These fallbacks are used only when
# supports.vision is True and the corresponding SDK field is missing;
# SDK-provided non-None values are always preserved exactly.
DEFAULT_VISION_MEDIA_TYPES: tuple[str, ...] = (
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
)  # matches DISPLAY_EXTENSIONS above
DEFAULT_MAX_PROMPT_IMAGES = 1  # matches OpenUI's single-screenshot request flow
DEFAULT_MAX_PROMPT_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MiB decoded bytes


def _invalid(code: str, detail: str) -> CopilotProviderError:
    return CopilotProviderError(400, code, detail)


def _max_encoded_length(max_bytes: int) -> int:
    """Maximum canonical base64 character length that can decode to at
    most ``max_bytes`` bytes (4 chars per 3-byte block, rounded up).

    This is a necessary but not sufficient bound: encoded lengths at or
    below this value can still decode to fewer bytes than the maximum
    depending on padding, so the exact decoded-length check must still
    run after decoding. Uses integer-only arithmetic (equivalent to
    ``4 * ceil(max_bytes / 3)``) to avoid float precision/overflow
    behavior for arbitrarily large SDK-provided integers.
    """
    return 4 * ((max_bytes + 2) // 3)


@dataclass(frozen=True)
class CopilotModel:
    id: str
    name: str
    supports_vision: bool
    supported_media_types: tuple[str, ...]
    max_prompt_images: int | None
    max_prompt_image_size: int | None

    @classmethod
    def from_sdk(cls, info: ModelInfo) -> "CopilotModel":
        supports_vision = info.capabilities.supports.vision
        if not supports_vision:
            return cls(
                id=info.id,
                name=info.name,
                supports_vision=False,
                supported_media_types=(),
                max_prompt_images=None,
                max_prompt_image_size=None,
            )

        vision = info.capabilities.limits.vision
        sdk_media_types = vision.supported_media_types if vision is not None else None
        sdk_max_images = vision.max_prompt_images if vision is not None else None
        sdk_max_image_size = (
            vision.max_prompt_image_size if vision is not None else None
        )

        return cls(
            id=info.id,
            name=info.name,
            supports_vision=True,
            supported_media_types=(
                tuple(media_type.lower() for media_type in sdk_media_types)
                if sdk_media_types is not None
                else DEFAULT_VISION_MEDIA_TYPES
            ),
            max_prompt_images=(
                sdk_max_images
                if sdk_max_images is not None
                else DEFAULT_MAX_PROMPT_IMAGES
            ),
            max_prompt_image_size=(
                sdk_max_image_size
                if sdk_max_image_size is not None
                else DEFAULT_MAX_PROMPT_IMAGE_SIZE
            ),
        )

    def to_api(self) -> dict[str, object]:
        return {
            "id": f"copilot/{self.id}",
            "name": self.name,
            "capabilities": {
                "vision": self.supports_vision,
                "supported_media_types": list(self.supported_media_types),
                "max_prompt_images": self.max_prompt_images,
                "max_prompt_image_size": self.max_prompt_image_size,
            },
        }


@dataclass(frozen=True)
class CopilotRequest:
    model_id: str
    system_prompt: str
    user_prompt: str
    attachments: list[BlobAttachment]


def _string_content(value: object, *, role: str) -> str:
    if not isinstance(value, str):
        raise _invalid(
            "copilot_invalid_messages",
            f"OpenUI requires string content for the {role} message.",
        )
    return value.strip()


def _decode_image(
    url: object,
    *,
    model: CopilotModel,
    index: int,
) -> BlobAttachment:
    if not isinstance(url, str):
        raise _invalid(
            "copilot_invalid_image",
            "The screenshot must be an inline image data URL.",
        )
    match = DATA_URL.fullmatch(url)
    if match is None:
        raise _invalid(
            "copilot_invalid_image",
            "Remote image URLs are not accepted; upload the screenshot directly.",
        )
    mime_type = match.group("mime").lower()
    # By this point the caller has already rejected images for non-vision
    # models, so `model.supports_vision` is True here. That means
    # `supported_media_types` is never an "omitted" placeholder — it is
    # either the SDK's explicit allowlist (which may legitimately be an
    # empty tuple, meaning "no MIME type is supported"; fail closed) or
    # the non-empty fallback applied in `CopilotModel.from_sdk` when the
    # SDK omitted the field entirely. Do not special-case emptiness here.
    if mime_type not in model.supported_media_types:
        raise _invalid(
            "copilot_image_type_unsupported",
            f"The selected Copilot model does not accept {mime_type} images.",
        )
    raw_data = match.group("data")
    if (
        model.max_prompt_image_size is not None
        and len(raw_data) > _max_encoded_length(model.max_prompt_image_size)
    ):
        # Reject grossly oversized encoded payloads before ever calling
        # base64.b64decode, so attacker-controlled data can't force
        # avoidable memory/CPU work. This bound is necessary but not
        # sufficient; the exact decoded-length check below still applies.
        raise _invalid(
            "copilot_image_too_large",
            "The screenshot exceeds the selected Copilot model's image limit.",
        )
    try:
        decoded = base64.b64decode(raw_data, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise _invalid(
            "copilot_invalid_image",
            "The screenshot data URL contains invalid base64 data.",
        ) from exc
    if base64.b64encode(decoded).decode("ascii") != raw_data:
        # base64.b64decode(..., validate=True) only checks that characters
        # come from the base64 alphabet; it does not reject non-canonical
        # padding where unused bits in the final block are non-zero (e.g.
        # "ZB==" decodes to the same byte as canonical "ZA=="). Comparing
        # the round-tripped re-encoding catches these aliases.
        raise _invalid(
            "copilot_invalid_image",
            "The screenshot data URL contains invalid base64 data.",
        )
    if not decoded:
        raise _invalid(
            "copilot_invalid_image",
            "The screenshot is empty.",
        )
    if (
        model.max_prompt_image_size is not None
        and len(decoded) > model.max_prompt_image_size
    ):
        raise _invalid(
            "copilot_image_too_large",
            "The screenshot exceeds the selected Copilot model's image limit.",
        )
    encoded = raw_data
    extension = DISPLAY_EXTENSIONS.get(mime_type, "img")
    return {
        "type": "blob",
        "data": encoded,
        "mimeType": mime_type,
        "displayName": f"screenshot-{index + 1}.{extension}",
    }


def parse_copilot_request(
    data: dict[str, object],
    model: CopilotModel,
) -> CopilotRequest:
    if data.get("model") != f"copilot/{model.id}":
        raise _invalid(
            "copilot_model_unavailable",
            "Refresh the model list and choose an available Copilot model.",
        )
    messages = data.get("messages")
    if not isinstance(messages, list) or not messages:
        raise _invalid(
            "copilot_invalid_messages",
            "At least one OpenUI message is required.",
        )

    system_parts: list[str] = []
    user_parts: list[str] = []
    attachments: list[BlobAttachment] = []

    for message in messages:
        if not isinstance(message, dict):
            raise _invalid(
                "copilot_invalid_messages",
                "Every OpenUI message must be an object.",
            )
        role = message.get("role")
        content = message.get("content")
        if role == "system":
            value = _string_content(content, role="system")
            if value:
                system_parts.append(value)
            continue
        if role != "user":
            raise _invalid(
                "copilot_invalid_messages",
                "Copilot generation accepts only system and user messages.",
            )
        if isinstance(content, str):
            value = content.strip()
            if value:
                user_parts.append(value)
            continue
        if not isinstance(content, list):
            raise _invalid(
                "copilot_invalid_messages",
                "The user message must contain text or an uploaded screenshot.",
            )
        for part in content:
            if not isinstance(part, dict):
                raise _invalid(
                    "copilot_invalid_messages",
                    "Every user-content part must be an object.",
                )
            part_type = part.get("type")
            if part_type == "text":
                text = part.get("text")
                if not isinstance(text, str):
                    raise _invalid(
                        "copilot_invalid_messages",
                        "Text content must be a string.",
                    )
                if text.strip():
                    user_parts.append(text.strip())
            elif part_type == "image_url":
                # Validate cheap constraints (vision support, image count) before
                # decoding attacker-controlled base64 data, so rejected requests
                # never pay the cost of decoding oversized/excess payloads.
                if not model.supports_vision:
                    raise _invalid(
                        "copilot_vision_unsupported",
                        "Choose a vision-capable Copilot model to use a screenshot.",
                    )
                if (
                    model.max_prompt_images is not None
                    and len(attachments) >= model.max_prompt_images
                ):
                    raise _invalid(
                        "copilot_too_many_images",
                        "Too many screenshots were supplied for the selected "
                        "Copilot model.",
                    )
                image_url = part.get("image_url")
                if not isinstance(image_url, dict):
                    raise _invalid(
                        "copilot_invalid_image",
                        "The screenshot must use OpenAI image_url object syntax.",
                    )
                attachments.append(
                    _decode_image(
                        image_url.get("url"),
                        model=model,
                        index=len(attachments),
                    )
                )
            else:
                raise _invalid(
                    "copilot_invalid_messages",
                    f"Unsupported user-content type: {part_type!r}.",
                )

    if not user_parts and not attachments:
        raise _invalid(
            "copilot_empty_request",
            "Enter a prompt or upload a screenshot.",
        )

    return CopilotRequest(
        model_id=model.id,
        system_prompt="\n\n".join(system_parts),
        user_prompt=(
            "\n\n".join(user_parts)
            if user_parts
            else "Generate HTML matching the attached screenshot."
        ),
        attachments=attachments,
    )

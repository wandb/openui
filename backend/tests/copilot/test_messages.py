import base64

import pytest
from copilot import (
    ModelCapabilities,
    ModelInfo,
    ModelLimits,
    ModelSupports,
    ModelVisionLimits,
)

from openui.copilot.errors import CopilotProviderError
from openui.copilot.messages import (
    CopilotModel,
    _max_encoded_length,
    parse_copilot_request,
)

# Fallback defaults the adapter must apply when an SDK ModelInfo declares
# vision support but omits (some or all of) the optional vision limit
# fields. Mirrored here (rather than imported) so the tests fail loudly if
# the adapter's public fallback values ever drift from what OpenUI expects.
DEFAULT_VISION_MEDIA_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
DEFAULT_MAX_PROMPT_IMAGES = 1
DEFAULT_MAX_PROMPT_IMAGE_SIZE = 10 * 1024 * 1024


def sdk_model(*, vision=True, max_size=1024):
    return ModelInfo(
        id="gpt-vision",
        name="GPT Vision",
        capabilities=ModelCapabilities(
            supports=ModelSupports(vision=vision),
            limits=ModelLimits(
                vision=ModelVisionLimits(
                    supported_media_types=["image/png", "image/jpeg"],
                    max_prompt_images=1,
                    max_prompt_image_size=max_size,
                )
                if vision
                else None
            ),
        ),
    )


def sdk_model_vision_supported_no_limits_object():
    """A vision-capable model where the SDK omits ModelVisionLimits
    entirely (``capabilities.limits.vision`` is ``None``)."""
    return ModelInfo(
        id="gpt-vision",
        name="GPT Vision",
        capabilities=ModelCapabilities(
            supports=ModelSupports(vision=True),
            limits=ModelLimits(vision=None),
        ),
    )


def sdk_model_vision_supported_empty_limits_fields():
    """A vision-capable model with a ``ModelVisionLimits`` object present
    but every optional field left at its SDK default of ``None``."""
    return ModelInfo(
        id="gpt-vision",
        name="GPT Vision",
        capabilities=ModelCapabilities(
            supports=ModelSupports(vision=True),
            limits=ModelLimits(vision=ModelVisionLimits()),
        ),
    )


def test_model_mapping_preserves_sdk_vision_metadata():
    model = CopilotModel.from_sdk(sdk_model())

    assert model.id == "gpt-vision"
    assert model.to_api() == {
        "id": "copilot/gpt-vision",
        "name": "GPT Vision",
        "capabilities": {
            "vision": True,
            "supported_media_types": ["image/png", "image/jpeg"],
            "max_prompt_images": 1,
            "max_prompt_image_size": 1024,
        },
    }


def test_text_request_separates_system_and_user_content():
    model = CopilotModel.from_sdk(sdk_model())

    request = parse_copilot_request(
        {
            "model": "copilot/gpt-vision",
            "messages": [
                {"role": "system", "content": "Generate only HTML."},
                {"role": "user", "content": "Build a dashboard."},
            ],
            "temperature": 0.7,
        },
        model,
    )

    assert request.model_id == "gpt-vision"
    assert request.system_prompt == "Generate only HTML."
    assert request.user_prompt == "Build a dashboard."
    assert request.attachments == []


def test_image_data_url_becomes_sdk_blob_attachment():
    image = base64.b64encode(b"png-bytes").decode("ascii")
    model = CopilotModel.from_sdk(sdk_model())

    request = parse_copilot_request(
        {
            "model": "copilot/gpt-vision",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Match this screenshot."},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image}"},
                        },
                    ],
                }
            ],
        },
        model,
    )

    assert request.attachments == [
        {
            "type": "blob",
            "data": image,
            "mimeType": "image/png",
            "displayName": "screenshot-1.png",
        }
    ]


def test_image_only_request_gets_an_explicit_prompt():
    image = base64.b64encode(b"png-bytes").decode("ascii")
    model = CopilotModel.from_sdk(sdk_model())

    request = parse_copilot_request(
        {
            "model": "copilot/gpt-vision",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{image}"},
                        }
                    ],
                }
            ],
        },
        model,
    )

    assert request.user_prompt == "Generate HTML matching the attached screenshot."


@pytest.mark.parametrize(
    "messages",
    [
        [{"role": "assistant", "content": "unsupported history"}],
        [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "https://example.com/private.png"},
                    }
                ],
            }
        ],
    ],
)
def test_unsupported_roles_and_remote_images_are_rejected(messages):
    model = CopilotModel.from_sdk(sdk_model())

    with pytest.raises(CopilotProviderError) as raised:
        parse_copilot_request(
            {"model": "copilot/gpt-vision", "messages": messages},
            model,
        )

    assert raised.value.status_code == 400


def test_image_is_rejected_for_non_vision_model():
    image = base64.b64encode(b"png-bytes").decode("ascii")
    model = CopilotModel.from_sdk(sdk_model(vision=False))

    with pytest.raises(CopilotProviderError) as raised:
        parse_copilot_request(
            {
                "model": "copilot/gpt-vision",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{image}"
                                },
                            }
                        ],
                    }
                ],
            },
            model,
        )

    assert raised.value.code == "copilot_vision_unsupported"


def image_messages(*urls):
    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": url},
                }
                for url in urls
            ],
        }
    ]


def assert_request_error(data, model, expected_code):
    with pytest.raises(CopilotProviderError) as raised:
        parse_copilot_request(data, model)
    assert raised.value.status_code == 400
    assert raised.value.code == expected_code


def test_invalid_image_base64_is_rejected():
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages("data:image/png;base64,%%%%"),
        },
        CopilotModel.from_sdk(sdk_model()),
        "copilot_invalid_image",
    )


def test_unsupported_image_mime_type_is_rejected():
    image = base64.b64encode(b"svg").decode("ascii")
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/svg+xml;base64,{image}"),
        },
        CopilotModel.from_sdk(sdk_model()),
        "copilot_image_type_unsupported",
    )


def test_image_count_limit_is_enforced():
    image = base64.b64encode(b"png").decode("ascii")
    url = f"data:image/png;base64,{image}"
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(url, url),
        },
        CopilotModel.from_sdk(sdk_model()),
        "copilot_too_many_images",
    )


def test_decoded_image_byte_limit_is_enforced():
    image = base64.b64encode(b"too-large").decode("ascii")
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/png;base64,{image}"),
        },
        CopilotModel.from_sdk(sdk_model(max_size=2)),
        "copilot_image_too_large",
    )


@pytest.mark.parametrize(
    ("data", "expected_code"),
    [
        (
            {
                "model": "gpt-vision",
                "messages": [{"role": "user", "content": "Build it."}],
            },
            "copilot_model_unavailable",
        ),
        (
            {"model": "copilot/gpt-vision"},
            "copilot_invalid_messages",
        ),
        (
            {
                "model": "copilot/gpt-vision",
                "messages": [{"role": "user", "content": "   "}],
            },
            "copilot_empty_request",
        ),
    ],
)
def test_invalid_request_shapes_are_rejected(data, expected_code):
    assert_request_error(
        data,
        CopilotModel.from_sdk(sdk_model()),
        expected_code,
    )


def test_vision_unsupported_is_rejected_before_decoding_malformed_image():
    # A non-vision model must reject on capability, not on the (unrelated)
    # malformed base64 payload, and must not attempt to decode it at all.
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages("data:image/png;base64,%%%%"),
        },
        CopilotModel.from_sdk(sdk_model(vision=False)),
        "copilot_vision_unsupported",
    )


def test_excess_images_are_rejected_before_decoding_their_payload():
    # The second image exceeds max_prompt_images=1 and is intentionally
    # malformed; it must be rejected for the count limit, not decoded.
    image = base64.b64encode(b"png-bytes").decode("ascii")
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(
                f"data:image/png;base64,{image}",
                "data:image/png;base64,%%%%",
            ),
        },
        CopilotModel.from_sdk(sdk_model()),
        "copilot_too_many_images",
    )


@pytest.mark.parametrize("alias", ["ZB==", "ZC==", "ZD=="])
def test_noncanonical_base64_padding_alias_is_rejected(alias):
    # ZA==, ZB==, ZC==, ZD== all decode to b'd' with base64.b64decode(...,
    # validate=True) because validate=True only checks the character
    # alphabet, not that the unused padding bits are zero. Only ZA== is
    # the canonical encoding; the others are non-canonical aliases of the
    # same byte and must be rejected rather than silently accepted.
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/png;base64,{alias}"),
        },
        CopilotModel.from_sdk(sdk_model()),
        "copilot_invalid_image",
    )


def test_canonical_base64_padding_is_still_accepted():
    model = CopilotModel.from_sdk(sdk_model())

    request = parse_copilot_request(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages("data:image/png;base64,ZA=="),
        },
        model,
    )

    assert request.attachments == [
        {
            "type": "blob",
            "data": "ZA==",
            "mimeType": "image/png",
            "displayName": "screenshot-1.png",
        }
    ]


def test_oversized_encoded_image_is_rejected_before_decoding(monkeypatch):
    # A grossly oversized encoded payload (far beyond what could possibly
    # decode within the model's max_prompt_image_size) must be rejected
    # by a cheap length check without ever invoking base64.b64decode.
    calls = []
    original_b64decode = base64.b64decode

    def spy(*args, **kwargs):
        calls.append(args)
        return original_b64decode(*args, **kwargs)

    monkeypatch.setattr(base64, "b64decode", spy)

    oversized_encoded = "A" * 100
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(
                f"data:image/png;base64,{oversized_encoded}"
            ),
        },
        CopilotModel.from_sdk(sdk_model(max_size=3)),
        "copilot_image_too_large",
    )
    assert calls == []


def test_boundary_size_canonical_image_still_succeeds():
    # 4 encoded chars is exactly the canonical max length for 3 decoded
    # bytes (4 * ceil(3 / 3) == 4); this must still be accepted.
    image = base64.b64encode(b"abc").decode("ascii")
    model = CopilotModel.from_sdk(sdk_model(max_size=3))

    request = parse_copilot_request(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/png;base64,{image}"),
        },
        model,
    )

    assert request.attachments == [
        {
            "type": "blob",
            "data": image,
            "mimeType": "image/png",
            "displayName": "screenshot-1.png",
        }
    ]


@pytest.mark.parametrize(
    "sdk_info_factory",
    [sdk_model_vision_supported_no_limits_object, sdk_model_vision_supported_empty_limits_fields],
    ids=["no_vision_limits_object", "empty_vision_limits_fields"],
)
def test_model_mapping_falls_back_to_safe_defaults_when_sdk_omits_vision_limits(
    sdk_info_factory,
):
    # SDK 1.0.6 declares ModelVisionLimits (and each of its fields) as
    # Optional, defaulting to None. A vision-capable model that omits
    # them must not be treated as unrestricted; the adapter must apply
    # bounded fallback defaults instead.
    model = CopilotModel.from_sdk(sdk_info_factory())

    assert model.to_api() == {
        "id": "copilot/gpt-vision",
        "name": "GPT Vision",
        "capabilities": {
            "vision": True,
            "supported_media_types": list(DEFAULT_VISION_MEDIA_TYPES),
            "max_prompt_images": DEFAULT_MAX_PROMPT_IMAGES,
            "max_prompt_image_size": DEFAULT_MAX_PROMPT_IMAGE_SIZE,
        },
    }


@pytest.mark.parametrize(
    "sdk_info_factory",
    [sdk_model_vision_supported_no_limits_object, sdk_model_vision_supported_empty_limits_fields],
    ids=["no_vision_limits_object", "empty_vision_limits_fields"],
)
def test_fallback_media_type_allowlist_rejects_unlisted_image_type(sdk_info_factory):
    model = CopilotModel.from_sdk(sdk_info_factory())
    image = base64.b64encode(b"svg").decode("ascii")

    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/svg+xml;base64,{image}"),
        },
        model,
        "copilot_image_type_unsupported",
    )


@pytest.mark.parametrize(
    "sdk_info_factory",
    [sdk_model_vision_supported_no_limits_object, sdk_model_vision_supported_empty_limits_fields],
    ids=["no_vision_limits_object", "empty_vision_limits_fields"],
)
def test_fallback_max_prompt_images_rejects_second_image(sdk_info_factory):
    model = CopilotModel.from_sdk(sdk_info_factory())
    image = base64.b64encode(b"png").decode("ascii")
    url = f"data:image/png;base64,{image}"

    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(url, url),
        },
        model,
        "copilot_too_many_images",
    )


def test_max_encoded_length_uses_integer_arithmetic_for_the_10mib_fallback():
    # Prove the boundary math directly, without allocating a multi-megabyte
    # test payload: the canonical max encoded length for a 10 MiB decoded
    # cap is 4 * ceil(10 MiB / 3), computed here with integer-only division.
    ten_mib = 10 * 1024 * 1024
    assert ten_mib % 3 == 1  # exercises the "needs rounding up" branch
    assert _max_encoded_length(ten_mib) == 4 * ((ten_mib + 2) // 3)
    assert _max_encoded_length(ten_mib) == 13_981_016


@pytest.mark.parametrize(
    "sdk_info_factory",
    [sdk_model_vision_supported_no_limits_object, sdk_model_vision_supported_empty_limits_fields],
    ids=["no_vision_limits_object", "empty_vision_limits_fields"],
)
def test_fallback_oversized_encoded_image_is_rejected_before_decoding(
    sdk_info_factory, monkeypatch
):
    # Reuses the arithmetic proven above rather than constructing a real
    # ~10 MiB image: a placeholder string one character past the fallback
    # threshold is enough to prove the pre-decode rejection, and it must
    # never reach base64.b64decode.
    model = CopilotModel.from_sdk(sdk_info_factory())
    assert model.max_prompt_image_size == DEFAULT_MAX_PROMPT_IMAGE_SIZE

    calls = []
    original_b64decode = base64.b64decode

    def spy(*args, **kwargs):
        calls.append(args)
        return original_b64decode(*args, **kwargs)

    monkeypatch.setattr(base64, "b64decode", spy)

    threshold = _max_encoded_length(DEFAULT_MAX_PROMPT_IMAGE_SIZE)
    oversized_encoded = "A" * (threshold + 1)

    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/png;base64,{oversized_encoded}"),
        },
        model,
        "copilot_image_too_large",
    )
    assert calls == []


def test_non_vision_model_still_exposes_empty_media_types_and_no_limits():
    # Non-vision models must not receive fallback vision defaults; this
    # guards the existing behavior against regressing while adding the
    # vision-capable fallback path.
    model = CopilotModel.from_sdk(sdk_model(vision=False))

    assert model.supported_media_types == ()
    assert model.max_prompt_images is None
    assert model.max_prompt_image_size is None


def test_sdk_provided_vision_limits_are_preserved_exactly_not_overridden():
    # When the SDK *does* supply vision limits, the adapter must use them
    # as-is rather than the fallback defaults.
    model = CopilotModel.from_sdk(sdk_model(max_size=2048))

    assert model.supported_media_types == ("image/png", "image/jpeg")
    assert model.max_prompt_images == 1
    assert model.max_prompt_image_size == 2048


def sdk_model_vision_supported_explicit_empty_media_types():
    """A vision-capable model where the SDK *explicitly* declares an empty
    ``supported_media_types`` list (as opposed to omitting the field
    entirely). This must be distinguished from the omitted/None case: an
    explicit empty list means the model supports no MIME types and every
    image must be rejected (fail closed), not treated as "no restriction"."""
    return ModelInfo(
        id="gpt-vision",
        name="GPT Vision",
        capabilities=ModelCapabilities(
            supports=ModelSupports(vision=True),
            limits=ModelLimits(
                vision=ModelVisionLimits(
                    supported_media_types=[],
                    max_prompt_images=1,
                    max_prompt_image_size=1024,
                )
            ),
        ),
    )


def test_explicit_empty_media_type_allowlist_is_preserved_and_fails_closed():
    model = CopilotModel.from_sdk(sdk_model_vision_supported_explicit_empty_media_types())

    # from_sdk must preserve the SDK's explicit empty list exactly, not
    # substitute the omitted-field fallback allowlist.
    assert model.to_api() == {
        "id": "copilot/gpt-vision",
        "name": "GPT Vision",
        "capabilities": {
            "vision": True,
            "supported_media_types": [],
            "max_prompt_images": 1,
            "max_prompt_image_size": 1024,
        },
    }

    png_image = base64.b64encode(b"png-bytes").decode("ascii")
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/png;base64,{png_image}"),
        },
        model,
        "copilot_image_type_unsupported",
    )

    svg_image = base64.b64encode(b"svg").decode("ascii")
    assert_request_error(
        {
            "model": "copilot/gpt-vision",
            "messages": image_messages(f"data:image/svg+xml;base64,{svg_image}"),
        },
        model,
        "copilot_image_type_unsupported",
    )

import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

TAG_FILE = Path(__file__).resolve().parent / "data" / "all_tags.json"
CUSTOM_TAG_PATTERN = re.compile(r"^[a-z0-9]+(?:[ _-][a-z0-9]+)*$")
MAX_FINAL_TAGS = 5
MAX_CUSTOM_TAGS = 3


@lru_cache(maxsize=1)
def allowed_tags():
    with TAG_FILE.open(encoding="utf-8") as file:
        return [tag for tag, _count in json.load(file)]


def candidates_for(description: str):
    words = set(re.findall(r"[a-z]{3,}", description.lower()))
    matches = [
        tag for tag in allowed_tags()
        if words.intersection(re.findall(r"[a-z]{3,}", tag.replace("_", " ").lower()))
    ]
    return list(dict.fromkeys(matches + allowed_tags()[:160]))[:220]


def validate_final_tags(ai_tags, custom_tags):
    """Validate the artist's final choices, never trusting browser input."""
    if ai_tags is None:
        ai_tags = []
    if custom_tags is None:
        custom_tags = []
    if not isinstance(ai_tags, list) or not isinstance(custom_tags, list):
        raise ValueError("Tags must be submitted as lists.")
    if len(custom_tags) > MAX_CUSTOM_TAGS:
        raise ValueError(f"You can add up to {MAX_CUSTOM_TAGS} manual tags.")

    approved_tags = set(allowed_tags())
    selected_ai_tags = []
    for tag in ai_tags:
        if not isinstance(tag, str) or tag not in approved_tags:
            raise ValueError("One or more selected AI tags are not valid.")
        if tag not in selected_ai_tags:
            selected_ai_tags.append(tag)

    normalized_custom_tags = []
    for tag in custom_tags:
        if not isinstance(tag, str):
            raise ValueError("Manual tags must be text.")
        normalized = tag.strip().lower()
        if not 2 <= len(normalized) <= 40 or not CUSTOM_TAG_PATTERN.fullmatch(normalized):
            raise ValueError(
                "Manual tags must be 2–40 letters or numbers; spaces, hyphens, and underscores are allowed."
            )
        normalized = re.sub(r"[\s-]+", "_", normalized)
        if normalized not in normalized_custom_tags:
            normalized_custom_tags.append(normalized)

    final_tags = list(dict.fromkeys(selected_ai_tags + normalized_custom_tags))
    if len(final_tags) > MAX_FINAL_TAGS:
        raise ValueError(f"Choose up to {MAX_FINAL_TAGS} tags in total.")
    return final_tags


def generate_tags(description: str):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("AI tagging is not configured.")

    candidates = candidates_for(description)

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-oss-20b",
                "max_tokens": 600,
                "temperature": 0,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "tag_suggestion",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "properties": {
                                "tags": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "minItems": 3,
                                    "maxItems": 8,
                                }
                            },
                            "required": ["tags"],
                            "additionalProperties": False,
                        },
                    },
                },
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You tag artwork listings. Suggest 5 to 8 tags when possible (at least 3) only from the "
                            "supplied allowed tag list. Do not invent or alter tags."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Artwork description:\n{description}\n\n"
                            f"Allowed tags:\n{', '.join(candidates)}"
                        ),
                    },
                ],
            },
            timeout=20,
        )
    except requests.exceptions.RequestException as exc:
        logger.error("Groq request error: %s", exc)
        raise RuntimeError("AI tagging could not generate tags right now.")

    if not response.ok:
        logger.error(
            "Groq tagging request failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        raise RuntimeError("AI tagging could not generate tags right now.")

    try:
        content = response.json()["choices"][0]["message"]["content"]
        result = json.loads(content)
    except (KeyError, IndexError, json.JSONDecodeError):
        raise RuntimeError("AI tagging returned an unexpected response. Please try again.")

    tags = list(dict.fromkeys(tag for tag in result.get("tags", []) if tag in candidates))
    if len(tags) < 3:
        raise RuntimeError("AI tagging returned invalid tags. Please try again.")
    return tags

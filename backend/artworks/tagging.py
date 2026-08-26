import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

TAG_FILE = Path(__file__).resolve().parent / "data" / "all_tags.json"


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
                                    "maxItems": 5,
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
                            "You tag artwork listings. Select 3 to 5 tags only from the "
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

    tags = [tag for tag in result.get("tags", []) if tag in candidates]
    if len(tags) < 3:
        raise RuntimeError("AI tagging returned invalid tags. Please try again.")
    return tags
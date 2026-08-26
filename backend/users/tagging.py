import json
import os
import re
from functools import lru_cache
from pathlib import Path

import requests


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
    # Include common art tags so abstract descriptions still have useful choices.
    return list(dict.fromkeys(matches + allowed_tags()[:160]))[:220]


def generate_tags(description: str):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OpenAI tagging is not configured.")

    candidates = candidates_for(description)
    schema = {
        "type": "object",
        "properties": {
            "tags": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 5},
        },
        "required": ["tags"],
        "additionalProperties": False,
    }
    response = requests.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "gpt-5-mini",
            "max_output_tokens": 120,
            "input": [
                {"role": "system", "content": [{"type": "input_text", "text": "You tag artwork listings. Select 3 to 5 tags only from the supplied allowed tag list. Do not invent or alter tags."}]},
                {"role": "user", "content": [{"type": "input_text", "text": f"Artwork description:\n{description}\n\nAllowed tags:\n{', '.join(candidates)}"}]},
            ],
            "text": {"format": {"type": "json_schema", "name": "artwork_tags", "strict": True, "schema": schema}},
        },
        timeout=20,
    )
    if not response.ok:
        raise RuntimeError("OpenAI could not generate tags right now.")

    result = json.loads(response.json()["output_text"])
    tags = [tag for tag in result["tags"] if tag in candidates]
    if len(tags) < 3:
        raise RuntimeError("OpenAI returned invalid tags. Please try again.")
    return tags

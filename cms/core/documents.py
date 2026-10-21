import re
from rest_framework import serializers
from .registry import registry


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or data.keys() - self.fields.keys():
            raise serializers.ValidationError({"non_field_errors": ["Unknown or read-only fields."]})
        return super().to_internal_value(data)


class BlockSerializer(StrictSerializer):
    key = serializers.RegexField(r"^[a-z0-9][a-z0-9-]{0,79}$")
    kind = serializers.CharField(max_length=80)
    slot = serializers.SlugField(default="main")
    enabled = serializers.BooleanField(default=True)
    props = serializers.JSONField()

    def validate(self, value):
        module = registry.modules.get(value["kind"])
        if not module:
            raise serializers.ValidationError("Unregistered module.")
        value["props"] = module.validate(value["props"])
        return value


class MenuItemSerializer(StrictSerializer):
    label = serializers.CharField(max_length=80)
    href = serializers.CharField(max_length=2048)

    def validate_href(self, value):
        if re.fullmatch(r"/(?!/)[^\s\\]*|#[a-zA-Z0-9-]+", value):
            return value
        if re.fullmatch(r"https://[a-zA-Z0-9.-]+(?::\d+)?(?:/[^\s\\]*)?", value):
            return value
        raise serializers.ValidationError("Use a local path, anchor, or HTTPS URL.")


class DocumentSerializer(StrictSerializer):
    revision = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=160)
    layout = serializers.SlugField()
    theme = serializers.SlugField()
    menu = MenuItemSerializer(many=True, max_length=20)
    blocks = BlockSerializer(many=True, max_length=60)

    def validate_blocks(self, value):
        if len({block["key"] for block in value}) != len(value):
            raise serializers.ValidationError("Block keys must be unique.")
        return value


def theme_tokens(tokens):
    if not isinstance(tokens, dict) or set(tokens) != {"background", "panel", "accent", "text"}:
        raise serializers.ValidationError("Supply background, panel, accent and text theme tokens.")
    if any(not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value) for value in tokens.values()):
        raise serializers.ValidationError("Theme tokens must be six-digit hex colors.")
    return tokens


def layout_tree(layout, blocks):
    definition = layout.definition
    if layout.renderer not in registry.layouts:
        raise serializers.ValidationError("Layout renderer is not installed.")
    if not isinstance(definition, dict) or set(definition) != {"sections"} or not isinstance(definition["sections"], list):
        raise serializers.ValidationError("Layout requires a sections array.")
    sections = definition["sections"]
    if not 1 <= len(sections) <= 10 or any(not isinstance(s, dict) or set(s) != {"slot", "columns"} or
        not isinstance(s["slot"], str) or not re.fullmatch(r"[a-z0-9-]{1,50}", s["slot"]) or
        type(s["columns"]) is not int or s["columns"] not in (1, 2, 3) for s in sections):
        raise serializers.ValidationError("Each section requires a unique slot and 1-3 columns.")
    slots = [s["slot"] for s in sections]
    if len(set(slots)) != len(slots) or any(b["slot"] not in slots for b in blocks):
        raise serializers.ValidationError("Blocks must belong to a declared unique layout slot.")
    return [{"slot": s["slot"], "columns": s["columns"],
             "blocks": [b for b in blocks if b["slot"] == s["slot"] and b["enabled"]]} for s in sections]

from dataclasses import dataclass
from typing import Callable
from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class Module:
    key: str
    label: str
    validate: Callable
    data: Callable | None = None
    properties: type | None = None


class Registry:
    def __init__(self):
        self.modules = {}
        self.layouts = {}
        self.plugin_urls = []
        self.publish_hooks = []

    def register(self, module):
        if module.key in self.modules:
            raise ImproperlyConfigured(f"Duplicate CMS module: {module.key}")
        self.modules[module.key] = module

    def layout(self, key, template):
        if key in self.layouts:
            raise ImproperlyConfigured(f"Duplicate CMS layout: {key}")
        self.layouts[key] = template


registry = Registry()

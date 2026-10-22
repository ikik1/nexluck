import ast
import html
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from build_catalog import DIRECTORY, LANGUAGES, render

ROOT = DIRECTORY.parent


class CatalogTests(unittest.TestCase):
    def test_all_supported_languages_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.json"
            catalog = {language: {"Hello {name}": "Hello {name}"} for language in LANGUAGES}
            with patch("build_catalog.DIRECTORY", Path(directory)):
                path.write_text(json.dumps(catalog))
                self.assertIn('"pt-BR"', render())
                del catalog["pt-BR"]
                path.write_text(json.dumps(catalog))
                with self.assertRaisesRegex(ValueError, "all supported languages"):
                    render()

    def test_regional_catalogs_require_complete_keys_and_placeholders(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.json"
            catalog = {language: {"Hello {name}": "Hello {name}"} for language in LANGUAGES}
            with patch("build_catalog.DIRECTORY", Path(directory)):
                catalog["pt-PT"] = {}
                path.write_text(json.dumps(catalog))
                with self.assertRaisesRegex(ValueError, "all supported languages"):
                    render()
                catalog["pt-PT"] = {"Hello {name}": "Olá"}
                path.write_text(json.dumps(catalog))
                with self.assertRaisesRegex(ValueError, "placeholders differ"):
                    render()

    def test_generated_catalog_is_current(self):
        self.assertEqual((DIRECTORY / "catalog.js").read_text(), render())

    def test_translations_preserve_protocol_names(self):
        names = ("X-Casino-Id", "Accept-Language", "Content-Language", "Idempotency-Key",
                 "Content-Type", "Authorization", "CRM_UI_MODE", "YYYY-MM-DD")
        for path in DIRECTORY.glob("*.json"):
            catalog = json.loads(path.read_text())
            for locale, entries in catalog.items():
                for source, translation in entries.items():
                    for name in names:
                        if name in source:
                            self.assertEqual(source.count(name), translation.count(name),
                                             (path.name, locale, source, name))

    def test_crm_literal_references_exist(self):
        catalog = json.loads((DIRECTORY / "crm.json").read_text())["en"]
        missing = set()
        for pattern in ("**/*.js", "**/*.jsx", "**/*.html"):
            for path in (ROOT / "crm").glob(pattern):
                if "test" in path.parts:
                    continue
                source = path.read_text()
                literals = re.findall(
                    r'NexLuckI18n\.(?:t|html)\(("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')',
                    source,
                )
                keys = [ast.literal_eval(literal) for literal in literals]
                keys += [html.unescape(key) for key in re.findall(
                    r'data-i18n(?:-title|-placeholder|-aria-label)?="([^"]+)"', source)]
                missing.update(key for key in keys if key not in catalog)
        self.assertEqual(missing, set())

    def test_all_crm_pages_load_shared_runtime_first(self):
        for path in (ROOT / "crm").glob("**/*.html"):
            source = path.read_text()
            self.assertLess(source.index("/localization/catalog.js"), source.index("/localization/runtime.js"))
            self.assertLess(source.index("/localization/runtime.js"), source.index("/crm/context.js"))


if __name__ == "__main__":
    unittest.main()

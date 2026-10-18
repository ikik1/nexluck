# Games

`/crm/g/` is the CRM Games page; `/g/` redirects there. The Games home tile and
navigation open the catalog. The table follows the bonus list's active/inactive
row colors and pencil action. Double-click a row to edit; right-click (or
Shift+F10) opens Enable/Disable. Updates are saved on the server.

Filters combine with AND. Selected categories combine with OR. Search matches
IDs, name, publisher, category, tags and segment names. Publisher groups have
local demo monogram marks, not official publisher artwork. The seeded game
properties, provider assignments and contribution values are demo data.

The Game categories popup searches, filters, creates and renames categories.
Category IDs remain stable on rename. Game ID, publisher, creation time and
provider contribution are read-only. ExternalID is unique without case
distinctions. RTP and bonus contribution range from 0 to 100; multiplier is
nonnegative (up to 1 billion). Empty contribution override inherits the provider
default. The table shows the effective value followed by the gray provider value.
Tags are comma-separated in the editor. Segments use the shared Segments popup
with double-click toggles. "Jackpot" is the attribute label.

`crm/api/game_catalog.rb` extends the existing private CustomerStore with game
catalog persistence in `games.json`, using its atomic writes and 0600 permissions.
Deploy this Ruby module alongside `server.rb`, `customers.rb`, and `segments.rb`,
then restart the API. Existing customer and segment files are unaffected.
Game/category edits and enabled flags survive restarts.

UI API: `/crm/ui-api/v1/games` (GET), `/games/{id}` (GET/PATCH),
`/games/publishers` (GET), `/games/categories` (GET/POST), and
`/games/categories/{id}` (PATCH). The secured equivalents under `/crm/api/v1`
require `games:read` or `games:write`. The existing game list also accepts
`bonuses:read` for compatibility. The original `id`, `name`, `category` keys
are preserved for bonus linking; additional properties are additive. Existing
bonus rule category constants remain unchanged.

Swagger documents all operations. As elsewhere in this prototype, put the UI
API behind authenticated operator sessions, permissions and CSRF protection
before using real data. No third-party game integration or live game control is
implemented here.

Validation: `python3 crm/api/test/game_browser_test.py` and
`python3 crm/api/test/segment_browser_test.py`.

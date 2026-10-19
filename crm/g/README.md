# Games

`/crm/g/` is the CRM Games page; `/g/` redirects there. The Games home tile and
navigation open the catalog. The table follows the bonus list's active/inactive
row colors and pencil action. Double-click a row to edit; right-click (or
Shift+F10) opens Enable/Disable. Updates are saved on the server.

Filters combine with AND. Selected categories combine with OR. Search matches
IDs, name, publisher, category, tags and segment names. Publisher groups have
local demo monogram marks, not official publisher artwork. The seeded game
properties, provider assignments and contribution values are demo data.
The initial catalog contains 100 uniquely named games and 20 distinct categories
(18 static and the two dynamic definitions). The 88 additional, fictional demo
games are spread across themed categories and demo provider assignments.
A versioned, one-time expansion also upgrades existing catalogs without
overwriting saved games, category properties, memberships or manual order.
Custom categories are preserved, so an existing catalog may contain more than 20.
Seeded categories also receive sample segment memberships and tags in a one-time
migration, filling only empty selections and using existing segment names.
Segment and tag badges appear to the left of each category title in the list.
Subsequent restarts preserve edits, including deliberately cleared selections.

The Game categories popup shows a many-to-many view: select a category to see its
ordered games and all their category memberships. Check static categories to
filter the main list (OR). Category rows and the selected category's games have
independent, keyboard-focusable scroll areas, with search, sorting and action
controls outside the lists. On narrow screens the panels stack with individually
bounded lists.
New/edit properties include name, unique CMS identifier,
multiple segments and multiple tags. Game selection lives in the **Add games**
right-side sliding panel below the category's game list, not in the new/edit
properties form. The panel searches games and providers, with games grouped by
provider. Selecting a provider selects all its games, including those hidden by
search; Add selected games saves the selection. Double-click a game to add it
immediately, or use its + button for keyboard/touch. Existing members are marked
and cannot be added twice. Adding leaves other category memberships unchanged.
Tags can be selected or added; segments
use the shared double-click-toggle picker.

Drag a game onto another row to move it to that position; aligned arrow buttons support
keyboard and touch. Changes save immediately and switch sorting to Custom.
The x button removes membership from this category only.
Clear all games sits above the game list on the right and saves an empty
membership list for the selected category only; game records and other
categories are unchanged. It is disabled when the list is empty or saving.
Auto-sort supports Popularity (descending score), New (newest creation date),
and Most played (descending count); ties sort by name and ID. The chosen preset
also sorts newly added games. Scores and counts are persisted **demo statistics**,
shown as such in both the game table and category view, not live analytics.
Recent games (teal) and Favourite games (pink) are dynamic category definitions
only. Their name/CMS/segments/tags can be edited, but fixed membership, copying,
sorting and catalog filtering are unavailable; customer-specific resolution is
not implemented.

Category IDs and CMS identifiers remain stable on rename. Game ID, publisher, creation time and
provider contribution are read-only. ExternalID is unique without case
distinctions. RTP and bonus contribution range from 0 to 100; multiplier is
nonnegative (up to 1 billion). Empty contribution override inherits the provider
default. The table shows the effective value followed by the gray provider value.
Tags are comma-separated in the editor. Segments use the shared Segments popup
with double-click toggles. "Jackpot" is the attribute label.
The title's Enabled/Disabled switch controls frontend availability only; disabled
games remain editable. Segments sit alongside Variance. The contribution override
shows the actual read-only provider percentage beside the input; blank still
inherits. All checkbox list frames and their legends have inner spacing.
Categories are a read-only preview with a "Click to edit" hover/focus overlay.
Opening it shows the category manager with the first checked category highlighted;
its checkboxes change this game's category memberships immediately. Other game
fields remain draft until Save game, and Cancel does not undo category changes
already saved in the manager.

`crm/api/game_catalog.rb` extends the existing private CustomerStore with game
catalog persistence in `games.json`, using its atomic writes and 0600 permissions.
Deploy this Ruby module alongside `server.rb`, `customers.rb`, and `segments.rb`,
then restart the API. Existing customer and segment files are unaffected.
The frontend and API must be updated together. If the API still serves the old
category/statistics schema, the page shows a restart-and-retry error rather than
attempting to render incompatible records.
Game/category edits, order and enabled flags survive restarts. On first load of
an older catalog, existing single-category membership is migrated without losing
edits. Ordered `game_ids` on categories are the membership source of truth.

UI API: `/crm/ui-api/v1/games` (GET), `/games/{id}` (GET/PATCH),
`/games/publishers` (GET), `/games/categories` (GET/POST), and
`/games/categories/{id}` (PATCH). The secured equivalents under `/crm/api/v1`
require `games:read` or `games:write`. The existing game list also accepts
`bonuses:read` for compatibility. The original `id`, `name`, `category` keys
are preserved for bonus linking; `category_ids` exposes all memberships.
Legacy `category` reads the primary membership (empty if none); writing it alone
replaces memberships with that one category. Writing `category_ids` replaces
all memberships without duplicating game records. Existing
bonus rule category constants remain unchanged. The bonus single-game picker
includes games in custom categories and uncategorized games, grouped by primary
category without repeating multi-category games.

Swagger documents all operations. As elsewhere in this prototype, put the UI
API behind authenticated operator sessions, permissions and CSRF protection
before using real data. No third-party game integration or live game control is
implemented here.

Validation: `python3 crm/api/test/game_browser_test.py` and
`python3 crm/api/test/segment_browser_test.py`.

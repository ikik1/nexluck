# Conversational navigation

The shared CRM chrome replaces the old Navigate to dropdown with local phrase
matching and autocomplete. No external AI service is called and no CRM data is
sent to a model. `CRM_PAGE_INDEX` in `data.js` indexes all CRM HTML pages and
section destinations, with aliases and bonus/customer detail templates.

Examples: "Show me list of games", "list of customers", "payment cascades",
"swagger", "customer CU-1001", or "edit bonus BN-1001". A profile/editor request
without an ID opens the corresponding list to choose an entity. New bonus and
AI-assisted bonus creation have separate entries. Inline actions such as game
categories and payment connection editing are reached through their parent
pages; no fictitious standalone routes are generated.

Analytics now opens `/crm/a/` from the home tile and requests such as
"analytics", "management reports", "financial performance" or "retention".
`/a/` and the previous Analytics section URL lead to the same dashboard.
The report data is explicitly synthetic; its specifications and sources are
in [Analytics report specifications](a/REPORTS.md).

My Casinos opens `/crm/c/l/` from Home, the legacy casinos section, and
requests such as "my casinos", "casino websites" or "CMS".
See [website configuration](c/l/README.md) for settings and status behavior.

Compliance opens `/coml/` from Home or a "compliance" navigation request.
It retains casino context like the other operational pages. See the
[Compliance guide](../coml/README.md) for payout/KYC queues, alerts and risk scores.

Type to see destinations, use Up/Down to highlight, Tab to fill the highlighted
suggestion, Enter/Go to navigate, and Escape to dismiss suggestions. Clicking a
suggestion navigates directly. Unmatched phrases show an explicit message.
The navigation section starts hidden unless pinned. It starts sliding up
immediately when the pointer leaves the navigation area, without a timeout.
Revealing and hiding use a 240ms slide-down/up animation. Reduced-motion
preferences skip the animation. Moving back into the area reverses a closing
slide without waiting for it to finish.
Move the pointer above the page title (header/subbar) to reveal it. Hovering
the subbar or focusing navigation controls keeps it open. An AI navigation
menu icon (three lines and a sparkle) remains available for keyboard and touch
users, with an accessible label and tooltip; breadcrumbs stay visible.
The pin icon beside Navigate to disables auto-hide while pressed. This preference
persists in this browser across pages and reloads. Unpinning restores immediate
slide-up once the pointer and keyboard focus leave navigation.

The eight most recent successful navigation requests are stored only in this
browser's localStorage and shown as tags beside Navigate to. Clicking a tag
repeats its request. Clear recent requests removes this history. It is not an
account-wide history; do not include secrets in navigation requests.
Stored requests are validated and rendered with textContent, never HTML.
Unavailable/corrupt storage does not prevent navigation and is reported.

When adding a page, update `CRM_PAGE_INDEX` or `SECTIONS` and bump the shared
script version on CRM entry points. `navigation_browser_test.py` checks that
every CRM HTML entry point has a navigation destination or detail template.

Validation: `python3 crm/api/test/navigation_browser_test.py`.

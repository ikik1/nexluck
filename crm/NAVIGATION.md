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

Type to see destinations, use Up/Down to highlight, Tab to fill the highlighted
suggestion, Enter/Go to navigate, and Escape to dismiss suggestions. Clicking a
suggestion navigates directly. Unmatched phrases show an explicit message.

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

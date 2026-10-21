# My Casinos

`/crm/c/l/` lists saved casino websites. Home's My Casinos tile, conversational
navigation (including websites/CMS) and the legacy casinos section link open it.
An empty store is prepopulated with five fictional demo websites: Aurora,
Coast, Crown, Emerald and Lunar, using reserved `.example` URLs and a mix of
skins. Nonempty stores are preserved, including edits and disabled status.
The Home tile's existing sample KPIs are not a live website count.

- Add new web-site requires Name (1-120 characters), an absolute HTTP(S) URL
  without embedded credentials (max 2048 characters), and a skin.
- Themes are Classic, Modern and Dark, with illustrative previews.
- CMS edit opens the separate Django visual editor at `/cms/?crm_site=<id>`,
  with CMS login and explicit site connection. The Settings action retains
  the Name, URL and Theme form.
- Right-click, Shift+F10 on a focused row, or the Actions button exposes
  Disable/Enable. Disabled websites remain visible, gray and explicitly labeled;
  their settings remain editable.
- Dates are server-owned UTC creation/update timestamps. Website status and
  settings survive reloads and server restarts.

This is stored CRM configuration only: saving a skin does not deploy it,
CMS edit opens the local CMS engine, and Disable does not shut down an
external website. Existing Analytics demo websites remain fictional and separate.
CMS imports are explicit snapshots; subsequent website configuration changes
are not automatically synchronized into the CMS.
Creation, editing and status errors are shown explicitly without optimistic
success. The list request can be retried.

## API

The browser prototype uses `/crm/ui-api/v1/casinos`. Server-to-server clients use
`/crm/api/v1/casinos` with `casinos:read` / `casinos:write` scopes.

| Method | Path | Result |
|---|---|---|
| GET | `/casinos` | `{items, total}` |
| POST | `/casinos` | Create with `name`, `url`, `theme`; optional `enabled` defaults true |
| GET | `/casinos/{id}` | Website |
| PATCH | `/casinos/{id}` | Partial update of `name`, `url`, `theme`, `enabled` |

Themes use `classic`, `modern`, `dark`. Records include `id`, `created_at`,
`updated_at`, `enabled`. Unknown/read-only fields are rejected with 422 field
errors; missing IDs return 404, unsupported methods 405. Persistence uses the
existing private CustomerStore directory (`CRM_CUSTOMER_DATA_DIR`) and atomic
0600 JSON files. No customer records or credentials are changed.

Validate with:

```sh
python3 crm/api/test/casino_browser_test.py
python3 crm/api/test/navigation_browser_test.py
```

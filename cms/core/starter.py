from django.db import transaction
from django.utils.text import slugify
from .models import ContentBlock, Layout, NavigationMenu, Page, Plugin, Site, Theme


def install_catalog():
    for key, name, background, panel, accent, text in [
        ("classic", "Classic", "#eef3fb", "#ffffff", "#174b82", "#122438"),
        ("modern", "Modern", "#effaf5", "#ffffff", "#28765e", "#153c32"),
        ("dark", "Dark /h", "#0e122f", "#1b2045", "#c3ef4a", "#f5f5ff"),
    ]:
        Theme.objects.get_or_create(key=key, defaults={"name": name, "tokens": {
            "background": background, "panel": panel, "accent": accent, "text": text}})
    Layout.objects.filter(key="home", name="/h Home").update(name="NexLuck Demo Layout")
    Layout.objects.get_or_create(key="home", defaults={"name": "NexLuck Demo Layout", "renderer": "home",
        "definition": {"sections": [{"slot": "main", "columns": 1}]}})
    Layout.objects.get_or_create(key="compact", defaults={"name": "Compact grid", "renderer": "compact",
        "definition": {"sections": [{"slot": "main", "columns": 2}]}})
    Plugin.objects.get_or_create(key="announcements", defaults={
        "name": "Announcements", "description": "Sample model, admin, API and asynchronous React widget."})


@transaction.atomic
def import_site(record):
    install_catalog()
    existing = Site.objects.filter(crm_id=record["id"]).first()
    if existing:
        return existing
    theme = Theme.objects.get(key=record.get("theme", "dark"))
    suffix = "-" + record["id"].lower()
    slug = slugify(record["name"])[:50 - len(suffix)] or "casino"
    # Stable CRM suffix avoids name collisions without exposing customer data.
    slug += suffix
    base = slugify(record["name"])[:50] or "casino"
    public_slug = base
    number = 2
    while Site.objects.filter(public_slug=public_slug).exists():
        suffix = f"-{number}"
        public_slug = base[:50 - len(suffix)] + suffix
        number += 1
    site = Site.objects.create(crm_id=record["id"], slug=slug, public_slug=public_slug, name=record["name"],
        url=record["url"], enabled=record["enabled"], theme=theme)
    page = Page.objects.create(site=site, title=site.name + " | Home", layout=Layout.objects.get(key="home"))
    starter = [
        ("promotions", "Promotions", "Offers from the CRM bonus catalog", ""),
        ("categories", "Popular categories", "Quick access", ""),
        ("games", "Popular games", "Find your next favourite", ""),
        ("matches", "Sportsbook matches", "Sportsbook", "No sports feed is connected. Configure a sports plugin before showing odds."),
        ("providers", "Game providers", "The studios behind the games", ""),
        ("promotions", "More promotions", "More reasons to play", ""),
        ("tournaments", "Tournaments", "Play for the leaderboard", "Connect a tournament feed through a plugin."),
        ("winners", "Winning now", "Recent player activity", "No player activity feed is connected. No personal data is exposed."),
        ("winners", "Recent tournament winners", "Top finishers", "Connect a privacy-reviewed winners feed."),
        ("rewards", "Spin Rally and loot box", "Rewards", "Discover your available rewards. Reward activation is not connected."),
        ("announcements.notice", "Announcements", "From the casino team", ""),
    ]
    ContentBlock.objects.bulk_create([ContentBlock(page=page, key=f"{kind.replace('.', '-')}-{i+1}",
        kind=kind, position=i, props={"title": title, "subtitle": subtitle, "body": body,
                                   "limit": 8, "provider": "", "category": ""})
        for i, (kind, title, subtitle, body) in enumerate(starter)])
    NavigationMenu.objects.create(site=site, key="main", items=[
        {"label": "Games", "href": "#games-3"}, {"label": "Providers", "href": "#providers-5"},
        {"label": "Terms", "href": "#responsible-play"}])
    add_page_modules(page)
    return site


def add_page_modules(page):
    for i, (kind, title) in enumerate([
        ("header_profile", "Header profile details"), ("tab_menu", "Tab menu"),
        ("main_menu", "Main menu"), ("seo", "SEO text"),
    ]):
        ContentBlock.objects.get_or_create(page=page, kind=kind, defaults={
            "key": kind.replace("_", "-") + "-default", "position": 100 + i,
            "props": {"title": title, **({"html": "<p>Discover casino games, providers, promotions and rewards. Play responsibly.</p>"} if kind == "seo" else {})}})

from django.core.management.base import BaseCommand, CommandError
from core.crm import CRMUnavailable, crm_get
from core.starter import import_site, install_catalog


class Command(BaseCommand):
    help = "Install themes/layouts, optionally import configured CRM websites. Does not create users or publish."

    def add_arguments(self, parser):
        parser.add_argument("--import-crm", action="store_true")

    def handle(self, *args, **options):
        install_catalog()
        if options["import_crm"]:
            try:
                for record in crm_get("casinos"):
                    site = import_site(record)
                    self.stdout.write(f"Ready: {site.name}")
            except CRMUnavailable as exc:
                raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("CMS catalog ready. Drafts are not published."))

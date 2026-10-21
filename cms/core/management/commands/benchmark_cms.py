import statistics
import time
from django.core.management.base import BaseCommand, CommandError
from django.core.cache import cache
from core.models import Page


class Command(BaseCommand):
    help = "Measure local indexed lookup and cache-hit latency; not an end-to-end load test."

    def add_arguments(self, parser):
        parser.add_argument("--iterations", type=int, default=200)

    def handle(self, *args, **options):
        count = options["iterations"]
        if not 10 <= count <= 10000:
            raise CommandError("Use 10-10000 iterations.")
        page = Page.objects.first()
        if not page:
            raise CommandError("Connect a CRM site first.")
        cache.set("cms:benchmark", {"page": page.id}, 60)
        for label, read in [
            ("Indexed page lookup", lambda: Page.objects.values("id", "revision").get(site_id=page.site_id, slug=page.slug)),
            ("Cache hit", lambda: cache.get("cms:benchmark")),
        ]:
            samples = []
            for _ in range(count):
                start = time.perf_counter()
                read()
                samples.append((time.perf_counter() - start) * 1000)
            samples.sort()
            self.stdout.write(f"{label}: p50={statistics.median(samples):.3f}ms p95={samples[int(count*.95)-1]:.3f}ms n={count}")
        cache.delete("cms:benchmark")
        self.stdout.write("Measure production with representative data/concurrency; no sub-millisecond SLA is implied.")

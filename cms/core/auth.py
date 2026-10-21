import hashlib
import time
from django.contrib.auth.views import LoginView
from django.core.cache import cache
from django.http import HttpResponse


class CMSLoginView(LoginView):
    template_name = "cms/login.html"

    def post(self, request, *args, **kwargs):
        ip = request.META.get("REMOTE_ADDR", "")
        username = request.POST.get("username", "")[:150].lower()
        # Account + peer buckets also protect deployments behind a single proxy.
        keys = [hashlib.sha256(value.encode()).hexdigest() for value in (ip, username)]
        for key, limit in zip(keys, (150, 15)):
            bucket = f"cms:login:{int(time.time() // 300)}:{key}"
            cache.add(bucket, 0, 310)
            if cache.incr(bucket) > limit:
                response = HttpResponse("Too many login attempts. Retry in five minutes.", status=429)
                response["Retry-After"] = "300"
                return response
        return super().post(request, *args, **kwargs)

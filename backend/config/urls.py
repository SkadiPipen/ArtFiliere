from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("auth/", include("authentication.urls")),
    # These five all share the "api/users/" prefix your frontend already
    # calls -- the views just live in separate apps now internally.
    path("api/users/", include("artist_applications.urls")),
    path("api/users/", include("artworks.urls")),
    path("api/users/", include("artist_profiles.urls")),
    path("api/users/", include("messaging.urls")),
    path("api/users/", include("notifications.urls")),
    path("api/", include("wallets.urls")),
    path("api/delivery/", include("delivery.urls")),

    # added fallback
    path("api/wallets/", include("wallets.urls")),

    # added for auc
    path("api/auction/", include("auctions.urls")),
]

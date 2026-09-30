from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("api/delivery/", include("delivery.urls")),
    path("api/", include("fulfillment.urls")),
    path("api/", include("cart.urls")),
    path("admin/", admin.site.urls),
    path("auth/", include("authentication.urls")),
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
    path("api/auctions/", include("auctions.urls")),
    path("api/auction/", include("auctions.urls")),

    # added for commission
    path('api/commissions/', include('commissions.urls')),
    path("api/blockchain/", include("blockchain.urls")),
]

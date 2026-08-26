from django.db import models

from users.models import User
from artist_applications.models import ArtistApplication
from artworks.models import Artwork


class UserNotification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    application = models.ForeignKey(
        ArtistApplication,
        on_delete=models.CASCADE,
        related_name="notifications",
        null=True,
        blank=True,
    )
    artwork = models.ForeignKey(
        Artwork, on_delete=models.CASCADE, related_name="notifications", null=True, blank=True
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

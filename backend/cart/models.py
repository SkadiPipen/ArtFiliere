from django.db import models

class Cart(models.Model):
    cart_id = models.AutoField(primary_key=True)
    buyer = models.OneToOneField("users.User", on_delete=models.CASCADE, related_name="cart")

    class Meta:
        db_table = "cart"

class CartItem(models.Model):
    cart_item_id = models.AutoField(primary_key=True)
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    listing = models.ForeignKey("artworks.Artwork", on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        db_table = "cart_item"
        constraints = [
            models.UniqueConstraint(fields=["cart", "listing"], name="unique_cart_listing"),
            models.CheckConstraint(condition=models.Q(quantity__gte=1), name="cart_quantity_positive"),
        ]

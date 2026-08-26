from django.core.management.base import BaseCommand

from artworks.hashing import compute_difference_hash, compute_edge_hash, compute_perceptual_hash, compute_sha256
from artworks.models import Artwork


class Command(BaseCommand):
    help = "Create missing image fingerprints for artwork uploaded before similarity detection."

    def handle(self, *args, **options):
        updated = 0
        failed = 0
        exact_duplicates = 0
        for artwork in Artwork.objects.filter(edge_hash__isnull=True).iterator():
            try:
                fields_to_update = ["perceptual_hash", "difference_hash", "edge_hash"]
                if not artwork.sha256_hash:
                    sha256_hash = compute_sha256(artwork.image_data)
                    # Older data can already contain duplicate uploads from
                    # before the exact-file rule existed. Keep both records
                    # usable, but leave the later duplicate's unique hash null.
                    if not Artwork.objects.filter(sha256_hash=sha256_hash).exclude(id=artwork.id).exists():
                        artwork.sha256_hash = sha256_hash
                        fields_to_update.append("sha256_hash")
                    else:
                        exact_duplicates += 1
                artwork.perceptual_hash = compute_perceptual_hash(artwork.image_data)
                artwork.difference_hash = compute_difference_hash(artwork.image_data)
                artwork.edge_hash = compute_edge_hash(artwork.image_data)
                artwork.save(update_fields=fields_to_update)
                updated += 1
            except ValueError:
                failed += 1
                self.stderr.write(f"Skipped artwork {artwork.id}: invalid image data")
        self.stdout.write(self.style.SUCCESS(
            f"Updated {updated} artworks; skipped {failed}; found {exact_duplicates} legacy exact duplicates."
        ))

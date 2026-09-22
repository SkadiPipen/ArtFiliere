from decimal import Decimal, ROUND_HALF_UP

LICENSE = {"personal": Decimal("1"), "commercial": Decimal("1.5")}
EXCLUSIVITY = {"non_exclusive": Decimal("1"), "exclusive": Decimal("1.3"), "sole": Decimal("1.5")}
def base_cost(artwork):
    if artwork.hours is None or artwork.hourly_rate is None:
        return artwork.price
    return artwork.hours * artwork.hourly_rate + (artwork.material_cost if artwork.art_type == "physical" else 0)
def minimum_price(artwork, license_type, exclusivity):
    return (base_cost(artwork) * Decimal("1.10") * LICENSE[license_type] * EXCLUSIVITY[exclusivity]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

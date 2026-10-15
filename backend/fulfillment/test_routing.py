from unittest.mock import Mock, patch
from django.test import SimpleTestCase, override_settings
from .routing import road_distance


@override_settings(ORS_API_KEY='test-key')
class RoadDistanceTests(SimpleTestCase):
    def route(self, distance, pickup='Same address', destination='Same address', pickup_pin=None, destination_pin=None):
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {'routes': [{'summary': {'distance': distance}}]}
        with patch('fulfillment.routing.geocode_address', return_value=[123.9, 10.3]), patch('fulfillment.routing.requests.post', return_value=response):
            return road_distance(pickup, destination, pickup_pin, destination_pin)

    def test_zero_distance_same_address_is_valid(self):
        self.assertEqual(self.route(0, ' Same   ADDRESS ', 'same address'), 0)

    def test_zero_distance_same_explicit_pins_is_valid(self):
        self.assertEqual(self.route(0, 'Building entrance', 'Room in building', [123.9, 10.3], [123.9, 10.3]), 0)

    def test_zero_distance_ambiguous_geocoding_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'different addresses'):
            self.route(0, 'Different street A', 'Different street B')
        with self.assertRaisesRegex(ValueError, 'different addresses'):
            self.route(0, pickup_pin=[123.9, 10.3], destination_pin=[124, 10.4])

    def test_invalid_distance_never_becomes_a_free_quote(self):
        for distance in [-1, None, True, float('nan'), float('inf')]:
            with self.subTest(distance=distance), self.assertRaisesRegex(ValueError, 'no usable road distance'):
                self.route(distance)
        self.assertEqual(self.route(4225.6, 'Pickup', 'Destination'), 4225.6)

    def test_wrong_city_high_confidence_geocode_is_rejected(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        wrong = {'properties': {'country_a': 'PHL', 'layer': 'address', 'confidence': 1, 'county': 'Isabel', 'region': 'Tacloban'}, 'geometry': {'coordinates': [125.008439, 11.20818]}}
        response.json.return_value = {'features': [wrong]}
        address = '123, Barangay 1, Mandaue City, Cebu, Central Visayas, 6041'
        with patch('fulfillment.routing.requests.get', return_value=response):
            with self.assertRaisesRegex(ValueError, 'Mandaue City'): geocode_address(address)
            correct = {'properties': {'country_a': 'PHL', 'layer': 'address', 'confidence': 0.95, 'locality': 'Mandaue', 'region': 'Cebu'}, 'geometry': {'coordinates': [123.93, 10.33]}}
            response.json.return_value = {'features': [wrong, correct]}
            self.assertEqual(geocode_address(address), [123.93, 10.33])

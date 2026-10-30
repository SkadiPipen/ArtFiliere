from unittest.mock import Mock, patch
from django.test import SimpleTestCase, override_settings
from .routing import road_distance


@override_settings(ORS_API_KEY='test-key', GEOAPIFY_API_KEY='')
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
        address = '123 A.C. Cortes Avenue, Barangay 1, Mandaue City, Cebu, Central Visayas, 6041'
        with patch('fulfillment.routing.requests.get', return_value=response):
            with self.assertRaisesRegex(ValueError, 'Mandaue City'): geocode_address(address)
            correct = {'properties': {'country_a': 'PHL', 'layer': 'address', 'confidence': 0.95, 'locality': 'Mandaue', 'region': 'Cebu', 'housenumber': '123', 'street': 'A.C. Cortes Avenue'}, 'geometry': {'coordinates': [123.93, 10.33]}}
            response.json.return_value = {'features': [wrong, correct]}
            self.assertEqual(geocode_address(address), [123.93, 10.33])

    def test_short_address_still_checks_city_street_and_house_number(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        props = {'country_a': 'PHL', 'layer': 'address', 'confidence': 1,
                 'locality': 'Mandaue', 'region': 'Cebu', 'street': 'A.C. Cortes Avenue', 'housenumber': '123'}
        feature = {'properties': props, 'geometry': {'coordinates': [123.93, 10.33]}}
        address = '123 A.C. Cortes Avenue, Centro, Mandaue City, Cebu'
        with patch('fulfillment.routing.requests.get', return_value=response):
            response.json.return_value = {'features': [feature]}
            self.assertEqual(geocode_address(address), [123.93, 10.33])
            for field, value in [('locality', 'Tacloban'), ('region', 'Leyte'), ('street', 'Wrong Street'), ('housenumber', '999'), ('layer', 'locality')]:
                with self.subTest(field=field):
                    response.json.return_value = {'features': [{**feature, 'properties': {**props, field: value}}]}
                    with self.assertRaises(ValueError): geocode_address(address)

    def test_order_replaces_stale_pin_without_changing_address_or_fee(self):
        from commissions.shipping import verified_locations
        from django.core.cache import cache
        cache.clear()
        address = '123 A.C. Cortes Avenue, Centro, Mandaue City, Cebu'
        order = Mock(route_details={'location_validation_version': 2, 'delivery_coordinates': [125, 11]},
                     pickup_address=address, delivery_address=address, fee=200)
        with patch('fulfillment.routing.geocode_address', return_value={'coordinates': [123.93, 10.33], 'precision': 'address', 'notice': ''}) as geocode:
            details = verified_locations(order)
            self.assertEqual(details['pickup_coordinates'], [123.93, 10.33])
            self.assertEqual(details['delivery_coordinates'], [123.93, 10.33])
            self.assertEqual(geocode.call_count, 1)
            verified_locations(order)
            self.assertEqual(geocode.call_count, 1)
            self.assertEqual(order.delivery_address, address)
            self.assertEqual(order.fee, 200)

    def test_failed_lookup_clears_old_coordinates_instead_of_guessing(self):
        from commissions.shipping import verified_locations
        from django.core.cache import cache
        cache.clear()
        order = Mock(route_details={'location_validation_version': 2, 'delivery_coordinates': [125, 11]},
                     pickup_address='Missing pickup address', delivery_address='Missing buyer address')
        with patch('fulfillment.routing.geocode_address', side_effect=ValueError('Exact address not found')):
            details = verified_locations(order)
            self.assertIsNone(details['delivery_coordinates'])
            self.assertIn('delivery', details['location_errors'])

    @override_settings(DELIVERY_BASE_FARE=50, DELIVERY_PER_KM=15)
    def test_quote_stores_the_same_automatic_coordinates_used_for_routing(self):
        from .routing import issue_quote
        address = {'id': 1, 'street': '123 Cortes Avenue', 'barangay': 'Centro', 'city': 'Mandaue',
                   'province': 'Cebu', 'region': 'Central Visayas', 'postal_code': '6014',
                   'formatted': '123 Cortes Avenue, Centro, Mandaue, Cebu, Central Visayas, 6014',
                   'latitude': 11, 'longitude': 125}
        with patch('fulfillment.routing.selected_addresses', return_value=(address, address)), \
             patch('fulfillment.routing.geocode_address', side_effect=[[123.93, 10.33], [123.94, 10.34]]), \
             patch('fulfillment.routing.road_distance', return_value=1000) as route:
            result = issue_quote(Mock(pk=1), Mock(pk=2), Mock(pk=2), None, 1)
            self.assertEqual(result['pickup_coordinates'], [123.93, 10.33])
            self.assertEqual(result['delivery_coordinates'], [123.94, 10.34])
            self.assertEqual(route.call_args.kwargs['destination_coordinates'], result['delivery_coordinates'])

    def test_equivalent_street_city_and_barangay_names(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {'features': [{'properties': {
            'country_a': 'PHL', 'layer': 'address', 'confidence': 0.95,
            'locality': 'Mandaue City', 'region': 'Cebu', 'street': 'A C Cortes Ave',
            'housenumber': '567', 'neighbourhood': 'Centro',
        }, 'geometry': {'coordinates': [123.93, 10.33]}}]}
        with patch('fulfillment.routing.requests.get', return_value=response):
            match = geocode_address('567 A.C. Cortes Avenue, Centro (Pob.), City of Mandaue, Cebu, Central Visayas, 6014', include_metadata=True)
            self.assertEqual(match['precision'], 'address')

    def test_street_match_is_labelled_approximate_but_exact_match_takes_priority(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        street = {'properties': {'country_a': 'PHL', 'layer': 'street', 'confidence': 0.95,
                  'locality': 'Mandaue', 'region': 'Cebu', 'name': 'A C Cortes Ave'},
                  'geometry': {'coordinates': [123.93, 10.33]}}
        address = '567 A.C. Cortes Avenue, Centro, Mandaue City, Cebu'
        with patch('fulfillment.routing.requests.get', return_value=response):
            response.json.return_value = {'features': [street]}
            result = geocode_address(address, include_metadata=True)
            self.assertEqual(result['precision'], 'street')
            self.assertIn('Approximate street', result['notice'])
            exact = {**street, 'properties': {**street['properties'], 'layer': 'address', 'housenumber': '567', 'street': 'A C Cortes Ave'}}
            response.json.return_value = {'features': [street, exact]}
            self.assertEqual(geocode_address(address, include_metadata=True)['precision'], 'address')

    def test_city_only_result_is_rejected_and_shorter_query_is_attempted(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {'features': [{'properties': {'country_a': 'PHL', 'layer': 'locality', 'confidence': 1}}]}
        with patch('fulfillment.routing.requests.get', return_value=response) as lookup:
            with self.assertRaisesRegex(ValueError, 'another city or province'):
                geocode_address('567 A.C. Cortes Avenue, Centro, Mandaue City, Cebu')
            self.assertEqual(lookup.call_count, 2)
            self.assertIn('Philippines', lookup.call_args.kwargs['params']['text'])

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_secondary_provider_finds_approximate_street_after_primary_city_only(self):
        from .routing import geocode_address
        from django.core.cache import cache
        cache.clear()
        primary = Mock(ok=True, status_code=200)
        primary.json.return_value = {'features': []}
        secondary = Mock(ok=True, status_code=200)
        secondary.json.return_value = {'features': [{'properties': {
            'country_code': 'ph', 'result_type': 'street', 'rank': {'confidence': 0.95},
            'city': 'Mandaue City', 'county': 'Cebu', 'street': 'A C Cortes Ave',
            'formatted': 'A C Cortes Ave, Mandaue, Cebu, Philippines',
        }, 'geometry': {'coordinates': [123.93, 10.33]}}]}
        with patch('fulfillment.routing.requests.get', side_effect=[primary, primary, secondary]) as lookup:
            result = geocode_address('567 A.C. Cortes Avenue, Centro, Mandaue City, Cebu', include_metadata=True)
            self.assertEqual(result['provider'], 'geoapify')
            self.assertEqual(result['precision'], 'street')
            self.assertEqual(result['coordinates'], [123.93, 10.33])
            self.assertEqual(lookup.call_args.kwargs['params']['filter'], 'countrycode:ph')

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_secondary_wrong_city_never_becomes_pickup_pin(self):
        from .routing import geocode_address
        from django.core.cache import cache
        cache.clear()
        primary = Mock(ok=True, status_code=200)
        primary.json.return_value = {'features': []}
        secondary = Mock(ok=True, status_code=200)
        secondary.json.return_value = {'features': [{'properties': {
            'country_code': 'ph', 'result_type': 'street', 'rank': {'confidence': 1},
            'city': 'Tacloban', 'county': 'Leyte', 'street': 'A C Cortes Ave',
        }, 'geometry': {'coordinates': [125, 11]}}]}
        with patch('fulfillment.routing.requests.get', side_effect=[primary, primary, secondary, secondary, secondary]):
            with self.assertRaises(ValueError):
                geocode_address('567 A.C. Cortes Avenue, Centro, Mandaue City, Cebu')

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_secondary_failure_does_not_guess_coordinates(self):
        from .routing import geocode_address
        from django.core.cache import cache
        import requests
        cache.clear()
        with patch('fulfillment.routing.requests.get', side_effect=requests.Timeout):
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                geocode_address('567 A.C. Cortes Avenue, Centro, Mandaue City, Cebu')

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_street_only_retry_handles_region_indexed_mandaue_and_warns_about_barangay(self):
        from .routing import geocode_address
        from django.core.cache import cache
        cache.clear()
        empty = Mock(ok=True, status_code=200)
        empty.json.return_value = {'features': []}
        street = Mock(ok=True, status_code=200)
        street.json.return_value = {'features': [{'properties': {
            'country_code': 'ph', 'result_type': 'street', 'rank': {'confidence': 0.9},
            'city': 'Mandaue', 'state': 'Central Visayas', 'postcode': '6014',
            'street': 'A.C. Cortes Avenue', 'suburb': 'Ibabao-Estancia',
        }, 'geometry': {'coordinates': [123.9425761, 10.3337618]}}]}
        address = '567 A.C. Cortes Avenue, Centro (Pob.), City of Mandaue, Cebu, Central Visayas, 6014'
        with patch('fulfillment.routing.requests.get', side_effect=[empty, empty, empty, empty, street]) as lookup:
            result = geocode_address(address, include_metadata=True)
            self.assertEqual(result['precision'], 'street')
            self.assertIn('different barangay', result['notice'])
            self.assertEqual(lookup.call_args.kwargs['params']['text'], 'A.C. Cortes Avenue, mandaue, Philippines')

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_independent_city_exception_does_not_accept_wrong_province(self):
        from .routing import geocode_address
        from django.core.cache import cache
        cache.clear()
        empty = Mock(ok=True, status_code=200)
        empty.json.return_value = {'features': []}
        street = Mock(ok=True, status_code=200)
        street.json.return_value = {'features': [{'properties': {
            'country_code': 'ph', 'result_type': 'street', 'rank': {'confidence': 0.9},
            'city': 'Mandaue', 'state': 'Central Visayas', 'postcode': '6014', 'street': 'A.C. Cortes Avenue',
        }, 'geometry': {'coordinates': [123.94, 10.33]}}]}
        with patch('fulfillment.routing.requests.get', side_effect=[empty, empty, street, street, street]):
            with self.assertRaises(ValueError):
                geocode_address('567 A.C. Cortes Avenue, Centro, City of Mandaue, Leyte, Central Visayas, 6014')

    @override_settings(GEOAPIFY_API_KEY='secondary-test-key')
    def test_junction_can_use_named_landmark_on_same_street_and_barangay(self):
        from .routing import geocode_address
        from django.core.cache import cache
        cache.clear()
        empty = Mock(ok=True, status_code=200)
        empty.json.return_value = {'features': []}
        landmark = Mock(ok=True, status_code=200)
        landmark.json.return_value = {'features': [{'properties': {
            'country_code': 'ph', 'result_type': 'amenity', 'rank': {'confidence': 0.9},
            'city': 'Cebu City', 'state': 'Central Visayas', 'postcode': '6000',
            'street': 'M.J. Cuenco Avenue', 'name': 'Toyota Cebu City - M. J. Cuenco', 'suburb': 'San Roque',
            'formatted': 'Toyota Cebu City - M. J. Cuenco, M.J. Cuenco Avenue, Cebu City',
        }, 'geometry': {'coordinates': [123.9048703, 10.2953745]}}]}
        with patch('fulfillment.routing.requests.get', side_effect=[empty, empty, empty, empty, landmark]) as lookup:
            result = geocode_address('M.J. Cuenco Avenue corner R. Palma Street, San Roque, Cebu City, Cebu', include_metadata=True)
            self.assertEqual(result['precision'], 'landmark')
            self.assertIn('not the buyer/artist entrance', result['notice'])
            self.assertEqual(lookup.call_args.kwargs['params']['text'], 'M.J. Cuenco Avenue, cebu, Philippines')

    @override_settings(GEOAPIFY_API_KEY='')
    def test_different_street_landmark_is_never_a_junction_match(self):
        from .routing import geocode_address
        response = Mock(ok=True, status_code=200)
        response.json.return_value = {'features': [{'properties': {
            'country_a': 'PHL', 'layer': 'venue', 'confidence': 1,
            'locality': 'Cebu City', 'region': 'Cebu', 'street': 'Governor M. Cuenco Avenue',
            'name': 'M. Cuenco Bridge', 'neighbourhood': 'San Roque',
        }, 'geometry': {'coordinates': [123.91, 10.34]}}]}
        with patch('fulfillment.routing.requests.get', return_value=response):
            with self.assertRaises(ValueError):
                geocode_address('M.J. Cuenco Avenue corner R. Palma Street, San Roque, Cebu City, Cebu')

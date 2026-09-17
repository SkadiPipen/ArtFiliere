const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export interface RouteInfo {
    distanceKm: string;
    durationMins: string;
    durationSeconds: number;
}

/* Calculates live driving distance and ETA, from rider loc to destination */
export async function getLiveETA(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
): Promise<RouteInfo | null> {
    if (!GOOGLE_API_KEY) {
        console.error('Missing Google Maps API Key. Check the .env');
        return null;
    }
    try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}$destinations=${destLat},${destLng}&mode=driving&departure_time=now&key=${GOOGLE_API_KEY}`;
    
        const response = await fetch(url);
        const data = await response.json();

        if (data.rows?.[0]?.elements?.[0]?.status === 'OK') {
            const element = data.rows[0].elements[0];
            return {
                distanceKm: element.distance.text,
                durationMins: element.duration_in_traffic ? element.duration_in_traffic.text : element.duration.text,
                durationSeconds: element.duration.value,
            };
        }
        return null;
    } catch (error) {
        console.error('Google Distance Matrix Error:', error);
        return null;
    }
}

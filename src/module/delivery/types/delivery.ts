// Interfaces for Order, Steps, Locations
export type DeliveryStep =
    |   'ACCEPTED'
    |   'ARRIVED_AT_ARTIST'
    |   'PICKED_UP'
    |   'IN_TRANSIT'
    |   'ARRIVED_AT_BUYER'
    |   'DELIVERED';

export interface ActiveDelivery {
    id: string | number;
    paymentMethod: string;
    step: DeliveryStep;
    artist: {
        name: string;
        phone: string;
        address: string;
        latitude?: number;
        longitude?: number;
    };
    buyer: {
        name: string;
        phone: string;
        address: string;
        instructions: string;
        latitude?: number;
        longitude?: number;
    };
    items: {
        name: string;
        quantity: number
    } [];
    has_pickup_proof: boolean;
    has_delivery_proof: boolean;
    fee: string;
    artistPhotoUri?: string;
    buyerPhotoUri?: string;
}
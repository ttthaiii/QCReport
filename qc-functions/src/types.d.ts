declare module 'node-fetch';

export interface PhotoData {
    id?: string; // ✅ Added to track document ID for filtering
    topic?: string;
    description?: string;
    imageBase64: string | null;
    isPlaceholder: boolean;
    location?: string;
    timestamp?: string; // ISO String
}

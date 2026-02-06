/**
 * Tape'ā Back Office - Composant MapTracker
 * Carte Google Maps avec suivi des chauffeurs en temps réel
 */

import React, { useEffect, useRef, useState } from 'react';
import { Loader } from 'lucide-react';

interface Chauffeur {
  id: string;
  firstName: string;
  lastName: string;
  latitude: number | null;
  longitude: number | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
}

interface MapTrackerProps {
  chauffeurs: Chauffeur[];
  apiKey: string;
  center?: { lat: number; lng: number };
  zoom?: number;
  isLoading?: boolean;
  heightClass?: string;
}

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps?: () => void;
  }
}

export function MapTracker({
  chauffeurs,
  apiKey,
  center = { lat: -17.5334, lng: -149.5667 }, // Papeete, Tahiti
  zoom = 12,
  isLoading,
  heightClass = 'h-64',
}: MapTrackerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  useEffect(() => {
    if (!apiKey || window.google) {
      if (window.google) setIsMapLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || map) return;

    const newMap = new window.google.maps.Map(mapRef.current, {
      center,
      zoom,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
    });

    setMap(newMap);
  }, [isMapLoaded, center, zoom, map]);

  useEffect(() => {
    if (!map) return;

    markers.forEach((marker) => marker.setMap(null));

    const newMarkers = chauffeurs
      .filter((c) => c.latitude !== null && c.longitude !== null)
      .map((chauffeur) => {
        const marker = new window.google.maps.Marker({
          position: { lat: chauffeur.latitude!, lng: chauffeur.longitude! },
          map,
          title: `${chauffeur.firstName} ${chauffeur.lastName}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#8B5CF6',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
        });

        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <strong>${chauffeur.firstName} ${chauffeur.lastName}</strong>
              ${chauffeur.vehicleModel ? `<br><small>${chauffeur.vehicleModel}</small>` : ''}
              ${chauffeur.vehiclePlate ? `<br><small>${chauffeur.vehiclePlate}</small>` : ''}
            </div>
          `,
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        return marker;
      });

    setMarkers(newMarkers);
  }, [map, chauffeurs]);

  if (isLoading || !isMapLoaded) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
        <Loader className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
        <p className="text-gray-500">Clé API Google Maps non configurée</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className={`w-full rounded-lg ${heightClass}`} />
      <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-xs shadow">
        {chauffeurs.filter((c) => c.latitude && c.longitude).length} chauffeur(s) avec position connue
      </div>
    </div>
  );
}

export default MapTracker;

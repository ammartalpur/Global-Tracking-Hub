"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// 1. We can create two different colored icons to distinguish you from others
const localIcon = L.divIcon({
  className: "custom-div-icon",
  html: `
    <div class="relative flex h-6 w-6 items-center justify-center">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const remoteIcon = L.divIcon({
  className: "custom-div-icon",
  html: `
    <div class="relative flex h-6 w-6 items-center justify-center">
      <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Camera controller only follows the local user
function MapUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 1.5 });
  }, [lat, lng, map]);
  return null;
}

interface UserLocation {
  userId: string;
  lat: number;
  lng: number;
  username: string;
}

interface LiveMapProps {
  localUser: UserLocation;
  otherUsers: Record<string, UserLocation>;
}

export function LiveMap({ localUser, otherUsers }: LiveMapProps) {
  const [initialPosition] = useState<[number, number]>([
    localUser.lat,
    localUser.lng,
  ]);

  return (
    <MapContainer
      center={initialPosition}
      zoom={16}
      scrollWheelZoom={true}
      className="w-full h-full z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Panning only happens for YOUR coordinates */}
      <MapUpdater lat={localUser.lat} lng={localUser.lng} />

      {/* Render Local User Marker */}
      <Marker position={[localUser.lat, localUser.lng]} icon={localIcon}>
        <Popup>
          <div className="font-semibold text-emerald-600">
            You ({localUser.username})
          </div>
        </Popup>
      </Marker>

      {/* Render All Other Active Users */}
      {Object.values(otherUsers).map((remoteUser) => (
        <Marker
          key={remoteUser.userId}
          position={[remoteUser.lat, remoteUser.lng]}
          icon={remoteIcon}
        >
          <Popup>
            <div className="font-semibold text-blue-600">
              {remoteUser.username}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

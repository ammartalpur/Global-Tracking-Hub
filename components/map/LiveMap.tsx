"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { UserLocation, OfflineUser } from "@/app/page";

// 1. Icon Definitions
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

const offlineIcon = L.divIcon({
  className: "custom-div-icon",
  html: `
    <div class="relative flex h-6 w-6 items-center justify-center grayscale opacity-60">
      <span class="relative inline-flex rounded-full h-4 w-4 bg-slate-500 border-2 border-white shadow"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// 2. Camera Controller for the Local User
function MapUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 1.5 });
  }, [lat, lng, map]);
  return null;
}

// 3. Map Component Props
export interface LiveMapProps {
  localUser: UserLocation;
  otherUsers: Record<string, UserLocation>;
  offlineUsers: Record<string, OfflineUser>;
}

export function LiveMap({
  localUser,
  otherUsers = {},
  offlineUsers = {},
}: LiveMapProps) {
  // Lock the initial position to stop the map from reloading entirely
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
          <div className="text-xs text-slate-500 mt-1">
            Started: {new Date(localUser.joinedAt).toLocaleTimeString()}
          </div>
        </Popup>
      </Marker>

      {/* THE FIX: We use Object.entries to map over the unique presenceKeys */}
      {/* Render All Other Active Users */}
      {Object.entries(otherUsers || {}).map(([presenceKey, remoteUser]) => (
        <Marker
          key={presenceKey}
          position={[remoteUser.lat, remoteUser.lng]}
          icon={remoteIcon}
        >
          <Popup>
            <div className="font-semibold text-blue-600">
              {remoteUser.username}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Joined: {new Date(remoteUser.joinedAt).toLocaleTimeString()}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              Device: {presenceKey.split("-")[1] || "Unknown"}
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Render Disconnected Users (Ghosts) */}
      {Object.entries(offlineUsers || {}).map(([presenceKey, ghostUser]) => (
        <Marker
          key={`offline-${presenceKey}`}
          position={[ghostUser.lat, ghostUser.lng]}
          icon={offlineIcon}
        >
          <Popup>
            <div className="font-semibold text-slate-600">
              {ghostUser.username} (Offline)
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Joined: {new Date(ghostUser.joinedAt).toLocaleTimeString()}
            </div>
            <div className="text-xs text-rose-500 font-medium">
              Left: {new Date(ghostUser.leftAt).toLocaleTimeString()}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-1">
              Device: {presenceKey.split("-")[1] || "Unknown"}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

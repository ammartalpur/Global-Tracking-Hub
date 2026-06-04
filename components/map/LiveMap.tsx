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
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-50"></span>
      <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Offline icon is visually distinct: grey, no ping, reduced opacity
const offlineIcon = L.divIcon({
  className: "custom-div-icon",
  html: `
    <div class="relative flex h-6 w-6 items-center justify-center opacity-50">
      <span class="relative inline-flex rounded-full h-4 w-4 bg-rose-400 border-2 border-white shadow" style="filter: grayscale(1)"></span>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// 2. Camera Controller — only pans for the local user
function MapUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 1.5 });
  }, [lat, lng, map]);
  return null;
}

// 3. Props
export interface LiveMapProps {
  localUser: UserLocation;
  otherUsers: Record<string, UserLocation>;
  offlineUsers: Record<string, OfflineUser>;
  onRemoveOffline: (sessionKey: string) => void;
}

export function LiveMap({
  localUser,
  otherUsers = {},
  offlineUsers = {},
  onRemoveOffline,
}: LiveMapProps) {
  const [initialPosition] = useState<[number, number]>([
    localUser.lat,
    localUser.lng,
  ]);
  const [mapKey] = useState(() => Math.random().toString(36).substring(2, 9));

  return (
    <MapContainer
      key={mapKey}
      center={initialPosition}
      zoom={16}
      scrollWheelZoom={true}
      className="w-full h-full z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapUpdater lat={localUser.lat} lng={localUser.lng} />

      {/* ── Local user marker ── */}
      <Marker position={[localUser.lat, localUser.lng]} icon={localIcon}>
        <Popup>
          <div className="space-y-1 min-w-40">
            <div className="font-semibold text-emerald-600 text-sm">
              You ({localUser.username})
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs text-emerald-600 font-medium">
                Online
              </span>
            </div>
            <div className="text-xs text-slate-500">
              Device:{" "}
              <span className="font-medium text-slate-700">
                {localUser.deviceName}
              </span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              ID: {localUser.userId.slice(0, 12)}…
            </div>
            <div className="text-xs text-slate-400">
              Since {new Date(localUser.joinedAt).toLocaleTimeString()}
            </div>
          </div>
        </Popup>
      </Marker>

      {/* ── Active remote users ── */}
      {Object.entries(otherUsers).map(([sessionKey, remoteUser]) => (
        <Marker
          key={sessionKey}
          position={[remoteUser.lat, remoteUser.lng]}
          icon={remoteIcon}
        >
          <Popup>
            <div className="space-y-1 min-w-40px">
              <div className="font-semibold text-blue-600 text-sm">
                {remoteUser.username}
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="text-xs text-blue-600 font-medium">
                  Online
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Device:{" "}
                <span className="font-medium text-slate-700">
                  {remoteUser.deviceName || "Unknown"}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                ID: {remoteUser.userId.slice(0, 12)}…
              </div>
              <div className="text-xs text-slate-400">
                Since {new Date(remoteUser.joinedAt).toLocaleTimeString()}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* ── Ghost markers — offline users ── */}
      {Object.entries(offlineUsers).map(([sessionKey, ghostUser]) => (
        <Marker
          key={`offline-${sessionKey}`}
          position={[ghostUser.lat, ghostUser.lng]}
          icon={offlineIcon}
        >
          <Popup>
            <div className="space-y-1 min-w-45">
              <div className="font-semibold text-slate-700 text-sm">
                {ghostUser.username}
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-400"></span>
                <span className="text-xs text-rose-500 font-medium">
                  Offline
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Device:{" "}
                <span className="font-medium text-slate-700">
                  {ghostUser.deviceName || "Unknown"}
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                ID: {ghostUser.userId.slice(0, 12)}…
              </div>
              <div className="text-xs text-slate-400">
                Joined {new Date(ghostUser.joinedAt).toLocaleTimeString()}
              </div>
              <div className="text-xs text-rose-500 font-medium">
                Left {new Date(ghostUser.leftAt).toLocaleTimeString()}
              </div>
              <button
                onClick={() => onRemoveOffline(sessionKey)}
                className="mt-2 w-full text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded px-2 py-1 transition font-medium"
              >
                Remove from map
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

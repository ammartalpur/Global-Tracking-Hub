"use client";

import { useEffect, useState } from "react";
import { useGeolocated } from "react-geolocated";
import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";

// 1. DYNAMIC IMPORT: This strictly prevents Leaflet from running on the server,
// completely fixing the "window is not defined" 500 error.
const LiveMap = dynamic(
  () => import("@/components/map/LiveMap").then((mod) => mod.LiveMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <p className="text-slate-400 animate-pulse text-lg tracking-wide">
          Booting Map Engine...
        </p>
      </div>
    ),
  },
);

export default function MapPage() {
  const { user } = useUser();
  const [isMounted, setIsMounted] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // 2. NATIVE GEOLOCATION HOOK
  const {
    coords,
    isGeolocationAvailable,
    isGeolocationEnabled,
    positionError,
  } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true, // Forces precise satellite hardware
      maximumAge: 0,
      timeout: Infinity,
    },
    watchPosition: true, // Continuously tracks device movement
    userDecisionTimeout: 5000,
  });

  // Prevent Hydration Mismatch crashes
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Watch for permission denial to show the helpful popup
  useEffect(() => {
    if (isMounted && !isGeolocationEnabled) {
      setShowPermissionModal(true);
    } else {
      setShowPermissionModal(false);
    }
  }, [isGeolocationEnabled, isMounted]);

  // Early return while Next.js prepares the client component
  if (!isMounted) {
    return (
      <div className="flex flex-col h-screen bg-slate-900 items-center justify-center p-4">
        <p className="text-slate-400 animate-pulse text-lg tracking-wide">
          Initializing Systems...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 space-y-4 relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-700 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Personal GPS Tracker
          </h1>
          {user && (
            <p className="text-sm text-slate-400">
              Operator:{" "}
              <span className="text-emerald-400 font-medium">
                {user.username || user.firstName}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2 text-sm">
          {coords ? (
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-medium animate-pulse">
              🛰️ GPS Active
            </span>
          ) : (
            <span className="px-3 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full font-medium">
              📡 Searching Satellites...
            </span>
          )}
        </div>
      </div>

      {/* Map Canvas Area */}
      <div className="grow bg-slate-800 rounded-xl shadow-lg border border-slate-700 relative overflow-hidden">
        {!isGeolocationAvailable ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-rose-400 bg-rose-500/10 p-4 rounded-lg border border-rose-500/20">
              Your browser does not support Geolocation tracking.
            </p>
          </div>
        ) : coords ? (
          // Render the dynamically imported Map when coordinates are locked
          <LiveMap
            latitude={coords.latitude}
            longitude={coords.longitude}
            username={user?.username || user?.firstName || "Unknown"}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-slate-400 animate-pulse text-lg tracking-wide">
              {positionError
                ? `GPS Error: ${positionError.message}`
                : "Acquiring Satellite Lock..."}
            </p>
          </div>
        )}
      </div>

      {/* Fallback Popup if Location is Blocked */}
      {showPermissionModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-2xl">
              📍
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                Location Access Blocked
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                This app uses real-time hardware tracking. Your browser is
                currently blocking location access.
              </p>
            </div>

            <div className="bg-slate-900/50 rounded-xl p-4 text-left border border-slate-700/50 space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-slate-200">
                How to fix this on your phone:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>
                  Tap the{" "}
                  <span className="text-white font-medium">
                    padlock icon 🔒
                  </span>{" "}
                  in your address bar.
                </li>
                <li>
                  Change{" "}
                  <span className="text-emerald-400 font-medium">Location</span>{" "}
                  to "Allow".
                </li>
                <li>Refresh the page.</li>
              </ol>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition"
            >
              I Allowed It, Refresh Map
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

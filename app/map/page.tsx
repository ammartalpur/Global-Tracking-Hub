"use client";

import { useEffect, useState, useRef } from "react";
import { useGeolocated } from "react-geolocated";
import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";

// DYNAMIC IMPORT: Prevents Next.js SSR crashes with Leaflet
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

export interface UserLocation {
  userId: string;
  lat: number;
  lng: number;
  username: string;
  joinedAt: string;
}

export interface OfflineUser extends UserLocation {
  leftAt: string;
}

export default function MapPage() {
  const { user } = useUser();
  const [isMounted, setIsMounted] = useState(false);

  // State to hold the live and disconnected users
  const [activeUsers, setActiveUsers] = useState<Record<string, UserLocation>>(
    {},
  );
  const [offlineUsers, setOfflineUsers] = useState<Record<string, OfflineUser>>(
    {},
  );

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // THE FIX: Lazy Initialization State.
  // Runs exactly once on mount, perfectly pure, and safe to read in JSX.
  const [sessionId] = useState(() =>
    Math.random().toString(36).substring(2, 9),
  );
  const [joinedAt] = useState(() => new Date().toISOString());

  // NATIVE GEOLOCATION HOOK
  const {
    coords,
    isGeolocationAvailable,
    isGeolocationEnabled,
    positionError,
  } = useGeolocated({
    positionOptions: {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: Infinity,
    },
    watchPosition: true,
    userDecisionTimeout: 5000,
  });

  const showPermissionModal = isMounted && !isGeolocationEnabled;

  // Setup Hydration Bypass
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  // 1. SUPABASE PRESENCE CONNECTION LOGIC
  useEffect(() => {
    if (!isMounted || !user) return;

    // Combine Clerk ID with Device ID so phone and PC don't overwrite each other
    const uniquePresenceKey = `${user.id}-${sessionId}`;

    const channel = supabase.channel("live-tracking", {
      config: { presence: { key: uniquePresenceKey } },
    });

    // Handle Active Users (Joins and Movements)
    channel.on("presence", { event: "sync" }, () => {
      const presenceState = channel.presenceState();
      const updatedUsers: Record<string, UserLocation> = {};

      for (const presenceId in presenceState) {
        if (presenceId !== uniquePresenceKey) {
          const userData = presenceState[
            presenceId
          ][0] as unknown as UserLocation;
          if (userData && userData.lat && userData.lng) {
            updatedUsers[presenceId] = userData;
          }
        }
      }
      setActiveUsers(updatedUsers);
    });

    // Handle Disconnected Users (Ghosts)
    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      const droppedUser = leftPresences[0] as unknown as UserLocation;

      if (droppedUser) {
        const droppedPresenceKey =
          Object.keys(channel.presenceState()).find(
            (key) => channel.presenceState()[key][0] === leftPresences[0],
          ) || `${droppedUser.userId}-unknown`;

        setOfflineUsers((prev) => ({
          ...prev,
          [droppedPresenceKey]: {
            ...droppedUser,
            leftAt: new Date().toISOString(),
          },
        }));
      }
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channelRef.current = channel;
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMounted, user, sessionId]);

  // 2. BROADCAST OUTBOUND LOGIC
  useEffect(() => {
    if (coords && user && channelRef.current) {
      channelRef.current.track({
        userId: user.id,
        lat: coords.latitude,
        lng: coords.longitude,
        username: user.username || user.firstName || "Unknown Agent",
        joinedAt: joinedAt,
      });
    }
  }, [coords, user, joinedAt]);

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 space-y-4 relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-700 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Global Tracking Hub
          </h1>
          {user && (
            <p className="text-sm text-slate-400">
              Operator:{" "}
              <span className="text-emerald-400 font-medium">
                {user.username || user.firstName}
              </span>
              <span className="ml-2 text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                ID: {sessionId}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2 text-sm">
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full font-medium shadow-sm">
            Active Agents: {Object.keys(activeUsers).length + (coords ? 1 : 0)}
          </span>
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
        ) : coords && user ? (
          <LiveMap
            localUser={{
              userId: user.id,
              lat: coords.latitude,
              lng: coords.longitude,
              username: user.username || user.firstName || "Me",
              joinedAt: joinedAt,
            }}
            otherUsers={activeUsers}
            offlineUsers={offlineUsers}
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

      {/* Forced Application UI Popup when Location is Blocked */}
      {showPermissionModal && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-2xl">
              📍
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">
                Location Access Blocked
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your browser is currently blocking GPS access.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
            >
              I Allowed It, Refresh Map
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

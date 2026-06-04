"use client";

import { useEffect, useState, useRef } from "react";
import { useGeolocated } from "react-geolocated";
import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";

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
  deviceName: string;
}

export interface OfflineUser extends UserLocation {
  leftAt: string;
}

interface TrackedAgent extends UserLocation {
  sessionId: string;
  lastPing: number;
}

function getDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) {
    const match = ua.match(/Android[^;]*;\s*([^)]+)\)/);
    if (match) return match[1].trim();
    return "Android Device";
  }
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows NT 10/.test(ua)) return "Windows 10 PC";
  if (/Windows NT 11/.test(ua)) return "Windows 11 PC";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Unknown Device";
}

// ─── Supabase helpers ────────────────────────────────────────────────────────

async function persistOfflineUser(sessionId: string, agent: TrackedAgent) {
  await supabase.from("offline_users").upsert({
    session_id: sessionId,
    user_id: agent.userId,
    username: agent.username,
    device_name: agent.deviceName,
    lat: agent.lat,
    lng: agent.lng,
    joined_at: agent.joinedAt,
    left_at: new Date(agent.lastPing).toISOString(),
  });
}

async function deleteOfflineUser(sessionId: string) {
  await supabase.from("offline_users").delete().eq("session_id", sessionId);
}

async function fetchOfflineUsers(): Promise<Record<string, OfflineUser>> {
  const { data, error } = await supabase.from("offline_users").select("*");
  if (error || !data) return {};

  const result: Record<string, OfflineUser> = {};
  data.forEach((row) => {
    result[row.session_id] = {
      userId: row.user_id,
      username: row.username,
      deviceName: row.device_name,
      lat: row.lat,
      lng: row.lng,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
    };
  });

  console.log(
    `Fetched ${Object.keys(result).length} offline users on device ${getDeviceName()}`,
  );
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const { user } = useUser();
  const [isMounted, setIsMounted] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");

  const [agents, setAgents] = useState<Record<string, TrackedAgent>>({});
  const [offlineUsers, setOfflineUsers] = useState<Record<string, OfflineUser>>(
    {},
  );
  const [activeUsers, setActiveUsers] = useState<Record<string, UserLocation>>(
    {},
  );

  const dismissedSessions = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [joinedAt] = useState(() => new Date().toISOString());

  // Fast 1-second sweeper clock
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  // INITIALIZATION: Hydration & Persistent Browser Fingerprinting
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);

    // Retrieve or create a permanent ID for this specific browser
    let storedId = localStorage.getItem("global_tracker_device_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 9);
      localStorage.setItem("global_tracker_device_id", storedId);
    }
    setSessionId(storedId);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    fetchOfflineUsers().then((persisted) => {
      if (Object.keys(persisted).length > 0) {
        setOfflineUsers((prev) => ({ ...persisted, ...prev }));
      }
    });
  }, [isMounted]);

  // 1. SUPABASE BROADCAST LOGIC (Inbound Network)
  useEffect(() => {
    if (!isMounted || !user || !sessionId) return;

    const channel = supabase.channel("live-tracking");

    // Listen for standard heartbeats
    channel.on("broadcast", { event: "heartbeat" }, ({ payload }) => {
      if (payload.sessionId === sessionId) return;

      if (!dismissedSessions.current.has(payload.sessionId)) {
        setOfflineUsers((prev) => {
          const next = { ...prev };
          let changed = false;
          Object.entries(next).forEach(([key, u]) => {
            if (u.userId === payload.userId) {
              dismissedSessions.current.delete(key);
              delete next[key];
              deleteOfflineUser(key);
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }

      setAgents((prev) => ({
        ...prev,
        [payload.sessionId]: {
          ...payload,
          lastPing: Date.now(),
        },
      }));
    });

    // INSTANT OFFLINE TRIGGER: Listen for explicit disconnect packets
    channel.on("broadcast", { event: "disconnect" }, ({ payload }) => {
      setAgents((prev) => {
        const next = { ...prev };
        if (next[payload.sessionId]) {
          // Force their last ping to zero, so the Sweeper instantly marks them offline
          next[payload.sessionId].lastPing = 0;
        }
        return next;
      });
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

  // 2. HEARTBEAT ENGINE & ZERO-DELAY DISCONNECT (Outbound Network)
  useEffect(() => {
    if (!coords || !user || !channelRef.current || !sessionId) return;

    const payload = {
      sessionId,
      userId: user.id,
      lat: coords.latitude,
      lng: coords.longitude,
      username: user.username || user.firstName || "Unknown Agent",
      joinedAt: joinedAt,
      deviceName: getDeviceName(),
    };

    // Send aggressive heartbeat every 1.5 seconds for maximum real-time tracking
    channelRef.current.send({ type: "broadcast", event: "heartbeat", payload });
    const interval = setInterval(() => {
      channelRef.current?.send({
        type: "broadcast",
        event: "heartbeat",
        payload,
      });
    }, 1500);

    // ZERO-DELAY HOOK: Fire a disconnect packet the millisecond the tab closes
    const handleUnload = () => {
      channelRef.current?.send({
        type: "broadcast",
        event: "disconnect",
        payload,
      });
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [coords, user, joinedAt, sessionId]);

  // 3. SWEEPER — Calculates Active vs Offline
  useEffect(() => {
    const active: Record<string, UserLocation> = {};
    const newlyOffline: Record<string, OfflineUser> = {};

    Object.values(agents).forEach((agent) => {
      if (dismissedSessions.current.has(agent.sessionId)) return;

      // Drop threshold tightened to 4 seconds for lightning-fast state syncing
      if (now - agent.lastPing > 4000) {
        newlyOffline[agent.sessionId] = {
          ...agent,
          leftAt: new Date(agent.lastPing).toISOString(),
        };
      } else {
        active[agent.sessionId] = agent;
      }
    });

    setActiveUsers(active);

    if (Object.keys(newlyOffline).length > 0) {
      setOfflineUsers((prev) => {
        const merged = { ...prev };
        Object.entries(newlyOffline).forEach(([key, offlineUser]) => {
          if (!merged[key]) {
            const agent = agents[key];
            if (agent) persistOfflineUser(key, agent);
          }
          merged[key] = offlineUser;
        });
        return merged;
      });
    }
  }, [agents, now]);

  // 4. REMOVE offline user
  const removeOfflineUser = (sessionKey: string) => {
    dismissedSessions.current.add(sessionKey);
    deleteOfflineUser(sessionKey);
    setOfflineUsers((prev) => {
      const next = { ...prev };
      delete next[sessionKey];
      return next;
    });
    setAgents((prev) => {
      const next = { ...prev };
      delete next[sessionKey];
      return next;
    });
  };

  const showPermissionModal = isMounted && !isGeolocationEnabled;

  // Block rendering entirely until the persistent ID is loaded to avoid SSR flashes
  if (!isMounted || !sessionId) return null;

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 space-y-4 relative">
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
            Active: {Object.keys(activeUsers).length + (coords ? 1 : 0)}
          </span>
          {Object.keys(offlineUsers).length > 0 && (
            <span className="px-3 py-1 bg-slate-600/40 text-slate-400 border border-slate-600/40 rounded-full font-medium shadow-sm">
              Offline: {Object.keys(offlineUsers).length}
            </span>
          )}
        </div>
      </div>

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
              deviceName: getDeviceName(),
            }}
            otherUsers={activeUsers}
            offlineUsers={offlineUsers}
            onRemoveOffline={removeOfflineUser}
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

"use client";

import { useEffect, useState, useRef } from "react";
import { useGeolocated } from "react-geolocated";
import { useUser, Show, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";

export interface UserLocation {
  userId: string;
  lat: number;
  lng: number;
  username: string;
  joinedAt: string;
  deviceName?: string; // Note: made optional so TypeScript never yells at you about it again!
}

export interface OfflineUser extends UserLocation {
  leftAt: string;
}

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

export default function HomePage() {
  const { user, isLoaded } = useUser();
  const [isMounted, setIsMounted] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");

  const [agents, setAgents] = useState<Record<string, any>>({});
  const [offlineUsers, setOfflineUsers] = useState<Record<string, any>>({});
  const [activeUsers, setActiveUsers] = useState<Record<string, any>>({});

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [joinedAt] = useState(() => new Date().toISOString());
  const [now, setNow] = useState(() => Date.now());

  // 1-second sweeper clock
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

  // Initialization & Browser Fingerprinting
  useEffect(() => {
    setIsMounted(true);
    let storedId = localStorage.getItem("global_tracker_device_id");
    if (!storedId) {
      storedId = Math.random().toString(36).substring(2, 9);
      localStorage.setItem("global_tracker_device_id", storedId);
    }
    setSessionId(storedId);
  }, []);

  // Fetch offline database entries on mount
  useEffect(() => {
    if (!isMounted || !user) return;
    supabase
      .from("offline_users")
      .select("*")
      .then(({ data }) => {
        if (data) {
          const result: Record<string, any> = {};
          data.forEach((row) => {
            result[row.session_id] = {
              userId: row.user_id,
              username: row.username,
              lat: row.lat,
              lng: row.lng,
              joinedAt: row.joined_at,
              leftAt: row.left_at,
            };
          });
          setOfflineUsers((prev) => ({ ...result, ...prev }));
        }
      });
  }, [isMounted, user]);

  // Inbound Telemetry Matrix (Listening for other agents)
  useEffect(() => {
    if (!isMounted || !user || !sessionId) return;

    const channel = supabase.channel("live-tracking");

    channel.on("broadcast", { event: "heartbeat" }, ({ payload }) => {
      if (payload.sessionId === sessionId) return;

      // Clean up previous ghost entries if an offline user re-establishes connection
      setOfflineUsers((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((key) => {
          if (next[key].userId === payload.userId) {
            delete next[key];
            supabase.from("offline_users").delete().eq("session_id", key);
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      setAgents((prev) => ({
        ...prev,
        [payload.sessionId]: { ...payload, lastPing: Date.now() },
      }));
    });

    channel.on("broadcast", { event: "disconnect" }, ({ payload }) => {
      setAgents((prev) => {
        const next = { ...prev };
        if (next[payload.sessionId]) next[payload.sessionId].lastPing = 0;
        return next;
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channelRef.current = channel;
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMounted, user, sessionId]);

  // Outbound Broadcast Logic (Sending your telemetry)
  useEffect(() => {
    if (!coords || !user || !channelRef.current || !sessionId) return;

    const payload = {
      sessionId,
      userId: user.id,
      lat: coords.latitude,
      lng: coords.longitude,
      username: user.username || user.firstName || "Unknown Agent",
      joinedAt: joinedAt,
    };

    channelRef.current.send({ type: "broadcast", event: "heartbeat", payload });
    const interval = setInterval(() => {
      channelRef.current?.send({
        type: "broadcast",
        event: "heartbeat",
        payload,
      });
    }, 1500);

    // Tab Close Handler (Zero-delay offline fallback)
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

  // Sweeper Logic (Calculating who is actively pinging)
  useEffect(() => {
    if (!user) return;
    const active: Record<string, any> = {};
    const newlyOffline: Record<string, any> = {};

    Object.values(agents).forEach((agent) => {
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
            if (agent) {
              supabase.from("offline_users").upsert({
                session_id: key,
                user_id: agent.userId,
                username: agent.username,
                lat: agent.lat,
                lng: agent.lng,
                joined_at: agent.joinedAt,
                left_at: new Date(agent.lastPing).toISOString(),
              });
            }
          }
          merged[key] = offlineUser;
        });
        return merged;
      });
    }
  }, [agents, now, user]);

  const showPermissionModal = isMounted && user && !isGeolocationEnabled;

  if (!isMounted || !isLoaded) return null;

  return (
    <div className="w-full h-full">
      {/* 🟢 WORKSPACE SECURED & AUTHENTICATED */}
      <Show when="signed-in">
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
                localUser={
                  {
                    userId: user.id,
                    lat: coords.latitude,
                    lng: coords.longitude,
                    username: user.username || user.firstName || "Me",
                    joinedAt: joinedAt,
                  } as any
                }
                otherUsers={activeUsers as any}
                offlineUsers={offlineUsers as any}
                onRemoveOffline={(key: string) => {
                  supabase.from("offline_users").delete().eq("session_id", key);
                  setOfflineUsers((prev) => {
                    const n = { ...prev };
                    delete n[key];
                    return n;
                  });
                  setAgents((prev) => {
                    const n = { ...prev };
                    delete n[key];
                    return n;
                  });
                }}
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
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
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
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-4 rounded-xl transition shadow-lg shadow-emerald-600/20"
                >
                  Refresh Map
                </button>
              </div>
            </div>
          )}
        </div>
      </Show>

      {/* 🔴 WORKSPACE ACCESS LOCK (Signed Out View) */}
      <Show when="signed-out">
        <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950 text-center px-4">
          <div className="max-w-md w-full space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-[#6c47ff]/10 flex items-center justify-center text-[#6c47ff] text-3xl border border-[#6c47ff]/20">
              🌐
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-white">
                Global Tracking Hub
              </h1>
              <p className="text-slate-400 text-base max-w-sm mx-auto leading-relaxed">
                Secure location orchestration engine. You must authenticate your
                operator identity to access telemetry data.
              </p>
            </div>
            <SignInButton mode="modal">
              <button className="w-full sm:w-auto bg-[#6c47ff] hover:bg-[#5536d6] transition text-white rounded-xl font-medium px-8 py-3.5 cursor-pointer shadow-lg shadow-[#6c47ff]/20">
                Authenticate Workspace
              </button>
            </SignInButton>
          </div>
        </div>
      </Show>
    </div>
  );
}

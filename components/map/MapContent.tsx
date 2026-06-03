import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";

// Fix for default Leaflet marker icons missing in Next.js
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper component to auto-pan the map when your coordinates change
const MapUpdater = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom()); // Re-centers the map instantly
  }, [lat, lng, map]);
  return null;
};

interface MapContentProps {
  latitude: number;
  longitude: number;
  username: string;
}

export default function MapContent({
  latitude,
  longitude,
  username,
}: MapContentProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={14}
      className="w-full h-full rounded-xl z-0"
    >
      {/* Standard OpenStreetMap Tiles */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapUpdater lat={latitude} lng={longitude} />

      <Marker position={[latitude, longitude]}>
        <Popup>
          <div className="font-semibold text-slate-800">{username} (You)</div>
          <div className="text-xs text-slate-500">Live Location</div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}

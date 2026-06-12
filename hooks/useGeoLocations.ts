import { useEffect, useState } from "react";

interface LocationCoordinates {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
}

export const useGeolocation = () => {
  const [location, setLocation] = useState<LocationCoordinates>(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return {
        latitude: null,
        longitude: null,
        error: "Geolocation is not supported by your browser",
      };
    }

    return {
      latitude: null,
      longitude: null,
      error: null,
    };
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true, // Forces device to use GPS rather than just IP lookup
      timeout: 10000, // Wait up to 10 seconds for a reading
      maximumAge: 0, // Do not use cached locations
    };

    const handleSuccess = (position: GeolocationPosition) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        error: null,
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      let errorMessage = "An unknown error occurred while fetching location";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage =
            "User denied the request for Geolocation. Please allow location access.";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = "Location information is unavailable.";
          break;
        case error.TIMEOUT:
          errorMessage = "The request to get user location timed out.";
          break;
      }
      setLocation((prev) => ({ ...prev, error: errorMessage }));
    };

    // Start watching the device's physical movement
    const watchId = navigator.geolocation.watchPosition(
      handleSuccess,
      handleError,
      options,
    );

    // Clean up the browser GPS watcher when the map component unmounts
    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return location;
};

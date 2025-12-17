import { useState } from "react";

const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

export function getAppVersion(): string {
  return APP_VERSION;
}

export async function hardRefresh(): Promise<void> {
  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
    window.location.reload();
  } catch (error) {
    console.error("Hard refresh failed:", error);
    window.location.reload();
  }
}

export default function AppVersion() {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await hardRefresh();
  };

  return (
    <div className="fixed bottom-2 right-2 flex items-center gap-2 bg-gray-800/80 text-gray-300 text-xs px-2 py-1 rounded-full shadow-lg backdrop-blur-sm z-50">
      <span>v{APP_VERSION}</span>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="hover:text-white transition-colors disabled:opacity-50"
        title="Hard refresh (clear cache)"
      >
        {refreshing ? "..." : "R"}
      </button>
    </div>
  );
}
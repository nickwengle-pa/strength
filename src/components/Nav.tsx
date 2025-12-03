import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  formatTeamLabel,
  getStoredTeamSelection,
  getStoredTeamScopes,
  hasFirebase,
  isCoach,
  isAdmin,
  isSuperAdmin,
  subscribeToRoleChanges,
  setStoredTeamSelection,
  type Team,
} from "../lib/db";
import { useAuth } from "../lib/auth";
import { useDevice } from "../lib/device";
import { useOrg } from "../context/OrgContext";

type Status = "checking" | "connected" | "offline";

export default function Nav() {
  const { user, signOut } = useAuth();
  const device = useDevice();
  const location = useLocation();
  const { org } = useOrg();
  const [status, setStatus] = useState<Status>("checking");
  const [coach, setCoach] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [friendlyName, setFriendlyName] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamSelection, setTeamSelection] = useState<Team | "">("");
  const [teamScopes, setTeamScopes] = useState<Team[]>([]);

  useEffect(() => {
    let active = true;
    let ready = false;
    try {
      ready = hasFirebase();
      setStatus(ready ? "connected" : "offline");
    } catch {
      ready = false;
      setStatus("offline");
    }

    // Check super admin status
    setSuperAdmin(isSuperAdmin(user?.uid));

    if (!ready || !user) {
      setCoach(false);
      setAdmin(false);
      return () => {
        active = false;
      };
    }

    // Trigger a fresh role fetch when user changes
    // The subscription will update the state
    (async () => {
      try {
        const [coachFlag, adminFlag] = await Promise.all([
          isCoach(),
          isAdmin(),
        ]);
        if (active) {
          setCoach(coachFlag);
          setAdmin(adminFlag);
        }
      } catch {
        // Roles will be updated via subscription
      }
    })();

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const handler: EventListener = (event) => {
      const custom = event as CustomEvent<string | null>;
      const detail = custom.detail;
      if (typeof detail === "string") {
        setFriendlyName(detail);
      } else {
        const stored = window.localStorage.getItem("pl-strength-display-name");
        setFriendlyName(stored ?? "");
      }
    };

    window.addEventListener("pl-display-name-change", handler);
    return () => {
      window.removeEventListener("pl-display-name-change", handler);
    };
  }, []);



  useEffect(() => {
    if (!user) {
      setFriendlyName("");
      return;
    }
    if (user.displayName) {
      setFriendlyName(user.displayName);
      return;
    }
    const stored = window.localStorage.getItem("pl-strength-display-name");
    if (stored) {
      setFriendlyName(stored);
      return;
    }
    if (user.email?.endsWith("@pl.strength")) {
      const base = user.email.replace("@pl.strength", "");
      const pretty = base
        .replace(/[^a-z]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setFriendlyName(pretty ? pretty.replace(/\b\w/g, (c) => c.toUpperCase()) : base);
    } else if (user.email) {
      setFriendlyName(user.email);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToRoleChanges((roles) => {
      const nextAdmin = roles.includes("admin");
      setAdmin(nextAdmin);
      setCoach(nextAdmin || roles.includes("coach"));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const readScopes = () => {
      setTeamSelection(getStoredTeamSelection());
      setTeamScopes(getStoredTeamScopes());
    };
    readScopes();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "pl-strength-team") {
        setTeamSelection(getStoredTeamSelection());
      }
      if (event.key === "pl-strength-team-scopes") {
        setTeamScopes(getStoredTeamScopes());
      }
    };
    const handleTeamChange = () => setTeamSelection(getStoredTeamSelection());
    const handleScopeChange = (event: Event) => {
      const detail = (event as CustomEvent<Team[]>).detail;
      if (Array.isArray(detail)) {
        setTeamScopes(detail);
      } else {
        setTeamScopes(getStoredTeamScopes());
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("pl-team-change", handleTeamChange as EventListener);
    window.addEventListener(
      "pl-team-scopes-change",
      handleScopeChange as EventListener
    );
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pl-team-change", handleTeamChange as EventListener);
      window.removeEventListener(
        "pl-team-scopes-change",
        handleScopeChange as EventListener
      );
    };
  }, []);

  const statusLabel =
    status === "connected"
      ? "Connected to Firebase"
      : status === "checking"
      ? "Checking Firebase..."
      : "Offline mode";

  const statusClass =
    status === "connected"
      ? "badge badge-success"
      : status === "checking"
      ? "badge badge-warning"
      : "badge badge-muted";

  const renderStatusIndicator = () => {
    if (status === "connected") {
      return (
        <span
          className="inline-flex h-3 w-3 items-center justify-center"
          aria-label="Connected to Firebase"
          title="Connected to Firebase"
        >
          <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
        </span>
      );
    }
    return <span className={`${statusClass} leading-none`}>{statusLabel}</span>;
  };

  const athleteLinks = [
    { to: "/session", label: "Session" },
    { to: "/calculator", label: "Calculator" },
    { to: "/progress", label: "Progress" },
    { to: "/exercises", label: "Exercises" },
    { to: "/profile", label: "Profile" },
  ];

  const coachLinks = [
    { to: "/team", label: "Team Dashboard" },
    { to: "/summary", label: "Quick Summary" },
    { to: "/roster", label: "Roster" },
    { to: "/attendance", label: "Attendance" },
    { to: "/session", label: "Session" },
    { to: "/calculator", label: "Calculator" },
    { to: "/progress", label: "Progress" },
    { to: "/sheets", label: "Sheets" },
    { to: "/program-outline", label: "Program Outline" },
    { to: "/exercises", label: "Exercises" },
    { to: "/profile", label: "Profile" },
    { to: "/guide", label: "Guide" },
    { to: "/quick-summary", label: "Quick Summary (Old)" },
  ];

  const baseLinks = coach ? coachLinks : athleteLinks;
  const adminLinks = admin ? [
    { to: "/admin", label: "Admin" },
    { to: "/org-settings", label: "Org Settings" },
  ] : [];
  const links = coach ? [...baseLinks, ...adminLinks] : baseLinks;

  const isMobile = device.isMobile || (device.isTouch && !device.isDesktop);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setMenuOpen(false);
    }
  }, [isMobile]);

  const navLinkClass = (active: boolean) => {
    if (isMobile) {
      return [
        "flex items-center justify-between rounded-xl border px-4 py-2 text-base font-medium transition-colors",
        active
          ? "border-brand-200 bg-brand-50 text-brand-700 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:bg-brand-50 hover:text-brand-700",
      ].join(" ");
    }
    return active ? "nav-link nav-link-active" : "nav-link";
  };

  const handleTeamScopeChange = (next: Team) => {
    if (!next || next === teamSelection) return;
    setTeamSelection(next);
    setStoredTeamSelection(next);
  };

  const renderTeamPicker = (variant: "desktop" | "mobile") => {
    if (!coach || teamScopes.length <= 1) return null;
    const wrapperClass =
      variant === "desktop"
        ? "flex flex-col gap-1 text-[11px] text-gray-500"
        : "flex flex-col gap-1 text-xs text-gray-500";
    return (
      <div className={wrapperClass}>
        <span className="font-semibold uppercase tracking-wide">Team view</span>
        <select
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-300 focus:outline-none"
          value={teamSelection || ""}
          onChange={(event) => handleTeamScopeChange(event.target.value as Team)}
        >
          {teamScopes.map((teamId) => (
            <option key={teamId} value={teamId}>
              {formatTeamLabel(teamId)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const closeMenu = () => setMenuOpen(false);

  const orgLogo = org?.logo || "/assets/dragon.png";
  const orgName = org?.abbr || org?.name || "AnchorOne";
  const brandColor = org?.primaryColor || "#8B1C21";
  const homeLink = coach ? "/team" : "/session";

  // Helper to lighten color for backgrounds
  const lightenColor = (color: string, amount: number) => {
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, ((num >> 16) & 255) + amount);
    const g = Math.min(255, ((num >> 8) & 255) + amount);
    const b = Math.min(255, (num & 255) + amount);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  const brandColorLight = lightenColor(brandColor, 200);
  const brandColorVeryLight = lightenColor(brandColor, 230);

  const navLinkStyle = (active: boolean) => {
    if (active) {
      return {
        backgroundColor: brandColorVeryLight,
        color: brandColor,
        borderColor: brandColorLight,
      };
    }
    return {};
  };

  return (
    <header className="relative border-b border-gray-200/70 bg-white/90 backdrop-blur">
      <div className="container flex items-center gap-3 py-3 md:h-16 md:py-0">
        <Link to={homeLink} className="flex items-center gap-2 text-gray-900 hover:opacity-90">
          <img src={orgLogo} alt={orgName} className="h-8 w-8 object-contain rounded-lg" />
          <span className="text-xl font-bold tracking-tight">{orgName}</span>
        </Link>
        {!isMobile && renderStatusIndicator()}
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {isMobile ? (
            <>
              {friendlyName && (
                <span className="badge badge-muted text-xs">{friendlyName}</span>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-soft transition"
                style={{
                  borderColor: menuOpen ? brandColorLight : undefined,
                  color: menuOpen ? brandColor : undefined,
                }}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-controls="mobile-navigation"
              >
                <span className="sr-only">Toggle navigation</span>
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 4a1 1 0 100 2h12a1 1 0 100-2H4z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </>
          ) : (
            <nav className="flex items-center gap-2 md:gap-3">
              {links.map(({ to, label }) => (
                <NavLink 
                  key={to} 
                  to={to} 
                  className={({ isActive }) => navLinkClass(isActive)}
                  style={({ isActive }) => navLinkStyle(isActive)}
                >
                  {label}
                </NavLink>
              ))}
              {admin && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs md:text-sm font-semibold"
                  style={{ borderColor: '#c084fc', backgroundColor: '#f3e8ff', color: '#7e22ce' }}
                >
                  Admin
                </span>
              )}
              {superAdmin && (
                <NavLink
                  to="/super-admin"
                  className="inline-flex items-center rounded-full border px-3 py-1 text-xs md:text-sm font-semibold transition-colors"
                  style={{ borderColor: '#f97316', backgroundColor: '#fff7ed', color: '#ea580c' }}
                >
                  🔧 Super Admin
                </NavLink>
              )}
              {coach && !admin && (
                <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs md:text-sm font-semibold"
                  style={{ borderColor: brandColorLight, backgroundColor: brandColorVeryLight, color: brandColor }}
                >
                  Coach
                </span>
              )}
              {friendlyName && (
                <span className="badge badge-muted text-xs md:text-sm">
                  {friendlyName}
                </span>
              )}
              <button
                className="nav-link"
                type="button"
                onClick={() => signOut()}
              >
                Sign out
              </button>
            </nav>
          )}
        </div>
      </div>
      {isMobile && (
        <div
          id="mobile-navigation"
          className={[
            "pointer-events-none transition-[max-height,opacity] duration-200 ease-out",
            menuOpen ? "pointer-events-auto max-h-[480px] opacity-100" : "max-h-0 opacity-0",
          ].join(" ")}
        >
          <div className="container pb-3">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-soft">
              <div>{renderStatusIndicator()}</div>
              <nav className="space-y-2">
                {links.map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => navLinkClass(isActive)}
                    style={({ isActive }) => isActive ? {
                      borderColor: brandColorLight,
                      backgroundColor: brandColorVeryLight,
                      color: brandColor,
                    } : {}}
                    onClick={closeMenu}
                  >
                    {label}
                  </NavLink>
                ))}
                {admin && (
                  <span className="flex items-center justify-between rounded-xl border-2 px-4 py-2 text-base font-semibold"
                    style={{ borderColor: '#c084fc', backgroundColor: '#f3e8ff', color: '#7e22ce' }}
                  >
                    Admin mode
                  </span>
                )}
                {superAdmin && (
                  <NavLink
                    to="/super-admin"
                    className="flex items-center justify-between rounded-xl border-2 px-4 py-2 text-base font-semibold"
                    style={{ borderColor: '#f97316', backgroundColor: '#fff7ed', color: '#ea580c' }}
                    onClick={closeMenu}
                  >
                    🔧 Super Admin
                  </NavLink>
                )}
                {coach && !admin && (
                  <span className="flex items-center justify-between rounded-xl border-2 px-4 py-2 text-base font-semibold"
                    style={{ borderColor: brandColorLight, backgroundColor: brandColorVeryLight, color: brandColor }}
                  >
                    Coach mode
                  </span>
                )}
              </nav>
              <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
                {friendlyName && (
                  <span className="badge badge-muted self-start text-xs">
                    {friendlyName}
                  </span>
                )}
                <button
                  className="flex items-center justify-center rounded-xl border px-4 py-2 text-base font-medium transition"
                  style={{
                    borderColor: '#d1d5db',
                    color: '#374151',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = brandColorLight;
                    e.currentTarget.style.backgroundColor = brandColorVeryLight;
                    e.currentTarget.style.color = brandColor;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d1d5db';
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#374151';
                  }}
                  type="button"
                  onClick={() => {
                    closeMenu();
                    signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}





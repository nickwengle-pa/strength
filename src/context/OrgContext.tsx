import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type OrgInfo = {
  id: string;
  name?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

type OrgContextValue = {
  org: OrgInfo | null;
  setOrg: (org: OrgInfo | null) => void;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const STORAGE_KEY = "pl-strength-org";

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrgState] = useState<OrgInfo | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setOrgState(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  const setOrg = (value: OrgInfo | null) => {
    setOrgState(value);
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  const value = useMemo(() => ({ org, setOrg }), [org]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

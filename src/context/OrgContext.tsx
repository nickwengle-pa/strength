import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchOrgConfig, type OrgConfig } from "../lib/db";

export type OrgInfo = {
  id: string;
  name?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  abbr?: string;
  orgCode?: string;
};

type OrgContextValue = {
  org: OrgInfo | null;
  setOrg: (org: OrgInfo | null) => void;
  orgConfig: OrgConfig | null;
  loading: boolean;
};

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const STORAGE_KEY = "pl-strength-org";

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrgState] = useState<OrgInfo | null>(null);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setOrgState(parsed);
        
        // Fetch full config from Firestore
        if (parsed.id) {
          fetchOrgConfig(parsed.id).then(config => {
            if (config) {
              setOrgConfig(config);
              // Update org with latest data
              setOrgState(prev => prev ? {
                ...prev,
                name: config.name,
                logo: config.logo,
                primaryColor: config.primaryColor,
                secondaryColor: config.secondaryColor,
                abbr: config.abbr,
                orgCode: config.orgCode,
              } : null);
            }
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }, []);

  const setOrg = (value: OrgInfo | null) => {
    setOrgState(value);
    setLoading(true);
    
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        
        // Fetch full config
        if (value.id) {
          fetchOrgConfig(value.id).then(config => {
            if (config) {
              setOrgConfig(config);
              // Update with full data
              setOrgState({
                ...value,
                name: config.name,
                logo: config.logo,
                primaryColor: config.primaryColor,
                secondaryColor: config.secondaryColor,
                abbr: config.abbr,
                orgCode: config.orgCode,
              });
            }
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setOrgConfig(null);
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  };

  const value = useMemo(() => ({ org, setOrg, orgConfig, loading }), [org, orgConfig, loading]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}

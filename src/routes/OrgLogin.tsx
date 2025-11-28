import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import LoginLanding from "./LoginLanding";
import { fb } from "../lib/db";

type OrgRecord = {
  name?: string;
  abbr?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export default function OrgLogin() {
  const { abbr } = useParams();
  const [org, setOrg] = useState<OrgRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrg = async () => {
      if (!abbr) return;
      const db = fb.db;
      if (!db) return;
      try {
        const ref = doc(db, "organizations", abbr.toUpperCase());
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setOrg(snap.data() as OrgRecord);
        } else {
          setOrg(null);
        }
      } catch (err) {
        console.warn("Failed to load org", err);
        setOrg(null);
      } finally {
        setLoading(false);
      }
    };
    fetchOrg();
  }, [abbr]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700">
        Loading...
      </div>
    );
  }

  const title = org?.name ? `${org.name} Strength` : "PL Strength";
  const logo = org?.logo || "/assets/dragon.png";

  return (
    <LoginLanding
      orgName={org?.name || "PL Strength"}
      logoSrc={logo}
      titlePrefix={title}
      primaryColor={org?.primaryColor}
      secondaryColor={org?.secondaryColor}
    />
  );
}

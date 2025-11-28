import React, { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs } from "firebase/firestore";
import { fb, hasFirebase } from "../lib/db";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";
import { isAdmin } from "../lib/db";

type OrgRow = {
  id: string;
  name?: string;
  abbr?: string;
  loginPath?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) {
        setAllowed(false);
        setLoading(false);
        return;
      }
      try {
        const adminFlag = await isAdmin();
        setAllowed(adminFlag);
      } catch {
        setAllowed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    const load = async () => {
      const db = fb.db;
      if (!db) {
        setError("Firestore unavailable.");
        return;
      }
      try {
        const snap = await getDocs(collection(db, "organizations"));
        const rows: OrgRow[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          rows.push({
            id: docSnap.id,
            name: data?.name,
            abbr: data?.abbr,
            loginPath: data?.loginPath,
            primaryColor: data?.primaryColor,
            secondaryColor: data?.secondaryColor,
          });
        });
        setOrgs(rows);
      } catch (err: any) {
        setError(err?.message || "Failed to load organizations.");
      }
    };
    if (allowed) load();
  }, [allowed]);

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete organization ${id}? This cannot be undone.`)) return;
    const db = fb.db;
    if (!db) {
      setError("Firestore unavailable.");
      return;
    }
    try {
      await deleteDoc(doc(db, "organizations", id));
      setOrgs((prev) => prev.filter((o) => o.id !== id));
    } catch (err: any) {
      setError(err?.message || "Failed to delete organization.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-700">
        Loading...
      </div>
    );
  }

  if (!allowed || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-800 px-4">
        <div className="text-xl font-semibold mb-2">Access denied</div>
        <div className="text-sm text-gray-600">This page is restricted to super admins.</div>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-600">
            Manage all organizations and invite codes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/invites"
            className="text-sm font-semibold text-brand-700 hover:text-brand-900"
          >
            Invite codes →
          </Link>
          <Link
            to="/"
            className="text-sm font-semibold text-gray-600 hover:text-gray-800"
          >
            Home
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-800">
            Organizations ({orgs.length})
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {org.name || org.id} <span className="text-xs text-gray-500">({org.id})</span>
                </div>
                <div className="text-xs text-gray-600">
                  Login: {org.loginPath || `/org/${org.id}`}
                </div>
                <div className="text-xs text-gray-600">
                  Colors: {org.primaryColor || "-"} / {org.secondaryColor || "-"}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={org.loginPath || `/org/${org.id}`}
                  className="text-sm font-semibold text-brand-700 hover:text-brand-900"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(org.id)}
                  className="text-sm font-semibold text-rose-700 hover:text-rose-900"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!orgs.length && (
            <div className="px-4 py-6 text-sm text-gray-600">
              No organizations found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

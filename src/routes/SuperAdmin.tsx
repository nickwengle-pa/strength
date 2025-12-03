import React, { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { fb, isSuperAdmin } from "../lib/db";
import { useAuth } from "../lib/auth";
import { Link } from "react-router-dom";

type OrgRow = {
  id: string;
  name?: string;
  abbr?: string;
  loginPath?: string;
  primaryColor?: string;
  secondaryColor?: string;
  adminFirstName?: string;
  adminLastName?: string;
};

type Invite = {
  code: string;
  active: boolean;
  schoolName?: string;
  adminName?: string;
  createdAt?: number;
};

const randomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `INV-${out}`;
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  // Invite creation form
  const [schoolName, setSchoolName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [creating, setCreating] = useState(false);

  // Super admin sign-in form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSuperAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setSignInError("Please enter email and password");
      return;
    }
    const auth = fb.auth;
    if (!auth) {
      setSignInError("Firebase auth not available");
      return;
    }
    setSigningIn(true);
    setSignInError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state change will trigger useEffect to check if super admin
    } catch (err: any) {
      setSignInError(err?.message || "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      setLoading(false);
      return;
    }
    const superAdmin = isSuperAdmin(user.uid);
    setAllowed(superAdmin);
    setLoading(false);
  }, [user]);

  // Load organizations
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
            adminFirstName: data?.adminFirstName,
            adminLastName: data?.adminLastName,
          });
        });
        setOrgs(rows);
      } catch (err: any) {
        setError(err?.message || "Failed to load organizations.");
      }
    };
    if (allowed) load();
  }, [allowed]);

  // Load invites
  useEffect(() => {
    const loadInvites = async () => {
      const db = fb.db;
      if (!db) return;
      try {
        const snap = await getDocs(collection(db, "orgInvites"));
        const rows: Invite[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          rows.push({
            code: docSnap.id,
            active: !!data?.active,
            schoolName: data?.schoolName,
            adminName: data?.adminName,
            createdAt: data?.createdAt?.toMillis?.() || data?.createdAt || 0,
          });
        });
        setInvites(rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      } catch (err) {
        console.warn("Failed to load invites", err);
      }
    };
    if (allowed) loadInvites();
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
      setSuccess(`Organization ${id} deleted.`);
    } catch (err: any) {
      setError(err?.message || "Failed to delete organization.");
    }
  };

  const createInvite = async () => {
    const db = fb.db;
    if (!db) {
      setError("Firestore unavailable");
      return;
    }
    if (!schoolName.trim()) {
      setError("Enter a school name for tracking.");
      return;
    }
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      const code = randomCode();
      const ref = doc(db, "orgInvites", code);
      await setDoc(ref, {
        active: true,
        schoolName: schoolName.trim(),
        adminName: adminName.trim() || null,
        createdAt: serverTimestamp(),
      });
      setInvites((prev) => [
        { code, active: true, schoolName: schoolName.trim(), adminName: adminName.trim() || undefined, createdAt: Date.now() },
        ...prev,
      ]);
      setSuccess(`Invite code created: ${code}`);
      setSchoolName("");
      setAdminName("");
    } catch (err: any) {
      setError(err?.message || "Could not create invite");
    } finally {
      setCreating(false);
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 text-white px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">🔧</div>
            <h1 className="text-2xl font-bold">Super Admin Portal</h1>
            <p className="text-sm text-white/60 mt-1">Sign in with your admin credentials</p>
          </div>

          {!user ? (
            <form onSubmit={handleSuperAdminSignIn} className="space-y-4">
              {signInError && (
                <div className="rounded-xl border border-rose-400/30 bg-rose-500/20 px-4 py-3 text-sm text-rose-200">
                  {signInError}
                </div>
              )}

              <label className="flex flex-col gap-1 text-sm font-medium text-white/80">
                Email
                <input
                  type="email"
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  disabled={signingIn}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-medium text-white/80">
                Password
                <input
                  type="password"
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={signingIn}
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
                disabled={signingIn}
              >
                {signingIn ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/20 px-4 py-3 text-sm text-amber-200">
                Access denied. Your account is not a super admin.
              </div>
              <div className="text-xs text-white/40 bg-white/5 px-4 py-2 rounded-lg">
                Your UID: <span className="font-mono">{user.uid}</span>
                <br />
                Add this to SUPER_ADMIN_UIDS in src/lib/db.ts
              </div>
            </div>
          )}

          <div className="text-center">
            <Link to="/" className="text-sm text-white/50 hover:text-white/80 transition">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    const auth = fb.auth;
    if (auth) {
      await signOut(auth);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Super Admin Nav */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔧</span>
            <span className="text-lg font-bold text-gray-900">Super Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="container space-y-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Super Admin Portal</h1>
            <p className="text-sm text-gray-600">
              Create invite codes for new schools and manage all organizations.
            </p>
          </div>
          <Link
            to="/"
            className="text-sm font-semibold text-gray-600 hover:text-gray-800"
          >
            ← Home
          </Link>
        </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {/* Create Invite Code Section */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Create Invite Code</h2>
        <p className="text-sm text-gray-600">
          Generate a unique invite code for a new school. They'll use this when registering.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            School Name *
            <input
              className="field"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g., Lincoln High School"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Admin Contact Name (optional)
            <input
              className="field"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="e.g., Coach Smith"
            />
          </label>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={createInvite}
          disabled={creating}
        >
          {creating ? "Creating..." : "Generate Invite Code"}
        </button>
      </div>

      {/* Invite Codes List */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Invite Codes ({invites.length})</h2>

        <div className="divide-y divide-gray-100">
          {invites.map((inv) => (
            <div
              key={inv.code}
              className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold text-gray-900">{inv.code}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      inv.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {inv.active ? "Active" : "Used"}
                  </span>
                </div>
                {inv.schoolName && (
                  <div className="text-sm text-gray-600">School: {inv.schoolName}</div>
                )}
                {inv.adminName && (
                  <div className="text-sm text-gray-500">Contact: {inv.adminName}</div>
                )}
                <div className="text-xs text-gray-400">
                  Created: {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "Unknown"}
                </div>
              </div>
              {inv.active && (
                <button
                  type="button"
                  className="text-sm text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    navigator.clipboard.writeText(inv.code);
                    setSuccess(`Copied ${inv.code} to clipboard!`);
                  }}
                >
                  Copy
                </button>
              )}
            </div>
          ))}
          {!invites.length && (
            <div className="py-4 text-sm text-gray-600">No invite codes created yet.</div>
          )}
        </div>
      </div>

      {/* Organizations List */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Organizations ({orgs.length})</h2>

        <div className="divide-y divide-gray-100">
          {orgs.map((org) => (
            <div
              key={org.id}
              className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {org.name || org.id}
                  <span className="ml-2 text-xs text-gray-500">({org.id})</span>
                </div>
                <div className="text-sm text-gray-600">
                  Login: {org.loginPath || `/org/${org.id}`}
                </div>
                {org.adminFirstName && org.adminLastName && (
                  <div className="text-sm text-gray-500">
                    Admin: {org.adminFirstName} {org.adminLastName}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{ backgroundColor: org.primaryColor || "#ccc" }}
                  />
                  {org.primaryColor || "No color"}
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
                  className="text-sm font-semibold text-rose-600 hover:text-rose-800"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!orgs.length && (
            <div className="py-4 text-sm text-gray-600">No organizations found.</div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { fb } from "../lib/db";
import { Link } from "react-router-dom";

type Invite = {
  code: string;
  active: boolean;
  email?: string;
  createdAt?: number;
};

const randomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `INV-${out}`;
};

export default function AdminInvites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      invites.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [invites]
  );

  useEffect(() => {
    const load = async () => {
      const db = fb.db;
      if (!db) return;
      try {
        const snap = await getDocs(query(collection(db, "orgInvites"), orderBy("createdAt", "desc")));
        const rows: Invite[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          rows.push({
            code: docSnap.id,
            active: !!data?.active,
            email: data?.email,
            createdAt: data?.createdAt?.toMillis?.() || data?.createdAt || 0,
          });
        });
        setInvites(rows);
      } catch (err) {
        console.warn("Failed to load invites", err);
      }
    };
    load();
  }, []);

  const createInvite = async () => {
    const db = fb.db;
    if (!db) {
      setError("Firestore unavailable");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const code = randomCode();
      const ref = doc(db, "orgInvites", code);
      await setDoc(ref, {
        active: true,
        email: email.trim() || null,
        createdAt: serverTimestamp(),
      });
      setGenerated(code);
      setEmail("");
      setInvites((prev) => [
        { code, active: true, email: email.trim() || undefined, createdAt: Date.now() },
        ...prev,
      ]);
    } catch (err: any) {
      setError(err?.message || "Could not create invite");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invite Codes</h1>
          <p className="text-sm text-gray-600">
            Generate single-use codes to allow new schools to register.
          </p>
        </div>
        <Link
          to="/admin"
          className="text-sm font-semibold text-brand-700 hover:text-brand-900"
        >
          ← Back to Admin
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Create invite</h2>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700 md:col-span-2">
            Recipient email (optional, for your tracking)
            <input
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@example.com"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="btn btn-primary w-full justify-center"
              onClick={createInvite}
              disabled={creating}
            >
              {creating ? "Generating..." : "Generate code"}
            </button>
          </div>
        </div>
        {generated && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            New code: <span className="font-bold">{generated}</span> (single-use)
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Recent codes</h2>
        <div className="grid gap-3">
          {sorted.map((inv) => (
            <div
              key={inv.code}
              className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">{inv.code}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    inv.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {inv.active ? "Active" : "Used"}
                </span>
              </div>
              {inv.email && <div className="text-xs text-gray-600">Email: {inv.email}</div>}
              <div className="text-xs text-gray-500">
                Created:{" "}
                {inv.createdAt
                  ? new Date(inv.createdAt).toLocaleString()
                  : "Unknown"}
              </div>
            </div>
          ))}
          {!sorted.length && <div className="text-sm text-gray-600">No invites yet.</div>}
        </div>
      </div>
    </div>
  );
}

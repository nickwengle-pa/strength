import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { fb, subscribeToRoleChanges } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useOrg } from "../context/OrgContext";

type OrgData = {
  name: string;
  abbr: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  orgCode: string;
  coachPasscode: string;
  adminEmail: string;
  adminPhone: string;
  createdBy?: string;
  createdAt?: number;
};

type CoachEntry = {
  uid: string;
  firstName: string;
  lastName: string;
  email?: string;
  isAdmin: boolean;
};

export default function OrgSettings() {
  const { user } = useAuth();
  const { org, setOrg } = useOrg();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [coaches, setCoaches] = useState<CoachEntry[]>([]);
  const [userOrgId, setUserOrgId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    abbr: "",
    primaryColor: "#8B1C21",
    secondaryColor: "#B9B9B9",
    orgCode: "",
    coachPasscode: "",
    adminEmail: "",
    adminPhone: "",
  });
  const [newLogoDataUrl, setNewLogoDataUrl] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Check if current user is org admin
  useEffect(() => {
    const unsubscribe = subscribeToRoleChanges((roles) => {
      setIsOrgAdmin(roles.includes("admin"));
    });
    return unsubscribe;
  }, []);

  // Load user's orgId and org data - only once
  useEffect(() => {
    // Skip if already loaded to prevent form reset
    if (dataLoaded) return;
    
    const loadData = async () => {
      if (!fb.db || !user?.uid) {
        setLoading(false);
        return;
      }

      try {
        // Get user's profile to find orgId, or fall back to org context
        let orgId = org?.id;
        
        if (!orgId) {
          const profileRef = doc(fb.db, "profiles", user.uid);
          const profileSnap = await getDoc(profileRef);

          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            orgId = profileData.orgId;
          }
        }
        
        setUserOrgId(orgId || null);

        if (!orgId) {
          setError("No organization associated with your account");
          setLoading(false);
          return;
        }

        // Load organization data
        const orgRef = doc(fb.db, "organizations", orgId);
        const orgSnap = await getDoc(orgRef);

        if (!orgSnap.exists()) {
          setError("Organization not found");
          setLoading(false);
          return;
        }

        const data = orgSnap.data() as OrgData;
        setOrgData(data);
        setForm({
          name: data.name || "",
          abbr: data.abbr || orgId || "",
          primaryColor: data.primaryColor || "#8B1C21",
          secondaryColor: data.secondaryColor || "#B9B9B9",
          orgCode: data.orgCode || "",
          coachPasscode: data.coachPasscode || "",
          adminEmail: data.adminEmail || "",
          adminPhone: data.adminPhone || "",
        });

        // Update org context with latest data
        setOrg({
          id: orgId,
          name: data.name,
          logo: data.logo,
          primaryColor: data.primaryColor,
          secondaryColor: data.secondaryColor,
        });
        
        // Mark data as loaded so we don't reload on org context updates
        setDataLoaded(true);

        // Load coaches in this org
        const profilesRef = collection(fb.db, "profiles");
        const coachesQuery = query(profilesRef, where("orgId", "==", orgId));
        const coachesSnap = await getDocs(coachesQuery);

        const coachList: CoachEntry[] = [];
        for (const docSnap of coachesSnap.docs) {
          const pData = docSnap.data();
          // Check if this user has coach or admin role
          try {
            const roleRef = doc(fb.db, "roles", docSnap.id);
            const roleSnap = await getDoc(roleRef);
            const roles = roleSnap.exists() ? (roleSnap.data().roles || []) : [];
            
            if (roles.includes("coach") || roles.includes("admin")) {
              coachList.push({
                uid: docSnap.id,
                firstName: pData.firstName || "",
                lastName: pData.lastName || "",
                email: pData.email,
                isAdmin: roles.includes("admin"),
              });
            }
          } catch (err) {
            console.warn("Failed to load roles for", docSnap.id);
          }
        }
        setCoaches(coachList);
      } catch (err: any) {
        setError(err?.message || "Failed to load organization data");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.uid, org?.id, setOrg, dataLoaded]);

  const handleLogoFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result?.toString() || "";
      setNewLogoDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!fb.db || !userOrgId || !isOrgAdmin) return;

    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const orgRef = doc(fb.db, "organizations", userOrgId);
      const updates: Record<string, any> = {
        name: form.name.trim(),
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        orgCode: form.orgCode.trim().toUpperCase(),
        coachPasscode: form.coachPasscode.trim().toUpperCase(),
        adminEmail: form.adminEmail.trim(),
        adminPhone: form.adminPhone.trim(),
        updatedAt: Date.now(),
      };

      if (newLogoDataUrl) {
        updates.logo = newLogoDataUrl;
      }

      await updateDoc(orgRef, updates);

      // Update local org context
      setOrg({
        ...org,
        id: userOrgId,
        name: form.name.trim(),
        primaryColor: form.primaryColor,
        secondaryColor: form.secondaryColor,
        logo: newLogoDataUrl || orgData?.logo,
      });

      setOrgData((prev) => prev ? { ...prev, ...updates } : prev);
      setSuccess("Organization settings saved!");
      setNewLogoDataUrl(null);
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleAdminRole = async (coachUid: string, makeAdmin: boolean) => {
    if (!fb.db || !isOrgAdmin) return;

    try {
      const roleRef = doc(fb.db, "roles", coachUid);
      const roleSnap = await getDoc(roleRef);
      const currentRoles: string[] = roleSnap.exists() ? (roleSnap.data().roles || []) : [];

      let newRoles: string[];
      if (makeAdmin) {
        newRoles = Array.from(new Set([...currentRoles, "admin"]));
      } else {
        newRoles = currentRoles.filter((r) => r !== "admin");
      }

      await updateDoc(roleRef, {
        roles: newRoles,
        updatedAt: Date.now(),
      });

      setCoaches((prev) =>
        prev.map((c) => (c.uid === coachUid ? { ...c, isAdmin: makeAdmin } : c))
      );
      setSuccess(makeAdmin ? "Admin role granted" : "Admin role removed");
    } catch (err: any) {
      setError(err?.message || "Failed to update role");
    }
  };

  const brandColor = org?.primaryColor || "#8B1C21";

  if (loading) {
    return (
      <div className="container py-6">
        <div className="card">Loading organization settings...</div>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="container py-6">
        <div className="card border-amber-200 bg-amber-50 text-amber-800">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p>Only organization admins can view and edit these settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: brandColor }}>
            Organization Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your organization's branding, access codes, and admin roles
          </p>
        </div>
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

      {/* Branding Section */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold" style={{ color: brandColor }}>
          Branding
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Organization Name
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Demo High School"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Abbreviation (read-only)
            <input
              className="field bg-gray-100"
              value={form.abbr}
              disabled
              title="Abbreviation cannot be changed as it's used as the organization ID"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Primary Color
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-16 cursor-pointer rounded border border-gray-300"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
              />
              <input
                className="field flex-1"
                value={form.primaryColor}
                onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                placeholder="#8B1C21"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Secondary Color
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-16 cursor-pointer rounded border border-gray-300"
                value={form.secondaryColor}
                onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
              />
              <input
                className="field flex-1"
                value={form.secondaryColor}
                onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                placeholder="#B9B9B9"
              />
            </div>
          </label>

          <div className="md:col-span-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
              Logo
              <div className="flex items-center gap-4">
                <div
                  className="h-20 w-20 rounded-xl border-2 border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden"
                >
                  {(newLogoDataUrl || orgData?.logo) ? (
                    <img
                      src={newLogoDataUrl || orgData?.logo}
                      alt="Logo preview"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-gray-400 text-xs">No logo</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Access Codes Section */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold" style={{ color: brandColor }}>
          Access Codes
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Organization Code
            <input
              className="field uppercase"
              value={form.orgCode}
              onChange={(e) => setForm((f) => ({ ...f, orgCode: e.target.value.toUpperCase() }))}
              placeholder="DH2024"
            />
            <span className="text-xs text-gray-500">
              Athletes and coaches use this code when logging in
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Coach Passcode
            <input
              className="field uppercase"
              value={form.coachPasscode}
              onChange={(e) => setForm((f) => ({ ...f, coachPasscode: e.target.value.toUpperCase() }))}
              placeholder="COACH2024"
            />
            <span className="text-xs text-gray-500">
              Shared passcode for coaches to access coach features
            </span>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Admin Email
            <input
              className="field"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
              placeholder="admin@school.edu"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Admin Phone
            <input
              className="field"
              type="tel"
              value={form.adminPhone}
              onChange={(e) => setForm((f) => ({ ...f, adminPhone: e.target.value }))}
              placeholder="555-123-4567"
            />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          className="btn btn-primary px-8"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Admin Delegation Section */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold" style={{ color: brandColor }}>
          Admin Roles
        </h2>
        <p className="text-sm text-gray-600">
          Grant or revoke admin privileges for coaches in your organization
        </p>

        {coaches.length === 0 ? (
          <p className="text-gray-500 py-4">No coaches found in this organization</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {coaches.map((coach) => (
              <div
                key={coach.uid}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {coach.firstName} {coach.lastName}
                  </div>
                  {coach.email && (
                    <div className="text-sm text-gray-500">{coach.email}</div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {coach.isAdmin ? (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: brandColor }}
                    >
                      Admin
                    </span>
                  ) : (
                    <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      Coach
                    </span>
                  )}
                  {coach.uid !== user?.uid && (
                    <button
                      className="text-sm font-medium hover:underline"
                      style={{ color: brandColor }}
                      onClick={() => toggleAdminRole(coach.uid, !coach.isAdmin)}
                    >
                      {coach.isAdmin ? "Remove Admin" : "Make Admin"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org Info (read-only) */}
      {orgData?.createdAt && (
        <div className="card bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Organization Info</h3>
          <p className="text-sm text-gray-600">
            Created: {new Date(orgData.createdAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { fb } from "../lib/db";
import { useNavigate } from "react-router-dom";

type FormState = {
  name: string;
  abbr: string;
  primaryColor: string;
  secondaryColor: string;
  adminEmail: string;
  adminPhone: string;
  logoDataUrl?: string;
  inviteCode: string;
};

const initialState: FormState = {
  name: "",
  abbr: "",
  primaryColor: "#8B1C21",
  secondaryColor: "#B9B9B9",
  adminEmail: "",
  adminPhone: "",
  inviteCode: "",
  logoDataUrl: "",
};

export default function NewSchool() {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result?.toString() || "";
      setForm((prev) => ({ ...prev, logoDataUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const db = fb.db;
    if (!db) {
      setError("Firestore is unavailable.");
      return;
    }

    const trimmedAbbr = form.abbr.trim().toUpperCase();
    if (!trimmedAbbr || !form.name.trim()) {
      setError("School name and abbreviation are required.");
      return;
    }
    const logoDataUrl = form.logoDataUrl || "";
    if (!logoDataUrl) {
      setError("Logo file is required.");
      return;
    }
    if (!form.inviteCode.trim()) {
      setError("Invite code is required.");
      return;
    }

    setSubmitting(true);
    try {
      const docRef = doc(collection(db, "organizations"), trimmedAbbr);
      await setDoc(
        docRef,
        {
          name: form.name.trim(),
          abbr: trimmedAbbr,
          logo: logoDataUrl,
          primaryColor: form.primaryColor || "#8B1C21",
          secondaryColor: form.secondaryColor || "#B9B9B9",
          adminEmail: form.adminEmail.trim(),
          adminPhone: form.adminPhone.trim(),
          inviteCode: form.inviteCode.trim(),
          loginPath: `/org/${trimmedAbbr}`,
          createdAt: Date.now(),
        },
        { merge: true }
      );
      try {
        const inviteRef = doc(db, "orgInvites", form.inviteCode.trim());
        await updateDoc(inviteRef, { active: false, updatedAt: Date.now() });
      } catch (err) {
        console.warn("Could not mark invite as used", err);
      }
      setForm(initialState);
      navigate(`/org/${trimmedAbbr}`);
    } catch (err: any) {
      setError(err?.message || "Could not save school. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-gray-900">
            Add New School
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Collect the basics and we’ll add the school to the carousel and create its login.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            School name
            <input
              className="field"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Demo High School"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Abbreviation
            <input
              className="field uppercase"
              value={form.abbr}
              onChange={(e) => updateField("abbr", e.target.value.toUpperCase())}
              placeholder="DH"
              maxLength={8}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Logo file
            <input
              className="field"
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
              required
            />
            {form.logoDataUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img
                  src={form.logoDataUrl}
                  alt="Logo preview"
                  className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                />
                <span className="text-xs text-gray-600">Preview</span>
              </div>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Invite code
            <input
              className="field"
              value={form.inviteCode}
              onChange={(e) => updateField("inviteCode", e.target.value)}
              placeholder="Enter invite code"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
              Primary color
              <div className="flex items-center gap-3">
                <input
                  className="h-12 w-16 cursor-pointer rounded-xl border border-gray-200 bg-white"
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => updateField("primaryColor", e.target.value)}
                />
                <div
                  className="flex items-center gap-2"
                >
                  <div
                    className="h-10 w-16 rounded-xl border border-gray-300 shadow-inner"
                    style={{ background: form.primaryColor }}
                    aria-label="Primary color preview"
                  />
                </div>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
              Secondary color
              <div className="flex items-center gap-3">
                <input
                  className="h-12 w-16 cursor-pointer rounded-xl border border-gray-200 bg-white"
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => updateField("secondaryColor", e.target.value)}
                />
                <div
                  className="flex items-center gap-2"
                >
                  <div
                    className="h-10 w-16 rounded-xl border border-gray-300 shadow-inner"
                    style={{ background: form.secondaryColor }}
                    aria-label="Secondary color preview"
                  />
                </div>
              </div>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Administrator email
            <input
              className="field"
              type="email"
              value={form.adminEmail}
              onChange={(e) => updateField("adminEmail", e.target.value)}
              placeholder="admin@example.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-gray-700">
            Administrator phone
            <input
              className="field"
              value={form.adminPhone}
              onChange={(e) => updateField("adminPhone", e.target.value)}
              placeholder="555-123-4567"
            />
          </label>

          <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn"
              onClick={() => navigate("/")}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary px-6 py-2"
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save and Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

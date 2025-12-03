import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type AuthError,
} from "firebase/auth";
import {
  AthleteAuthError,
  TEAM_DEFINITIONS,
  buildAthleteEmail,
  buildCoachEmail,
  coachPassword,
  ensureAdminRole,
  ensureAnon,
  ensureCoachRoleOnly,
  fb,
  fetchCoachTeamScopes,
  fetchOrgConfig,
  refreshRoles,
  getStoredTeamSelection,
  loadProfileRemote,
  normalizePasscodeDigits,
  saveProfile,
  setStoredTeamSelection,
  setStoredTeamScopes,
  signInOrCreateAthleteAccount,
  updateCoachTeamScope,
  type OrgConfig,
  type Team,
  type RolesDocument,
} from "../lib/db";
import { doc, getDoc } from "firebase/firestore";
import { useOrg } from "../context/OrgContext";

type Mode = "athlete" | "coach";

type StatusMessage = { kind: "success" | "error"; text: string } | null;

function sanitizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

const coachPasscodeFromEnv = (
  import.meta.env.VITE_COACH_PASSCODE ?? "2468"
)
  .toString()
  .trim();
const adminCoachPasscodeFromEnv = (
  import.meta.env.VITE_ADMIN_COACH_PASSCODE ?? "1357"
)
  .toString()
  .trim();
const normalizeCoachPasscode = (value: string) => value.trim().toUpperCase();
const TEAM_OPTIONS: Array<{ label: string; value: Team | "" }> = [
  { label: "Select a team", value: "" },
  ...TEAM_DEFINITIONS.map((definition) => ({
    label: definition.label,
    value: definition.id,
  })),
];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForRoleSync = async (uid: string, expectAdmin: boolean) => {
  const maxAttempts = expectAdmin ? 6 : 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const roles = await refreshRoles(uid);
    const hasRole = expectAdmin ? roles.includes("admin") : roles.includes("coach");
    if (hasRole) {
      return roles;
    }
    await delay(150 * (attempt + 1));
  }
  throw new Error(expectAdmin ? "admin-sync-failed" : "coach-sync-failed");
};

const updateDisplayNameCache = (name: string | null) => {
  if (typeof window === "undefined") return;
  if (name && name.trim()) {
    window.localStorage.setItem("pl-strength-display-name", name.trim());
  } else {
    window.localStorage.removeItem("pl-strength-display-name");
  }
  window.dispatchEvent(
    new CustomEvent<string | null>("pl-display-name-change", { detail: name?.trim() ?? null })
  );
};

export default function SignIn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { org } = useOrg();
  const [mode, setMode] = useState<Mode | null>("coach");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [team, setTeam] = useState<Team | "">("");
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<StatusMessage>(null);
  const [orgConfig, setOrgConfig] = useState<OrgConfig | null>(null);

  const auth = fb.auth;

  // Fetch org config when org changes
  useEffect(() => {
    if (!org?.id) {
      setOrgConfig(null);
      return;
    }
    
    fetchOrgConfig(org.id).then(config => {
      if (config) {
        setOrgConfig(config);
      } else {
        setMessage({ kind: "error", text: "Could not load organization settings." });
      }
    });
  }, [org?.id]);

  useEffect(() => {
    const initial = searchParams.get("mode");
    if (initial === "athlete" || initial === "coach") {
      chooseSignInMode(initial as Mode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!org) {
      setMessage({ kind: "error", text: "Select your school/team first." });
    } else if (message?.kind === "error" && message.text.includes("Select your school")) {
      setMessage(null);
    }
  }, [org, message]);

  useEffect(() => {
    if (!org) {
      navigate("/", { replace: true });
    }
  }, [org, navigate]);

  const athleteEmail = useMemo(() => {
    const safeFirst = sanitizeName(firstName);
    const safeLast = sanitizeName(lastName);
    if (!safeFirst || !safeLast || !org?.id) return "";
    return buildAthleteEmail(safeFirst, safeLast, org.id);
  }, [firstName, lastName, org?.id]);

  const coachEmail = useMemo(() => {
    const safeFirst = sanitizeName(firstName);
    const safeLast = sanitizeName(lastName);
    if (!safeFirst || !safeLast || !org?.id) return "";
    return buildCoachEmail(safeFirst, safeLast, org.id);
  }, [firstName, lastName, org?.id]);

  const selectedTeamLabel = useMemo(() => {
    if (!team) return "No team selected yet";
    return TEAM_DEFINITIONS.find((definition) => definition.id === team)?.label ?? team;
  }, [team]);

  const primaryColor = org?.primaryColor || "#8B1C21";

  const disabled = submitting;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredTeamSelection();
    if (stored) {
      setTeam(stored);
    }
  }, []);

  useEffect(() => {
    if (mode === null) {
      setTeam("");
    } else {
      setTeam(getStoredTeamSelection());
    }
    setPasscode("");
  }, [mode]);

  const resetSharedState = () => {
    setMessage(null);
    setSubmitting(false);
    setPasscode("");
  };

  const chooseSignInMode = (nextMode: Mode) => {
    resetSharedState();
    setFirstName("");
    setLastName("");
    setTeam(getStoredTeamSelection());
    setMode(nextMode);
  };

  const backToChooser = () => {
    resetSharedState();
    setFirstName("");
    setLastName("");
    setTeam("");
    setMode(null);
  };

  const persistProfile = async (
    uid: string | undefined,
    first: string,
    last: string,
    teamSelection: Team | ""
  ) => {
    if (!uid || !org?.id || !orgConfig?.orgCode) return;
    const base = await loadProfileRemote(uid);
    const resolvedTeam = teamSelection ? teamSelection : base?.team;

    await saveProfile({
      uid,
      firstName: first,
      lastName: last,
      unit: base?.unit ?? "lb",
      team: resolvedTeam,
      tm: base?.tm ?? {},
      oneRm: base?.oneRm ?? {},
      accessCode: base?.accessCode ?? null,
      equipment: base?.equipment,
      orgId: org.id,
      orgCode: orgConfig.orgCode,
    });

    setStoredTeamSelection(resolvedTeam ?? "");

    updateDisplayNameCache(`${first} ${last}`);
  };

  const handleAthleteSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!auth) {
      setMessage({ kind: "error", text: "Firebase auth is unavailable." });
      return;
    }
    if (!org?.id || !orgConfig?.orgCode) {
      setMessage({ kind: "error", text: "Organization settings not loaded." });
      return;
    }
    
    const safeFirst = sanitizeName(firstName);
    const safeLast = sanitizeName(lastName);
    const digits = normalizePasscodeDigits(passcode);

    if (!safeFirst || !safeLast) {
      setMessage({ kind: "error", text: "Enter first and last name." });
      return;
    }
    if (digits.length !== 4) {
      setMessage({
        kind: "error",
        text: "Passcode must be 4 digits. Ask your coach if this is your first time.",
      });
      return;
    }

    if (!team) {
      setMessage({ kind: "error", text: "Select your team before signing in." });
      return;
    }

    // Validate org code for first-time users
    if (isFirstTime) {
      const enteredCode = verificationCode.trim().toUpperCase();
      const expectedCode = orgConfig.orgCode.trim().toUpperCase();
      if (enteredCode !== expectedCode) {
        setMessage({
          kind: "error",
          text: "Team code does not match. Ask your coach for the correct code.",
        });
        return;
      }
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { profile, createdAccount } = await signInOrCreateAthleteAccount({
        firstName: safeFirst,
        lastName: safeLast,
        passcodeDigits: digits,
        team,
        orgId: org.id,
        orgCode: orgConfig.orgCode,
        isFirstTime,
      });

      // If account was created but user didn't check "first time", warn them
      if (createdAccount && !isFirstTime) {
        // This means they're actually new but didn't provide org code
        // The account was created - this shouldn't happen with our new logic
        // But we handle it gracefully
      }

      setStoredTeamSelection(profile.team ?? "");
      updateDisplayNameCache(`${profile.firstName} ${profile.lastName}`.trim());
      setMessage({
        kind: "success",
        text: "Signed in! You're ready to train.",
      });
      navigate("/session", { replace: true });
    } catch (err: any) {
      if (err instanceof AthleteAuthError) {
        if (err.code === "auth/wrong-password") {
          setMessage({
            kind: "error",
            text: "Passcode does not match. Ask your coach if you need help.",
          });
        } else if (err.code === "auth/user-not-found") {
          setMessage({
            kind: "error",
            text: "No account found. If this is your first time, check the 'First time?' box and enter your team code.",
          });
        } else if (err.code === "athlete-code/taken") {
          setMessage({
            kind: "error",
            text: "That code is already being used by another athlete. Ask your coach for a unique code.",
          });
        } else if (err.code === "athlete-code/unavailable") {
          setMessage({
            kind: "error",
            text: "We couldn't verify that code. Try again in a moment.",
          });
        } else if (err.code === "auth/unavailable") {
          setMessage({
            kind: "error",
            text: "Firebase auth is unavailable.",
          });
        } else {
          setMessage({
            kind: "error",
            text: err.message || "We could not sign you in.",
          });
        }
      } else {
        const code = (err as AuthError)?.code;
        const text =
          code === "auth/email-already-in-use"
            ? "That athlete already exists. Double-check spelling or the passcode."
            : (err?.message ?? "We could not sign you in.");
        setMessage({ kind: "error", text });
      }
    } finally {
      setPasscode("");
      setTeam("");
      setVerificationCode("");
      setIsFirstTime(false);
      setSubmitting(false);
    }
  };

const handleCoachSignIn = async (event: React.FormEvent) => {
  event.preventDefault();
  if (!auth) {
    setMessage({ kind: "error", text: "Firebase auth is unavailable." });
    return;
  }
  if (!org?.id || !orgConfig?.orgCode || !orgConfig?.coachPasscode) {
    setMessage({ kind: "error", text: "Organization settings not loaded." });
    return;
  }

  const safeFirst = sanitizeName(firstName);
  const safeLast = sanitizeName(lastName);
  if (!safeFirst || !safeLast) {
    setMessage({ kind: "error", text: "Enter first and last name." });
    return;
  }
  if (!team) {
    setMessage({ kind: "error", text: "Select your team before signing in." });
    return;
  }

  const email = buildCoachEmail(safeFirst, safeLast, org.id);
  const entered = normalizeCoachPasscode(passcode);
  if (!entered) {
    setMessage({ kind: "error", text: "Enter the coach passcode." });
    return;
  }
  
  const expected = normalizeCoachPasscode(orgConfig.coachPasscode);
  const adminExpected = adminCoachPasscodeFromEnv
    ? normalizeCoachPasscode(adminCoachPasscodeFromEnv)
    : null;
  const isAdminOverride = adminExpected ? entered === adminExpected : false;
  
  // Check if this coach is the designated org admin by name match
  const isOrgAdmin = orgConfig.adminFirstName && orgConfig.adminLastName
    ? safeFirst.toLowerCase() === orgConfig.adminFirstName.toLowerCase() &&
      safeLast.toLowerCase() === orgConfig.adminLastName.toLowerCase()
    : false;

  if (entered !== expected && !isAdminOverride) {
    setMessage({
      kind: "error",
      text: "That passcode does not match. Check with your admin for the current coach code.",
    });
    return;
  }

  setSubmitting(true);
  setMessage(null);
  const password = coachPassword(orgConfig.orgCode, entered);
  let userUid: string | undefined;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    userUid = auth.currentUser?.uid ?? undefined;
  } catch (err: any) {
    const error = err as AuthError;
    const shouldCreate =
      error.code === "auth/user-not-found" || error.code === "auth/invalid-credential";

    if (shouldCreate) {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        userUid = cred.user.uid;
      } catch (createErr: any) {
        const code = (createErr as AuthError)?.code;
        if (code === "auth/email-already-in-use") {
          try {
            const cred = await signInWithEmailAndPassword(auth, email, password);
            userUid = cred.user.uid;
          } catch (retryErr: any) {
            const text =
              (retryErr as AuthError)?.message ??
              "We could not sign you in with the existing coach account. Ask an admin to reset the coach passcode.";
            setMessage({ kind: "error", text });
            setSubmitting(false);
            return;
          }
        } else {
          const text = createErr?.message ?? "We could not create the account.";
          setMessage({ kind: "error", text });
          setSubmitting(false);
          return;
        }
      }
    } else if (error.code === "auth/wrong-password") {
      setMessage({
        kind: "error",
        text: "Passcode does not match. Ask your admin for the current coach code.",
      });
      setSubmitting(false);
      return;
    } else {
      setMessage({
        kind: "error",
        text: error.message ?? "We could not sign you in.",
      });
      setSubmitting(false);
      return;
    }
  }

  if (!userUid) {
    setSubmitting(false);
    return;
  }

  try {
    await ensureAnon();
  } catch (err) {
    console.warn("Failed to confirm Firebase auth state", err);
  }

  try {
    if (isAdminOverride || isOrgAdmin) {
      await ensureAdminRole();
    } else {
      await ensureCoachRoleOnly();
    }
    await waitForRoleSync(userUid, isAdminOverride || isOrgAdmin);
  } catch (err: any) {
    console.warn("Failed to ensure coach/admin role", err);
    setMessage({
      kind: "error",
      text: (isAdminOverride || isOrgAdmin)
        ? "Signed in, but we could not confirm admin access. Try the admin code again or contact support."
        : "Signed in, but we could not update coach permissions in Firestore. Ask an admin to confirm Firebase configuration.",
    });
  }

  let allowedTeams: Team[] = [];

  // First check if this access code has previous team scopes
  try {
    const database = fb.db;
    if (!database) throw new Error("Firebase not available");
    const ref = doc(database, "roles", userUid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as RolesDocument;
      const history = data.accessHistory?.[entered];
      if (history && history.teamScopes && history.teamScopes.length > 0) {
        allowedTeams = history.teamScopes as Team[];
        // If current team is valid, add it if not present
        if (team && !allowedTeams.includes(team as Team)) {
          allowedTeams = [...allowedTeams, team as Team];
        }
      }
    }
  } catch (err) {
    console.warn("Failed to check previous team scopes", err);
  }

  // If no history, use current team
  if (allowedTeams.length === 0 && team) {
    allowedTeams = [team as Team];
  }

  // NOTE: updateCoachTeamScope disabled - team scopes validation removed from Firestore rules
  // try {
  //   await updateCoachTeamScope(team, entered);
  // } catch (err) {
  //   console.warn("Failed to update coach team scope", err);
  // }

  try {
    const freshTeamScopes = await fetchCoachTeamScopes(userUid);
    if (freshTeamScopes.length > 0) {
      allowedTeams = freshTeamScopes;
    }
  } catch (err) {
    console.warn("Failed to fetch coach team scopes", err);
  }

  setStoredTeamScopes(allowedTeams);
  const resolvedActiveTeam =
    team && allowedTeams.includes(team as Team)
      ? (team as Team)
      : allowedTeams[0] ?? team ?? "";
  setStoredTeamSelection(resolvedActiveTeam ?? "");

  try {
    await persistProfile(userUid, safeFirst, safeLast, team);
  } catch (err) {
    console.warn("Failed to persist coach profile", err);
  } finally {
    setPasscode("");
    setTeam("");
    setSubmitting(false);
  }
  navigate("/team", { replace: true });
};

  if (!org) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">Select your program first</h1>
          <p className="text-sm text-gray-600">
            Pick your school/club from the carousel, then choose coach or athlete login.
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn btn-primary w-full justify-center"
          >
            Go to program selector
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-10">

        {/* Back to org carousel button */}
        <div className="flex justify-start">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/20 hover:text-white transition"
          >
            <span>←</span>
            <span>Change Program</span>
          </button>
        </div>

        <section className="rounded-[28px] border border-gray-200 bg-white p-6 text-gray-900 shadow-soft md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Login workspace
              </p>
              <h2 className="text-3xl font-bold text-gray-900">Continue into your program</h2>
              <p className="text-sm text-gray-600">
                Choose athlete or coach to unlock the right tools. Your team selection carries over.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <div className="font-semibold text-gray-900">Team: {selectedTeamLabel}</div>
            </div>
          </div>

          <div className="mt-6">
            {mode === null ? (
              <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => chooseSignInMode("athlete")}
                  disabled={disabled}
                  className="group flex flex-col items-start justify-between gap-3 rounded-3xl border border-gray-200 bg-gradient-to-br from-blue-50 to-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      Athletes
                    </p>
                    <p className="text-2xl font-bold text-blue-900">Enter with team code</p>
                    <p className="mt-2 text-sm text-gray-600">
                      Use your 4-digit team code to join your roster instantly.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">Start as athlete -&gt;</span>
                </button>
                <button
                  type="button"
                  onClick={() => chooseSignInMode("coach")}
                  disabled={disabled}
                  className="group flex flex-col items-start justify-between gap-3 rounded-3xl border border-gray-200 bg-gradient-to-br from-amber-50 to-white p-8 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Coaches / Admins
                    </p>
                    <p className="text-2xl font-bold text-amber-900">Enter with coach code</p>
                    <p className="mt-2 text-sm text-gray-600">
                      Use the shared coach or admin passcode to set staff permissions.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-amber-700">Start as coach -&gt;</span>
                </button>
              </div>
            ) : (
              <div className="mt-2 rounded-3xl border border-gray-200 bg-white p-6 shadow-inner">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 disabled:opacity-50"
                    onClick={backToChooser}
                    disabled={disabled}
                  >
                    <span aria-hidden="true">&lt;</span>
                    Choose a different login
                  </button>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {mode === "athlete" ? "Athlete Sign In" : "Coach Sign In"}
                    </p>
                    <p className="text-sm text-gray-700">
                      {mode === "athlete"
                        ? "Use your team code to get started."
                        : "Use the shared passcode from your program admin."}
                    </p>
                  </div>
                </div>

                {message && (
                  <div
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
                      message.kind === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                {mode === "athlete" ? (
                  <form className="space-y-4" onSubmit={handleAthleteSignIn}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                        First name
                        <input
                          className="field"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Jordan"
                          autoComplete="given-name"
                          disabled={disabled}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                        Last name
                        <input
                          className="field"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Taylor"
                          autoComplete="family-name"
                          disabled={disabled}
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                      Team
                      <select
                        className="field"
                        value={team}
                        onChange={(e) => setTeam(e.target.value as Team | "")}
                        disabled={disabled}
                      >
                        {TEAM_OPTIONS.map((opt) => (
                          <option key={opt.label} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                      Your 4-digit PIN
                      <input
                        className="field tracking-widest text-center text-base"
                        type="tel"
                        value={passcode}
                        onChange={(e) => setPasscode(normalizePasscodeDigits(e.target.value))}
                        placeholder="1234"
                        inputMode="numeric"
                        maxLength={4}
                        disabled={disabled}
                      />
                      <span className="text-xs text-gray-500">
                        This is your personal PIN. Ask your coach if this is your first time.
                      </span>
                    </label>

                    {/* First time registration section */}
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isFirstTime}
                          onChange={(e) => {
                            setIsFirstTime(e.target.checked);
                            if (!e.target.checked) setVerificationCode("");
                          }}
                          disabled={disabled}
                          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-blue-900">
                          First time signing in?
                        </span>
                      </label>
                      
                      {isFirstTime && (
                        <div className="mt-3">
                          <label className="flex flex-col gap-1 text-sm font-medium text-blue-800">
                            Team Code
                            <input
                              className="field uppercase tracking-wider"
                              value={verificationCode}
                              onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
                              placeholder="Enter team code from your coach"
                              disabled={disabled}
                            />
                            <span className="text-xs text-blue-600">
                              Your coach will give you this code to verify you're on the team.
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      <div className="mb-2">
                        <span className="font-semibold text-gray-900">Organization: </span>
                        {org?.name || "Not selected"}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Your email will be: <span className="font-semibold text-gray-900">
                          {athleteEmail || (firstName && lastName ? `${sanitizeName(firstName).toLowerCase()}${sanitizeName(lastName).toLowerCase()}-${org?.id?.toLowerCase() || 'org'}@anchorone.app` : "firstlast-org@anchorone.app")}
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn w-full justify-center py-3 text-base text-white"
                      style={{ background: primaryColor, borderColor: primaryColor }}
                      disabled={disabled}
                    >
                      {submitting && mode === "athlete" ? "Signing in..." : "Sign in"}
                    </button>
                  </form>
                ) : (
                  <form className="space-y-4" onSubmit={handleCoachSignIn}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                        First name
                        <input
                          className="field"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Jordan"
                          autoComplete="given-name"
                          disabled={disabled}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                        Last name
                        <input
                          className="field"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Taylor"
                          autoComplete="family-name"
                          disabled={disabled}
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                      Team
                      <select
                        className="field"
                        value={team}
                        onChange={(e) => setTeam(e.target.value as Team | "")}
                        disabled={disabled}
                      >
                        {TEAM_OPTIONS.map((opt) => (
                          <option key={opt.label} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
                      Coach passcode
                      <input
                        className="field tracking-widest text-center text-base"
                        value={passcode}
                        onChange={(e) => setPasscode(normalizeCoachPasscode(e.target.value))}
                        placeholder="FIREUP"
                        maxLength={16}
                        disabled={disabled}
                      />
                      <span className="text-xs text-gray-500">
                        Ask your program admin for the current coach passcode.
                      </span>
                    </label>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      <div className="mb-2">
                        <span className="font-semibold text-gray-900">Organization: </span>
                        {org?.name || "Not selected"}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        Coach email: <span className="font-semibold text-gray-900">
                          {coachEmail || (firstName && lastName ? `coach-${sanitizeName(firstName).toLowerCase()}${sanitizeName(lastName).toLowerCase()}@${org?.id?.toLowerCase() || 'org'}.strength` : "coach-firstlast@org.strength")}
                        </span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn w-full justify-center py-3 text-base text-white"
                      style={{ background: primaryColor, borderColor: primaryColor }}
                      disabled={disabled}
                    >
                      {submitting && mode === "coach" ? "Signing in..." : "Sign in as coach"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}




















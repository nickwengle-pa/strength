import React, { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  type AuthError,
} from "firebase/auth";
import {
  AthleteAuthError,
  TEAM_DEFINITIONS,
  buildAthleteEmail,
  ensureAdminRole,
  ensureAnon,
  ensureCoachRoleOnly,
  fb,
  fetchCoachTeamScopes,
  refreshRoles,
  getStoredTeamSelection,
  loadProfileRemote,
  normalizePasscodeDigits,
  saveProfile,
  setStoredTeamSelection,
  setStoredTeamScopes,
  signInOrCreateAthleteAccount,
  updateCoachTeamScope,
  type Team,
  type RolesDocument,
} from "../lib/db";
import { doc, getDoc } from "firebase/firestore";

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
const coachPassword = (code: string) => `${code}coach!`;
const buildCoachEmail = (firstName: string, lastName: string): string => {
  const canonical = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z]/g, "");
  return `coach-${canonical}@pl.strength`;
};
const TEAM_OPTIONS: Array<{ label: string; value: Team | "" }> = [
  { label: "Select a team", value: "" },
  ...TEAM_DEFINITIONS.map((definition) => ({
    label: definition.label,
    value: definition.id,
  })),
];

type CarouselTeam = {
  id: string;
  name: string;
  subtitle: string;
  team?: Team;
  code?: string;
  accent: string;
  logo?: string;
};

const TEAM_CAROUSEL_ITEMS: CarouselTeam[] = [
  {
    id: "demo-high",
    name: "Demo High",
    subtitle: "Red Dragons",
    team: "football-varsity",
    code: "4321",
    accent: "from-orange-400 via-red-500 to-rose-600",
    logo: "/assets/dragon.png",
  },
  {
    id: "blue-lake",
    name: "Blue Lake Prep",
    subtitle: "Falcons",
    team: "boys-basketball-varsity",
    code: "2580",
    accent: "from-sky-400 via-blue-500 to-indigo-600",
    logo: "/assets/pl.png",
  },
  {
    id: "east-tech",
    name: "East Tech",
    subtitle: "Chargers",
    team: "girls-basketball-varsity",
    code: "1470",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
    logo: "/assets/pl.png",
  },
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
  const [mode, setMode] = useState<Mode | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [team, setTeam] = useState<Team | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<StatusMessage>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  const auth = fb.auth;

  const athleteEmail = useMemo(() => {
    const safeFirst = sanitizeName(firstName);
    const safeLast = sanitizeName(lastName);
    if (!safeFirst || !safeLast) return "";
    return buildAthleteEmail(safeFirst, safeLast);
  }, [firstName, lastName]);

  const coachEmail = useMemo(() => {
    const safeFirst = sanitizeName(firstName);
    const safeLast = sanitizeName(lastName);
    if (!safeFirst || !safeLast) return "";
    return buildCoachEmail(safeFirst, safeLast);
  }, [firstName, lastName]);

  const selectedTeamLabel = useMemo(() => {
    if (!team) return "No team selected yet";
    return TEAM_DEFINITIONS.find((definition) => definition.id === team)?.label ?? team;
  }, [team]);


  const disabled = submitting;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredTeamSelection();
    if (stored) {
      setTeam(stored);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => setActiveSlide((prev) => (prev + 1) % TEAM_CAROUSEL_ITEMS.length),
      4200
    );
    return () => clearInterval(timer);
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

  const handleSelectSlide = (index: number) => {
    setActiveSlide(index);
    const chosenTeam = TEAM_CAROUSEL_ITEMS[index]?.team;
    if (chosenTeam) {
      setTeam(chosenTeam);
    }
  };

  const persistProfile = async (
    uid: string | undefined,
    first: string,
    last: string,
    teamSelection: Team | ""
  ) => {
    if (!uid) return;
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
        text: "Passcode must be 4 digits. Ask your coach if you forgot it.",
      });
      return;
    }

    if (!team) {
      setMessage({ kind: "error", text: "Select your team before signing in." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const { profile } = await signInOrCreateAthleteAccount({
        firstName: safeFirst,
        lastName: safeLast,
        passcodeDigits: digits,
        team,
      });

      setStoredTeamSelection(profile.team ?? "");
      updateDisplayNameCache(`${profile.firstName} ${profile.lastName}`.trim());
      setMessage({
        kind: "success",
        text: "Signed in! You're ready to train.",
      });
    } catch (err: any) {
      if (err instanceof AthleteAuthError) {
        if (err.code === "auth/wrong-password") {
          setMessage({
            kind: "error",
            text: "Passcode does not match. Ask your coach if you need help.",
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
      setSubmitting(false);
    }
  };

const handleCoachSignIn = async (event: React.FormEvent) => {
  event.preventDefault();
  if (!auth) {
    setMessage({ kind: "error", text: "Firebase auth is unavailable." });
    return;
  }
  if (!coachPasscodeFromEnv) {
    setMessage({
      kind: "error",
      text: "Coach passcode is not configured. Ask an admin to set VITE_COACH_PASSCODE.",
    });
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

  const email = buildCoachEmail(safeFirst, safeLast);
  const entered = normalizeCoachPasscode(passcode);
  if (!entered) {
    setMessage({ kind: "error", text: "Enter the coach passcode." });
    return;
  }
  const expected = normalizeCoachPasscode(coachPasscodeFromEnv);
  const adminExpected = adminCoachPasscodeFromEnv
    ? normalizeCoachPasscode(adminCoachPasscodeFromEnv)
    : null;
  const isAdminOverride = adminExpected ? entered === adminExpected : false;

  if (entered !== expected && !isAdminOverride) {
    setMessage({
      kind: "error",
      text: "That passcode does not match. Check with your admin for the current coach code.",
    });
    return;
  }

  setSubmitting(true);
  setMessage(null);
  const standardPassword = coachPassword(expected);
  const enteredPassword = coachPassword(entered);
  const password = isAdminOverride ? standardPassword : enteredPassword;
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
    if (isAdminOverride) {
      await ensureAdminRole();
    } else {
      await ensureCoachRoleOnly();
    }
    await waitForRoleSync(userUid, isAdminOverride);
  } catch (err: any) {
    console.warn("Failed to ensure coach/admin role", err);
    setMessage({
      kind: "error",
      text: isAdminOverride
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
};

  const slideCount = TEAM_CAROUSEL_ITEMS.length;
  const activeOrg = TEAM_CAROUSEL_ITEMS[activeSlide % slideCount];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-800/90 to-slate-900/90 p-6 md:p-8 shadow-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_25%)]" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.05fr_1fr]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                Multi-program hub
              </div>
              <h1 className="text-4xl font-black leading-tight md:text-5xl">
                Choose your team to enter
              </h1>
              <p className="max-w-xl text-sm text-white/80 md:text-base">
                Tap your school or club logo, then continue as a coach or athlete. New
                organizations can onboard here with their own passcodes and branding.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => chooseSignInMode("athlete")}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
                  disabled={disabled}
                >
                  Athlete login
                </button>
                <button
                  type="button"
                  onClick={() => chooseSignInMode("coach")}
                  className="rounded-2xl border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
                  disabled={disabled}
                >
                  Coach login
                </button>
                <button
                  type="button"
                  onClick={() => chooseSignInMode("coach")}
                  className="rounded-2xl border border-emerald-300/60 bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/30"
                  disabled={disabled}
                >
                  New organization
                </button>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Selected team
                    </p>
                    <p className="text-base font-semibold text-white">{selectedTeamLabel}</p>
                  </div>
                  {activeOrg?.code && (
                    <div className="rounded-xl bg-white/10 px-3 py-2 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                        Team code
                      </p>
                      <p className="text-lg font-bold text-white">{activeOrg.code}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/60">
                  Clicking a logo auto-fills your team. Codes still apply for athlete or coach
                  access.
                </p>
              </div>
            </div>

            <div className="relative">
              <div className="carousel-3d" role="listbox" aria-label="Team selector">
                {TEAM_CAROUSEL_ITEMS.map((item, index) => {
                  const rawOffset = index - activeSlide;
                  const half = Math.floor(slideCount / 2);
                  const offset =
                    rawOffset > half ? rawOffset - slideCount : rawOffset < -half ? rawOffset + slideCount : rawOffset;
                  const depth = 260 - Math.abs(offset) * 70;
                  const translateX = offset * 170;
                  const rotateY = offset * -18;
                  const opacity = Math.max(0, 1 - Math.abs(offset) * 0.22);
                  const scale = offset === 0 ? 1 : 0.9;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="carousel-3d-item focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                      style={{
                        transform: `translateX(${translateX}px) translateZ(${depth}px) rotateY(${rotateY}deg) scale(${scale})`,
                        zIndex: 100 - Math.abs(offset),
                        opacity,
                      }}
                      aria-label={`Select ${item.name}`}
                      onClick={() => handleSelectSlide(index)}
                    >
                      <div className="carousel-card relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/80 shadow-2xl">
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${item.accent} opacity-90`}
                          aria-hidden="true"
                        />
                        <div className="relative flex h-full flex-col justify-between p-5 text-left">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white/15 ring-2 ring-white/40">
                              {item.logo ? (
                                <img
                                  src={item.logo}
                                  alt={`${item.name} logo`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-lg font-bold text-white">
                                  {item.name.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
                                {item.subtitle}
                              </p>
                              <p className="text-2xl font-black leading-tight text-white">
                                {item.name}
                              </p>
                            </div>
                          </div>
                          {item.code && (
                            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white">
                              Team code {item.code}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 flex items-center justify-center gap-2">
                {TEAM_CAROUSEL_ITEMS.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`h-2 w-8 rounded-full transition ${
                      index === activeSlide ? "bg-white" : "bg-white/30 hover:bg-white/60"
                    }`}
                    onClick={() => handleSelectSlide(index)}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

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
              {activeOrg?.code && (
                <div className="text-xs text-gray-600">Team code hint: {activeOrg.code}</div>
              )}
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
                      4-digit team code
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
                    </label>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      Team email we will use:{" "}
                      <span className="font-semibold text-gray-900">
                        {athleteEmail || "firstlast@pl.strength"}
                      </span>
                      . No real inbox required - coaches manage the codes.
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary w-full justify-center py-3 text-base"
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
                    </label>

                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      Coach email we will use:{" "}
                      <span className="font-semibold text-gray-900">
                        {coachEmail || "coach-firstlast@pl.strength"}
                      </span>
                      . Share the passcode only with trusted staff.
                    </div>
                    <p className="text-xs text-gray-500">
                      Ask your program admin for the current passcode (configured via{" "}
                      <code>VITE_COACH_PASSCODE</code>).
                    </p>
                    <button
                      type="submit"
                      className="btn btn-primary w-full justify-center py-3 text-base"
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































import React, { useEffect, useState } from "react";
import {
  TEAM_DEFINITIONS,
  defaultEquipment,
  ensureAnon,
  loadProfileRemote,
  saveProfile,
  getAllSessionsForProfile,
  type Profile as ProfileModel,
  type Unit,
  type Team,
  type SessionRecord,
} from "../lib/db";
import OnboardingWizard from "../components/OnboardingWizard";

type LiftHistory = {
  lift: string;
  sessions: SessionRecord[];
};

function LiftChart({ lift, sessions, unit }: { lift: string; sessions: SessionRecord[]; unit: Unit }) {
  if (sessions.length === 0) return null;

  const liftLabel = lift.charAt(0).toUpperCase() + lift.slice(1);
  const maxEst = Math.max(...sessions.map(s => s.est1rm || 0));
  const minEst = Math.min(...sessions.filter(s => s.est1rm).map(s => s.est1rm || 0));
  const range = maxEst - minEst || 1;
  const chartHeight = 120;
  const chartWidth = Math.max(sessions.length * 50, 300);

  return (
    <div className="card space-y-3">
      <h3 className="text-lg font-semibold text-gray-800">{liftLabel} Progress</h3>
      <div className="overflow-x-auto">
        <svg width={chartWidth} height={chartHeight + 40} className="min-w-full">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <line
              key={pct}
              x1={40}
              y1={chartHeight - pct * chartHeight + 10}
              x2={chartWidth - 10}
              y2={chartHeight - pct * chartHeight + 10}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
          ))}
          
          {/* Line path */}
          <path
            d={sessions.map((s, i) => {
              const x = 50 + i * ((chartWidth - 70) / Math.max(sessions.length - 1, 1));
              const y = chartHeight - ((s.est1rm || 0) - minEst) / range * (chartHeight - 20) + 10;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none"
            stroke="#8B1C21"
            strokeWidth={2}
          />
          
          {/* Data points */}
          {sessions.map((s, i) => {
            const x = 50 + i * ((chartWidth - 70) / Math.max(sessions.length - 1, 1));
            const y = chartHeight - ((s.est1rm || 0) - minEst) / range * (chartHeight - 20) + 10;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={4} fill="#8B1C21" />
                <title>{`${s.est1rm} ${unit} - ${s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A'}`}</title>
              </g>
            );
          })}
          
          {/* Y-axis labels */}
          <text x={5} y={15} fontSize={10} fill="#6b7280">{maxEst}</text>
          <text x={5} y={chartHeight + 5} fontSize={10} fill="#6b7280">{minEst}</text>
        </svg>
      </div>
      
      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-medium text-gray-600">Date</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">Week</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">TM</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">Est 1RM</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">AMRAP</th>
            </tr>
          </thead>
          <tbody>
            {sessions.slice().reverse().map((s, i) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-2 px-2 text-gray-700">
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
                </td>
                <td className="py-2 px-2 text-gray-700">Week {s.week}</td>
                <td className="py-2 px-2 text-gray-700">{s.tm} {unit}</td>
                <td className="py-2 px-2 font-semibold text-gray-900">{s.est1rm} {unit}</td>
                <td className="py-2 px-2 text-gray-700">
                  {s.amrap?.weight} {unit} x {s.amrap?.reps}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<ProfileModel | null>(null);
  const [uid, setUid] = useState<string>("");
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [liftHistory, setLiftHistory] = useState<LiftHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    (async () => {
      const u = await ensureAnon();
      setUid(u);
      const existing = await loadProfileRemote(u);
      const profile = existing || {
        uid: u,
        firstName: "",
        lastName: "",
        unit: "lb",
        accessCode: null,
        tm: {},
        oneRm: {},
        equipment: defaultEquipment(),
      };
      setP(profile);
      
      // Load lift history
      setLoadingHistory(true);
      const history = await getAllSessionsForProfile();
      setLiftHistory(history);
      setLoadingHistory(false);
      
      // Show onboarding if user has no TM set (first-time user)
      const hasSkippedOnboarding = localStorage.getItem("pl-onboarding-skipped");
      const hasTM = profile.tm && Object.keys(profile.tm).length > 0;
      if (!hasTM && !hasSkippedOnboarding) {
        setShowOnboarding(true);
      }
    })();
  }, []);

  const update = (patch: Partial<ProfileModel>) =>
    setP(prev => ({ ...(prev as ProfileModel), ...(patch as any) }));

  const save = async () => {
    if (!p) return;
    await saveProfile(p);
    setLastSaved(Date.now());
    alert("Saved.");
  };
  
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem("pl-onboarding-skipped", "true");
  };

  if (!p) return null;

  return (
    <div className="container py-6 space-y-6">
      {showOnboarding && (
        <OnboardingWizard onComplete={handleOnboardingComplete} unit={p.unit} />
      )}
      
      <h1>Profile</h1>
      
      <button
        onClick={() => setShowOnboarding(true)}
        className="text-sm text-brand-600 hover:text-brand-700 underline"
      >
        Show Tutorial Again
      </button>
      
      <div className="card space-y-4">
        <div className="text-sm text-gray-600">
          UID: <code>{uid}</code>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">First name</span>
            <input
              className="border rounded-xl px-3 py-2"
              value={p.firstName}
              onChange={e => update({ firstName: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Last name</span>
            <input
              className="border rounded-xl px-3 py-2"
              value={p.lastName}
              onChange={e => update({ lastName: e.target.value })}
            />
          </label>
        </div>

        <div className="flex items-center gap-6">
          <div>
            <div className="text-sm font-medium mb-1">Units</div>
            <div className="flex items-center gap-3">
              {(["lb", "kg"] as Unit[]).map(u => (
                <label key={u} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="unit"
                    checked={p.unit === u}
                    onChange={() => update({ unit: u })}
                  />
                  {u}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Team</div>
            <select
              className="border rounded-xl px-3 py-2"
              value={p.team || ""}
              onChange={(e) => update({ team: e.target.value as Team })}
            >
              <option value="">Select team</option>
              {TEAM_DEFINITIONS.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-semibold">Sign-in code</div>
          <div className="mt-1 font-mono text-base text-gray-900">
            {p.accessCode ?? "-"}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Coaches assign unique codes to each athlete. Ask a coach if you need yours reset.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-sm text-gray-600">
              Last saved: {new Date(lastSaved).toLocaleTimeString()}
            </span>
          )}
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>

      {/* PR History Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Lift History</h2>
        
        {loadingHistory ? (
          <div className="card text-sm text-gray-600">Loading history...</div>
        ) : liftHistory.length === 0 ? (
          <div className="card text-sm text-gray-600">
            No session history yet. Complete some training sessions to see your progress here.
          </div>
        ) : (
          liftHistory.map(({ lift, sessions }) => (
            <LiftChart key={lift} lift={lift} sessions={sessions} unit={p.unit} />
          ))
        )}
      </div>
    </div>
  );
}
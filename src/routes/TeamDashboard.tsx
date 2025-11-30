import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { fb } from "../lib/db";
import { useAuth } from "../lib/auth";
import { useOrg } from "../context/OrgContext";

type AthleteActivity = {
  uid: string;
  firstName: string;
  lastName: string;
  workouts: number;
  lastSession: string;
  totalPRs: number;
};

export default function TeamDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { org } = useOrg();
  const [loading, setLoading] = useState(true);
  const [activeThisWeek, setActiveThisWeek] = useState(0);
  const [totalAthletes, setTotalAthletes] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [recentPRs, setRecentPRs] = useState(0);
  const [athleteActivity, setAthleteActivity] = useState<AthleteActivity[]>([]);

  const brandColor = org?.primaryColor || "#8B1C21";

  useEffect(() => {
    const loadDashboardData = async () => {
      if (!fb.db || !user?.uid) {
        setLoading(false);
        return;
      }

      try {
        // Get user's profile to find orgId
        const profilesRef = collection(fb.db, "profiles");
        const profileQuery = query(profilesRef, where("uid", "==", user.uid), limit(1));
        const profileSnap = await getDocs(profileQuery);
        
        if (profileSnap.empty) {
          setLoading(false);
          return;
        }

        const userProfile = profileSnap.docs[0].data();
        const orgId = userProfile.orgId;

        if (!orgId) {
          setLoading(false);
          return;
        }

        // Load all athletes in the org
        const athletesQuery = query(
          profilesRef,
          where("orgId", "==", orgId),
          where("role", "==", "athlete")
        );
        const athletesSnap = await getDocs(athletesQuery);
        setTotalAthletes(athletesSnap.size);

        // Calculate stats from sessions
        const sessionsRef = collection(fb.db, "sessions");
        const now = Date.now();
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

        const recentSessionsQuery = query(
          sessionsRef,
          where("orgId", "==", orgId),
          where("createdAt", ">=", oneWeekAgo)
        );
        const sessionsSnap = await getDocs(recentSessionsQuery);
        
        const activeUids = new Set<string>();
        let workoutCount = 0;
        let prCount = 0;

        sessionsSnap.forEach((doc) => {
          const data = doc.data();
          activeUids.add(data.athleteUid);
          workoutCount++;
          if (data.isPR) {
            prCount++;
          }
        });

        setActiveThisWeek(activeUids.size);
        setTotalWorkouts(workoutCount);
        setRecentPRs(prCount);

        // Build athlete activity table
        const activityMap = new Map<string, AthleteActivity>();
        
        athletesSnap.forEach((doc) => {
          const data = doc.data();
          activityMap.set(data.uid, {
            uid: data.uid,
            firstName: data.firstName || "",
            lastName: data.lastName || "",
            workouts: 0,
            lastSession: "Never",
            totalPRs: 0,
          });
        });

        // Get all sessions for org athletes
        const allSessionsQuery = query(
          sessionsRef,
          where("orgId", "==", orgId),
          orderBy("createdAt", "desc")
        );
        const allSessionsSnap = await getDocs(allSessionsQuery);

        allSessionsSnap.forEach((doc) => {
          const data = doc.data();
          const activity = activityMap.get(data.athleteUid);
          if (activity) {
            activity.workouts++;
            if (data.isPR) {
              activity.totalPRs++;
            }
            if (activity.lastSession === "Never" && data.createdAt) {
              const date = new Date(data.createdAt);
              activity.lastSession = date.toLocaleDateString();
            }
          }
        });

        setAthleteActivity(Array.from(activityMap.values()));
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="container py-6">
        <div className="card">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Team Dashboard Header */}
      <div
        className="rounded-2xl border-2 p-6 space-y-6"
        style={{
          backgroundColor: brandColor,
          borderColor: brandColor,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-3xl font-bold">Team Dashboard</h1>
            <p className="text-white/80 mt-1">Weekly activity and performance</p>
          </div>
          <button
            className="rounded-xl border-2 border-white bg-white px-6 py-2 font-semibold text-sm hover:bg-white/90 transition"
            style={{ color: brandColor }}
            onClick={() => navigate("/roster")}
          >
            View Roster →
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white p-6 text-center">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Active This Week</h3>
            <div className="text-4xl font-bold text-green-600">{activeThisWeek}</div>
            <p className="text-gray-500 text-sm mt-1">of {totalAthletes} athletes</p>
          </div>

          <div className="rounded-xl bg-white p-6 text-center">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Total Workouts</h3>
            <div className="text-4xl font-bold text-blue-600">{totalWorkouts}</div>
            <p className="text-gray-500 text-sm mt-1">last 7 days</p>
          </div>

          <div className="rounded-xl bg-white p-6 text-center">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Recent PRs</h3>
            <div className="text-4xl font-bold text-purple-600">{recentPRs}</div>
            <p className="text-gray-500 text-sm mt-1">this week</p>
          </div>
        </div>
      </div>

      {/* Athlete Activity Table */}
      <div className="card">
        <h2 className="text-2xl font-bold mb-4" style={{ color: brandColor }}>
          Athlete Activity
        </h2>

        {athleteActivity.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No athletes found. Add athletes from the roster to see activity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2" style={{ borderColor: brandColor }}>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Athlete</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Workouts</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Last Session</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Total PRs</th>
                </tr>
              </thead>
              <tbody>
                {athleteActivity.map((athlete) => (
                  <tr
                    key={athlete.uid}
                    className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition"
                    onClick={() => navigate(`/profile?uid=${athlete.uid}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">
                        {athlete.firstName} {athlete.lastName}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{athlete.workouts}</td>
                    <td className="py-3 px-4 text-gray-700">{athlete.lastSession}</td>
                    <td className="py-3 px-4">
                      <span
                        className="inline-block rounded-full px-3 py-1 text-sm font-semibold text-white"
                        style={{ backgroundColor: athlete.totalPRs > 0 ? brandColor : "#9ca3af" }}
                      >
                        {athlete.totalPRs}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

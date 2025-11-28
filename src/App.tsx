import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import Nav from "./components/Nav";
import ActiveAthleteBanner from "./components/ActiveAthleteBanner";
import Home from "./routes/Home";
import Session from "./routes/Session";
import Roster from "./routes/Roster";
import Calculator from "./routes/Calculator";
import Summary from "./routes/Summary";
import Progress from "./routes/Progress";
import Sheets from "./routes/Sheets";
import Admin from "./routes/Admin";
import Profile from "./routes/Profile";
import Exercises from "./routes/Exercises";
import ProgramOutline from "./routes/ProgramOutline";
import Attendance from "./routes/Attendance";
import SignIn from "./routes/SignIn";
import LoginLanding from "./routes/LoginLanding";
import OrgLogin from "./routes/OrgLogin";
import NewSchool from "./routes/NewSchool";
import AdminInvites from "./routes/AdminInvites";
import SuperAdmin from "./routes/SuperAdmin";
import { useAuth } from "./lib/auth";
import { ActiveAthleteProvider } from "./context/ActiveAthleteContext";
import { useOrg } from "./context/OrgContext";

export default function App() {
  const { user, initializing, signingInWithLink } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { org } = useOrg();

  const publicPaths = ["/", "/login", "/login-selection", "/DH", "/new-school"];

  if (initializing || signingInWithLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Loading your account…
      </div>
    );
  }

  const isPublic =
    publicPaths.includes(location.pathname) ||
    location.pathname.startsWith("/org/");

  if (!user && !isPublic) {
    return <SignIn />;
  }

  return (
    <ActiveAthleteProvider>
      <div className="min-h-full flex flex-col">
        {user && (
          <>
            <Nav />
            <ActiveAthleteBanner />
          </>
        )}
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login-selection" element={<LoginLanding />} />
            <Route
              path="/DH"
              element={
                <LoginLanding
                  orgName="Demo High"
                  logoSrc="/assets/dragon.png"
                  titlePrefix="Demo High Strength"
                />
              }
            />
            <Route path="/org/:abbr" element={<OrgLogin />} />
            <Route path="/new-school" element={<NewSchool />} />
            <Route path="/login" element={<SignIn />} />
            <Route path="/session" element={<Session />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/sheets" element={<Sheets />} />
            <Route path="/program-outline" element={<ProgramOutline />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/invites" element={<AdminInvites />} />
            <Route path="/super-admin" element={<SuperAdmin />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ActiveAthleteProvider>
  );
}

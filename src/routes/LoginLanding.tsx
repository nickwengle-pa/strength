import React from "react";
import { useNavigate } from "react-router-dom";

type LoginLandingProps = {
  orgName?: string;
  logoSrc?: string;
  titlePrefix?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

export default function LoginLanding({
  orgName = "PL Strength",
  logoSrc = "/assets/dragon.png",
  titlePrefix = "PL Strength",
  primaryColor = "#8B1C21",
  secondaryColor = "#B9B9B9",
}: LoginLandingProps) {
  const navigate = useNavigate();
  const bg = primaryColor;
  const border = secondaryColor;
  const text = primaryColor;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-4 py-16">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="absolute left-4 top-4 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        ← Home
      </button>
      <div className="w-full max-w-7xl text-center space-y-12">
        <div className="flex justify-center">
          <img
            src={logoSrc}
            alt={`${orgName} logo`}
            className="h-[clamp(96px,12vw,144px)] w-[clamp(96px,12vw,144px)] rounded-full border border-gray-200 bg-white object-contain shadow-md"
          />
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900">
            {titlePrefix} Sign In
          </h1>
          <p className="text-base md:text-lg text-gray-600">
            Choose how you want to log in to start training.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <button
            type="button"
            onClick={() => navigate("/login?mode=athlete")}
            className="group w-full rounded-[36px] px-12 py-14 text-center transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: `${bg}1A`,
              border: `1px solid ${border}80`,
            }}
          >
            <span
              className="text-3xl md:text-4xl font-extrabold uppercase tracking-wide"
              style={{ color: text }}
            >
              Athlete Login
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/login?mode=coach")}
            className="group w-full rounded-[36px] px-12 py-14 text-center transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: `${bg}1A`,
              border: `1px solid ${border}80`,
            }}
          >
            <span
              className="text-3xl md:text-4xl font-extrabold uppercase tracking-wide"
              style={{ color: text }}
            >
              Coach Login
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

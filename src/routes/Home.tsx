import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { fb } from "../lib/db";
import { useOrg } from "../context/OrgContext";

type CarouselTeam = {
  id: string;
  name: string;
  subtitle: string;
  logo: string;
  accent: string;
  loginPath?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

const CAROUSEL_TEAMS: CarouselTeam[] = [
  {
    id: "demo-high",
    name: "Demo High",
    subtitle: "Red Dragons",
    logo: "/assets/dragon.png",
    accent: "from-orange-400 via-red-500 to-rose-600",
    loginPath: "/DH",
    primaryColor: "#8B1C21",
    secondaryColor: "#B9B9B9",
  },
  {
    id: "blue-lake",
    name: "Blue Lake Prep",
    subtitle: "Falcons",
    logo: "/assets/pl.png",
    accent: "from-sky-400 via-blue-500 to-indigo-600",
  },
  {
    id: "east-tech",
    name: "East Tech",
    subtitle: "Chargers",
    logo: "/assets/pl.png",
    accent: "from-emerald-400 via-teal-500 to-cyan-500",
  },
  {
    id: "west-ridge",
    name: "West Ridge",
    subtitle: "Wolves",
    logo: "/assets/dragon.png",
    accent: "from-amber-400 via-rose-500 to-red-600",
  },
];

export default function Home() {
  const [activeSlide, setActiveSlide] = useState(0);
  const navigate = useNavigate();
  const [teams, setTeams] = useState<CarouselTeam[]>(CAROUSEL_TEAMS);
  const { org, setOrg } = useOrg();
  const [ctaMessage, setCtaMessage] = useState<string | null>(null);

  useEffect(() => {
    const count = teams.length || 1;
    const timer = setInterval(() => setActiveSlide((prev) => (prev + 1) % count), 3200);
    return () => clearInterval(timer);
  }, [teams.length]);

  useEffect(() => {
    const loadOrgs = async () => {
      const db = fb.db;
      if (!db) return;
      try {
        const snap = await getDocs(collection(db, "organizations"));
        const rows: CarouselTeam[] = [];
        snap.forEach((docSnap) => {
          const data: any = docSnap.data();
          rows.push({
            id: docSnap.id,
            name: data?.name || docSnap.id,
            subtitle: data?.abbr || docSnap.id,
            logo: data?.logo || "/assets/dragon.png",
            accent: "from-slate-500 via-slate-600 to-slate-800",
            loginPath: data?.loginPath || `/org/${docSnap.id}`,
            primaryColor: data?.primaryColor,
            secondaryColor: data?.secondaryColor,
          });
        });
        if (rows.length) {
          setTeams(rows);
        } else {
          setTeams(CAROUSEL_TEAMS);
        }
      } catch (err) {
        console.warn("Failed to load organizations for carousel", err);
        setTeams(CAROUSEL_TEAMS);
      }
    };
    loadOrgs();
  }, []);

  const slideCount = teams.length || CAROUSEL_TEAMS.length;

  useEffect(() => {
    if (activeSlide >= teams.length) {
      setActiveSlide(0);
    }
  }, [teams.length, activeSlide]);

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_25%)]" />
        <div className="relative z-10 w-full text-center">
          <h1 className="text-5xl font-black leading-tight md:text-6xl">
            Pick your program
          </h1>
          <p className="mt-3 text-sm text-white/70 md:text-base">
            A clean, full-width 3D logo carousel. Click a logo or let it revolve.
          </p>
          <div className="mt-4">
            <button
              type="button"
              className="rounded-2xl border border-white/40 px-5 py-2 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
              onClick={() => navigate("/new-school")}
            >
              Add New School
            </button>
          </div>
          {ctaMessage && (
            <div className="mt-3 text-xs font-semibold text-amber-200">
              {ctaMessage}
            </div>
          )}
        </div>

        <div className="relative w-full" style={{ transform: "translateY(-140px)" }}>
          <div className="carousel-3d mx-auto" role="listbox" aria-label="Team selector">
            {teams.map((item, index) => {
              const rawOffset = index - activeSlide;
              const half = Math.floor(teams.length / 2);
              const offset =
                rawOffset > half
                  ? rawOffset - teams.length
                  : rawOffset < -half
                  ? rawOffset + teams.length
                  : rawOffset;
              const depth = 520 - Math.abs(offset) * 120;
              const translateX = offset * 320;
              const rotateY = offset * -25;
              const opacity = Math.max(0, 1 - Math.abs(offset) * 0.14);
              const scale = offset === 0 ? 1.12 : 0.82;

              return (
                <button
                  key={item.id}
                  type="button"
                  className="carousel-3d-item focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  style={{
                    transform: `translateX(${translateX}px) translateZ(${depth}px) rotateY(${rotateY}deg) scale(${scale})`,
                    zIndex: 200 - Math.abs(offset),
                    opacity,
                  }}
                  aria-label={`View ${item.name}`}
                  onClick={() => {
                    setActiveSlide(index);
                    setOrg({
                      id: item.id,
                      name: item.name,
                      logo: item.logo,
                      primaryColor: item.primaryColor,
                      secondaryColor: item.secondaryColor,
                    });
                    setCtaMessage(null);
                    navigate(item.loginPath ?? "/login-selection");
                  }}
                >
                  <div className="relative flex h-full flex-col items-center justify-center gap-3 p-4">
                    <div
                      className="overflow-hidden rounded-3xl shadow-2xl ring-4 ring-white/15"
                      style={{
                        width: "clamp(200px, 24vw, 300px)",
                        height: "clamp(200px, 24vw, 300px)",
                      }}
                    >
                      <img
                        src={item.logo}
                        alt={`${item.name} logo`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold uppercase tracking-wide text-white/80">
                        {item.subtitle}
                      </p>
                      <p className="text-2xl font-black leading-tight text-white">
                        {item.name}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

        </div>

        <div className="relative w-full mt-64 flex items-center justify-center">
          <div className="flex items-center justify-center gap-3">
            {CAROUSEL_TEAMS.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`h-3 w-12 rounded-full transition ${
                  index === activeSlide ? "bg-white" : "bg-white/30 hover:bg-white/60"
                }`}
                onClick={() => setActiveSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

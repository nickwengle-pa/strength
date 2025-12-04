import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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

const CAROUSEL_TEAMS: CarouselTeam[] = [];

export default function Home() {
  const [activeSlide, setActiveSlide] = useState(0);
  const navigate = useNavigate();
  const [teams, setTeams] = useState<CarouselTeam[]>([]);
  const [loading, setLoading] = useState(true);
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
      if (!db) {
        setLoading(false);
        return;
      }
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
        setTeams(rows);
        setLoading(false);
      } catch (err) {
        console.warn("Failed to load organizations for carousel", err);
        setLoading(false);
      }
    };
    loadOrgs();
  }, []);

  const slideCount = teams.length || 1;

  useEffect(() => {
    if (activeSlide >= teams.length) {
      setActiveSlide(0);
    }
  }, [teams.length, activeSlide]);

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Top corner branding */}
      <div className="absolute top-6 left-6 z-40 hidden items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-xl backdrop-blur md:flex">
        <img src="/logo.png" alt="AnchorOne" className="h-14 w-auto drop-shadow" />
        <div className="text-left">
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">
            AnchorOne
          </p>
          <p className="text-base font-semibold text-white">Strength</p>
        </div>
      </div>
      <div className="absolute top-6 right-6 z-50">
        <Link
          to="/super-admin"
          className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-white/40 hover:bg-white/10 hover:text-white/80"
        >
          🔧 Admin
        </Link>
      </div>
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-6">
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-15 blur-sm">
          <img
            src="/logo.png"
            alt="AnchorOne watermark"
            className="w-[70vw] max-w-[560px] opacity-90"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_25%)]" />
        <div className="relative z-10 w-full text-center">
          <h1 className="text-5xl font-black leading-tight md:text-6xl">
            Pick Your Program
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

        <div className="relative w-full mt-12">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center text-white/70">
              <p>No programs available yet.</p>
            </div>
          ) : (
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
              const depth = 260 - Math.abs(offset) * 60;
              const translateX = offset * 160;
              const rotateY = offset * -20;
              const opacity = Math.max(0, 1 - Math.abs(offset) * 0.14);
              const scale = offset === 0 ? 1 : 0.75;

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
                  <div className="relative flex h-full flex-col items-center justify-center gap-2 p-3">
                    <div
                      className="overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/15"
                      style={{
                        width: "clamp(100px, 12vw, 150px)",
                        height: "clamp(100px, 12vw, 150px)",
                      }}
                    >
                      <img
                        src={item.logo}
                        alt={`${item.name} logo`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                        {item.subtitle}
                      </p>
                      <p className="text-lg font-black leading-tight text-white">
                        {item.name}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          )}
        </div>

        <div className="relative w-full mt-8 flex items-center justify-center">
          {!loading && teams.length > 0 && (
          <div className="flex items-center justify-center gap-3">
            {teams.map((_, index) => (
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
          )}
        </div>
      </main>
    </div>
  );
}

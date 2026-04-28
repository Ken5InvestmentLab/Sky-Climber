import React, { useEffect, useRef, useState } from "react";

const WIDTH = 360;
const HEIGHT = 640;
const GRAVITY = 0.42;
const JUMP = -9.4;
const MOVE_SPEED = 4.2;
const POWERUP_DURATION = 720;
const BOSS_INTRO_DURATION = 96;
const STORAGE_KEY = "sky-climber-high-score";
const NAME_KEY = "sky-climber-player-name";
const PLAYER_ID_KEY = "sky-climber-player-id";
const LEADERBOARD_TABLE = "sky_climber_scores";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const ONLINE_LEADERBOARD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const ENEMY_TYPES = ["zigzag", "swoop", "seeker", "patrol", "charger", "shard", "warden"];
const AREA_ENEMIES = {
  night: ["zigzag", "patrol"],
  sky: ["zigzag", "swoop"],
  space: ["seeker", "zigzag", "swoop", "charger"],
  dream: ["seeker", "swoop", "patrol", "zigzag", "charger", "shard", "warden"],
};
const POWER_TYPES = ["shield", "magnet", "slow", "clear", "bonus", "upgrade"];
const UPGRADE_TYPES = ["rapid", "spread", "power", "orbit"];
const ENEMY_STATS = {
  zigzag: { hp: 1, speed: 1.08, size: 20, color: "#ff7a00", accent: "#fef08a" },
  swoop: { hp: 1, speed: 1.2, size: 22, color: "#00d4ff", accent: "#bae6fd" },
  seeker: { hp: 2, speed: 1.08, size: 24, color: "#ff4d6d", accent: "#fecdd3" },
  patrol: { hp: 2, speed: 0.95, size: 24, color: "#a855f7", accent: "#ddd6fe" },
  charger: { hp: 3, speed: 1.32, size: 26, color: "#f97316", accent: "#fed7aa" },
  shard: { hp: 2, speed: 1.52, size: 18, color: "#22d3ee", accent: "#cffafe" },
  warden: { hp: 5, speed: 0.82, size: 30, color: "#84cc16", accent: "#ecfccb" },
};
const BOSS_FORMS = [
  { type: "core", name: "異形核", color: "#ff3b3b", accent: "#00ffcc", move: 1, dash: 1, bullet: 1 },
  { type: "hunter", name: "追跡者", color: "#f97316", accent: "#fef08a", move: 1.15, dash: 1.25, bullet: 1.1 },
  { type: "void", name: "虚無の主", color: "#a855f7", accent: "#22d3ee", move: 1.05, dash: 1.05, bullet: 1.35 },
  { type: "overlord", name: "支配者", color: "#ef4444", accent: "#facc15", move: 1.25, dash: 1.35, bullet: 1.5 },
  { type: "eclipse", name: "蝕む王", color: "#0f172a", accent: "#f472b6", move: 1.3, dash: 1.25, bullet: 1.8 },
  { type: "seraph", name: "星翼獣", color: "#38bdf8", accent: "#fef08a", move: 1.42, dash: 1.45, bullet: 1.75 },
  { type: "hydra", name: "多頭星龍", color: "#22c55e", accent: "#fb7185", move: 1.22, dash: 1.15, bullet: 2.05 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeGet(key, fallback) {
  try {
    if (typeof window === "undefined") return fallback;
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, String(value));
  } catch {}
}

function normalizePlayerName(name) {
  return (name || "").trim().slice(0, 12) || "YOU";
}

function makeDefaultPlayerName(playerId = "") {
  const compact = (playerId || "").replace(/[^a-z0-9]/gi, "");
  const suffix = compact.slice(-5).toUpperCase();
  return `SKY${suffix || Math.floor(1000 + Math.random() * 9000)}`;
}

function getInitialPlayerName(playerId) {
  const saved = safeGet(NAME_KEY, "");
  if (saved && saved.trim()) return normalizePlayerName(saved);
  const generated = makeDefaultPlayerName(playerId);
  safeSet(NAME_KEY, generated);
  return generated;
}

function getPlayerId() {
  const existing = safeGet(PLAYER_ID_KEY, "");
  if (existing) return existing;
  const next = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  safeSet(PLAYER_ID_KEY, next);
  return next;
}

function getJstDateParts(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth() + 1,
  };
}

function getMonthKey(date = new Date()) {
  const { year, month } = getJstDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthLabel(date = new Date()) {
  const { year, month } = getJstDateParts(date);
  return `${year}年${month}月`;
}

function getNextMonthlyResetText(date = new Date()) {
  const { year, month } = getJstDateParts(date);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}年${nextMonth}月1日 00:00 JST`;
}

function makeLeaderboard(rows, myScore, myName, playerId = "me", includeCurrent = true) {
  const entries = new Map();
  rows.forEach((row) => {
    const id = row.player_id || row.id || `${row.name}-${row.score}`;
    const score = Number(row.score) || 0;
    entries.set(id, {
      id,
      name: normalizePlayerName(row.name),
      score,
      me: id === playerId || row.me,
    });
  });

  if (includeCurrent) {
    const displayName = normalizePlayerName(myName);
    const current = entries.get(playerId);
    entries.set(playerId, {
      id: playerId,
      name: displayName,
      score: Math.max(Number(myScore) || 0, current?.score || 0),
      me: true,
    });
  }

  return [...entries.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const p = clamp(t, 0, 1);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * p)},${Math.round(ca.g + (cb.g - ca.g) * p)},${Math.round(ca.b + (cb.b - ca.b) * p)})`;
}

function getThreat(score) {
  const overLimit = Math.max(0, score - 3000);
  return Math.pow(overLimit / 850, 1.16);
}

function getEnemyStats(type, score) {
  const base = ENEMY_STATS[type] || ENEMY_STATS.zigzag;
  const tier = Math.max(0, Math.floor((score - 2500) / 700));
  const threat = getThreat(score);
  return {
    ...base,
    hp: Math.max(1, Math.ceil(base.hp + tier * 0.55 + threat * base.hp * 0.55)),
    speed: base.speed + Math.min(4.4, tier * 0.06 + threat * 0.18),
    size: base.size + Math.min(9, threat * 0.8),
  };
}

function getBackgroundColors(score) {
  const stages = [
    { at: 0, colors: ["#020617", "#1e1b4b", "#581c87"] },
    { at: 1000, colors: ["#0f172a", "#2563eb", "#38bdf8"] },
    { at: 2000, colors: ["#0369a1", "#38bdf8", "#bae6fd"] },
    { at: 3000, colors: ["#020617", "#0f172a", "#22d3ee"] },
    { at: 4200, colors: ["#1e1b4b", "#7c3aed", "#f472b6"] },
  ];
  let from = stages[0];
  let to = stages[1];
  for (let i = 0; i < stages.length - 1; i += 1) {
    if (score >= stages[i].at && score <= stages[i + 1].at) {
      from = stages[i];
      to = stages[i + 1];
      break;
    }
  }
  if (score > stages[stages.length - 1].at) {
    from = stages[stages.length - 2];
    to = stages[stages.length - 1];
  }
  const raw = clamp((score - from.at) / (to.at - from.at), 0, 1);
  const eased = raw * raw * (3 - 2 * raw);
  return [0, 1, 2].map((index) => mixColor(from.colors[index], to.colors[index], eased));
}

function getArea(score) {
  if (score > 4000) return "dream";
  if (score > 3000) return "space";
  if (score > 1000) return "sky";
  return "night";
}

function makePlatforms(score = 0) {
  const list = [{ x: 0, y: HEIGHT - 44, w: WIDTH, ground: true }];
  let x = WIDTH / 2 - 45;
  const spread = 110 + Math.min(220, score * 0.05);
  for (let i = 0; i < 13; i += 1) {
    x = clamp(x + Math.random() * spread - spread / 2, 24, WIDTH - 110);
    list.push({ x, y: HEIGHT - 120 - i * 80, w: 92, ground: false });
  }
  return list;
}

function findReachableSpot(platforms, playerY, fallbackX) {
  const target = platforms
    .filter((p) => !p.ground && p.y < playerY - 35 && p.y > playerY - 260)
    .sort((a, b) => b.y - a.y)[0];
  if (!target) return { x: clamp(fallbackX, 44, WIDTH - 44), y: playerY - 100 };
  return { x: clamp(target.x + target.w / 2, 44, WIDTH - 44), y: target.y - 34 };
}

function getBossRank(score) {
  return Math.max(0, Math.floor(score / 1000) - 1);
}

function getBossCycle(score) {
  return Math.floor(getBossRank(score) / BOSS_FORMS.length);
}

function getBossForm(score) {
  const rank = getBossRank(score);
  return BOSS_FORMS[rank % BOSS_FORMS.length];
}

function getBossFormByType(type) {
  return BOSS_FORMS.find((form) => form.type === type) || BOSS_FORMS[0];
}

function getBossType(score) {
  return getBossForm(score).type;
}

function getBossHp(score) {
  const rank = getBossRank(score);
  const cycle = getBossCycle(score);
  const threat = getThreat(score);
  return Math.floor(420 + rank * 190 + rank * rank * 52 + cycle * 760 + threat * 310);
}

function runSelfTests() {
  console.assert(clamp(5, 0, 10) === 5, "clamp keeps value in range");
  console.assert(clamp(-1, 0, 10) === 0, "clamp applies min");
  console.assert(clamp(11, 0, 10) === 10, "clamp applies max");
  console.assert(getBackgroundColors(500).length === 3, "background returns three colors");
  console.assert(makePlatforms().length > 1, "platforms are generated");
  console.assert(makeLeaderboard([], 999, "YOU", "me").length === 1, "leaderboard includes the current player");
  console.assert(getMonthKey(new Date("2026-04-30T18:00:00Z")) === "2026-05", "monthly leaderboard uses JST month boundaries");
  console.assert(Array.isArray(AREA_ENEMIES.night), "AREA_ENEMIES.night exists");
  console.assert(Array.isArray(AREA_ENEMIES[getArea(3500)]), "AREA_ENEMIES supports score-derived areas");
  console.assert(typeof POWERUP_DURATION === "number" && POWERUP_DURATION > 0, "POWERUP_DURATION is defined");
  console.assert(getThreat(2500) === 0, "threat stays calm before late game");
  console.assert(getThreat(5200) > getThreat(3600), "late-game threat keeps rising");
  console.assert(getBossType(0) === "core", "first boss should be core");
  console.assert(getBossType(3000) === "void", "higher bosses should change type");
  console.assert(getBossType(5000) === "eclipse", "boss roster should keep expanding past 4000m");
  console.assert(getBossHp(3000) > getBossHp(1000), "boss HP should scale upward");
  console.assert(makeDefaultPlayerName("player-abc123").startsWith("SKY"), "default player names should avoid shared YOU");
}

export default function App() {
  const canvasRef = useRef(null);
  const keys = useRef({ left: false, right: false });
  const touchKeys = useRef({ left: false, right: false, frames: 0 });
  const player = useRef({ x: WIDTH / 2, y: HEIGHT - 120, vx: 0, vy: 0, r: 15 });
  const platforms = useRef(makePlatforms());
  const bossArena = useRef(null);
  const enemies = useRef([]);
  const bullets = useRef([]);
  const bossBullets = useRef([]);
  const items = useRef([]);
  const particles = useRef([]);
  const floatingTexts = useRef([]);
  const powers = useRef({ shield: 0, magnet: 0, slow: 0 });
  const weapon = useRef({ rapid: 1, spread: 0, power: 1, orbit: 0, cooldown: 0, orbitAngle: 0 });
  const cameraY = useRef(0);
  const best = useRef(0);
  const nextBoss = useRef(1000);
  const nextToast = useRef(500);
  const time = useRef(0);
  const running = useRef(false);
  const deadRef = useRef(false);
  const pausedRef = useRef(false);
  const startedRef = useRef(false);
  const highScoreRef = useRef(Number(safeGet(STORAGE_KEY, "0")) || 0);
  const playerIdRef = useRef(getPlayerId());

  const [screen, setScreen] = useState("home");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(highScoreRef.current);
  const [dead, setDead] = useState(false);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState(() => getInitialPlayerName(playerIdRef.current));
  const [leaderboard, setLeaderboard] = useState(() => makeLeaderboard([], highScoreRef.current, getInitialPlayerName(playerIdRef.current), playerIdRef.current));
  const [leaderboardStatus, setLeaderboardStatus] = useState(ONLINE_LEADERBOARD_ENABLED ? "loading" : "local");
  const [leaderboardError, setLeaderboardError] = useState("");
  const [nameLocked, setNameLocked] = useState(false);

  const leaderboardMonth = getMonthLabel();
  const leaderboardReset = getNextMonthlyResetText();

  const addText = (text, x, y, color = "#fff") => {
    floatingTexts.current.push({ text, x, y, color, life: 1 });
  };

  const addBurst = (x, y, amount = 20, color = "#facc15") => {
    for (let i = 0; i < amount; i += 1) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 5,
        life: 1,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  };

  const refreshLeaderboard = async (scoreToSave = null, nameOverride = playerName, options = {}) => {
    const { checkName = scoreToSave != null } = options;
    const displayName = normalizePlayerName(nameOverride);
    const localScore = Math.max(highScoreRef.current, Number(scoreToSave) || 0);
    const playerId = playerIdRef.current;

    if (!ONLINE_LEADERBOARD_ENABLED) {
      setLeaderboard(makeLeaderboard([], localScore, displayName, playerId));
      setLeaderboardStatus("local");
      setLeaderboardError("");
      setNameLocked(false);
      return;
    }

    const headers = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    };
    const monthKey = getMonthKey();

    try {
      setLeaderboardStatus("loading");
      setLeaderboardError("");

      const loadRows = async () => {
        const params = new URLSearchParams({
          select: "player_id,name,score,updated_at",
          month_key: `eq.${monthKey}`,
          order: "score.desc",
          limit: "100",
        });
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}?${params}`, { headers });
        if (!response.ok) throw new Error(`leaderboard ${response.status}`);
        return response.json();
      };

      if (checkName) {
        const nameParams = new URLSearchParams({
          select: "player_id,name",
          month_key: `eq.${monthKey}`,
          name: `eq.${displayName}`,
          player_id: `neq.${playerId}`,
          limit: "1",
        });
        const nameResponse = await fetch(`${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}?${nameParams}`, { headers });
        if (!nameResponse.ok) throw new Error(`name ${nameResponse.status}`);
        const nameRows = await nameResponse.json();
        if (nameRows.length > 0) {
          const rows = await loadRows();
          setLeaderboard(makeLeaderboard(rows, localScore, displayName, playerId, false));
          setLeaderboardStatus("name-taken");
          setLeaderboardError(`「${displayName}」は今月すでに使われています。別の名前にしてください。`);
          setNameLocked(true);
          return;
        }
      }

      setNameLocked(false);

      if (scoreToSave != null) {
        const submitResponse = await fetch(`${SUPABASE_URL}/rest/v1/${LEADERBOARD_TABLE}?on_conflict=month_key,player_id`, {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify([{
            month_key: monthKey,
            player_id: playerId,
            name: displayName,
            score: localScore,
          }]),
        });
        if (!submitResponse.ok) {
          const body = await submitResponse.text();
          if (submitResponse.status === 409 || body.includes("duplicate key")) {
            const rows = await loadRows();
            setLeaderboard(makeLeaderboard(rows, localScore, displayName, playerId, false));
            setLeaderboardStatus("name-taken");
            setLeaderboardError(`「${displayName}」は今月すでに使われています。別の名前にしてください。`);
            setNameLocked(true);
            return;
          }
          throw new Error(`submit ${submitResponse.status}`);
        }
      }

      const rows = await loadRows();
      setLeaderboard(makeLeaderboard(rows, localScore, displayName, playerId));
      setLeaderboardStatus("online");
    } catch (error) {
      setLeaderboard(makeLeaderboard([], localScore, displayName, playerId));
      setLeaderboardStatus("error");
      setLeaderboardError("オンラインランキングを読み込めませんでした");
      setNameLocked(false);
    }
  };

  const applyUpgrade = (type) => {
    if (type === "rapid") weapon.current.rapid = Math.min(12, weapon.current.rapid + 1);
    if (type === "spread") weapon.current.spread = Math.min(12, weapon.current.spread + 1);
    if (type === "power") weapon.current.power = Math.min(8, weapon.current.power + 1);
    if (type === "orbit") weapon.current.orbit = Math.min(6, weapon.current.orbit + 1);
    addText(`UPGRADE ${type.toUpperCase()}`, WIDTH / 2, cameraY.current + 96, "#facc15");
  };

  const reset = () => {
    player.current = { x: WIDTH / 2, y: HEIGHT - 120, vx: 0, vy: 0, r: 15 };
    platforms.current = makePlatforms();
    bossArena.current = null;
    enemies.current = [];
    bullets.current = [];
    bossBullets.current = [];
    items.current = [];
    particles.current = [];
    floatingTexts.current = [];
    powers.current = { shield: 0, magnet: 0, slow: 0 };
    weapon.current = { rapid: 1, spread: 0, power: 1, orbit: 0, cooldown: 0, orbitAngle: 0 };
    cameraY.current = 0;
    best.current = 0;
    nextBoss.current = 1000;
    nextToast.current = 500;
    running.current = true;
    deadRef.current = false;
    pausedRef.current = false;
    startedRef.current = true;
    stopTouch();
    setScore(0);
    setDead(false);
    setPaused(false);
    setStarted(true);
  };

  const gameOver = () => {
    running.current = false;
    deadRef.current = true;
    pausedRef.current = false;
    const finalScore = Math.floor(best.current);
    const nextHigh = Math.max(highScoreRef.current, finalScore);
    highScoreRef.current = nextHigh;
    safeSet(STORAGE_KEY, nextHigh);
    setHighScore(nextHigh);
    void refreshLeaderboard(nextHigh);
    setPaused(false);
    setDead(true);
  };

  const startGame = () => {
    setScreen("game");
    setTimeout(reset, 0);
  };

  const goHome = () => {
    running.current = false;
    pausedRef.current = false;
    startedRef.current = false;
    deadRef.current = false;
    keys.current.left = false;
    keys.current.right = false;
    stopTouch();
    setPaused(false);
    setStarted(false);
    setDead(false);
    setScreen("home");
  };

  const togglePause = () => {
    if (!startedRef.current || deadRef.current) return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };

  const openLeaderboard = () => {
    setLeaderboard(makeLeaderboard([], highScoreRef.current, playerName, playerIdRef.current));
    void refreshLeaderboard(highScoreRef.current);
    setScreen("leaderboard");
  };

  useEffect(() => {
    runSelfTests();
    void refreshLeaderboard();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const down = (event) => {
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D", " "].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") keys.current.left = true;
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") keys.current.right = true;
      if (event.key === " ") {
        if (!startedRef.current || deadRef.current) reset();
        else togglePause();
      }
    };

    const up = (event) => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") keys.current.left = false;
      if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") keys.current.right = false;
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, []);

  useEffect(() => {
    if (screen !== "game") return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf = 0;

    const rounded = (x, y, w, h, r, fill = true) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      if (fill) ctx.fill();
      else ctx.stroke();
    };

    const makeArenaExitPlatforms = (arena) => {
      const list = [{ x: 0, y: arena.floorY, w: WIDTH, ground: true }];
      let x = WIDTH / 2 - 45;
      for (let i = 1; i <= 12; i += 1) {
        const spread = 120 + Math.min(240, best.current * 0.04);
        x = clamp(x + Math.random() * spread - spread / 2, 24, WIDTH - 110);
        list.push({ x, y: arena.floorY - 88 * i, w: 92, ground: false });
      }
      return list;
    };

    const clearBossArena = () => {
      if (!bossArena.current) return;
      const arena = bossArena.current;
      platforms.current = makeArenaExitPlatforms(arena);
      bossArena.current = null;
      addText("ROUTE OPEN", WIDTH / 2, cameraY.current + 150, "#facc15");
    };

    const spawnBoss = () => {
      const form = getBossForm(best.current);
      const rank = getBossRank(best.current);
      const cycle = getBossCycle(best.current);
      const threat = getThreat(best.current);
      const type = form.type;
      const hp = getBossHp(best.current);
      const arenaCameraY = cameraY.current;
      bossArena.current = {
        cameraY: arenaCameraY,
        ceilingY: arenaCameraY + 72,
        floorY: arenaCameraY + HEIGHT - 44,
        intro: BOSS_INTRO_DURATION,
        introDuration: BOSS_INTRO_DURATION,
        platformsCleared: false,
      };
      bossBullets.current = [];
      enemies.current.push({
        boss: true,
        type,
        form,
        rank,
        cycle,
        threat,
        x: WIDTH / 2,
        y: arenaCameraY - 92,
        vx: 0,
        vy: 0,
        hp,
        maxHp: hp,
        scale: 1 + Math.min(0.55, rank * 0.035 + cycle * 0.08),
        t: 0,
        dashTimer: Math.max(76, 230 - rank * 9),
        attackDelay: Math.max(80, 150 - rank * 5),
        shotTimer: Math.max(52, 125 - rank * 4),
      });
      addText(`${form.name} Lv.${rank + 1}${cycle > 0 ? `+${cycle}` : ""}`, WIDTH / 2, cameraY.current + 120, form.accent);
    };

    const fireBossPattern = (enemy, p) => {
      const rank = enemy.rank ?? getBossRank(best.current);
      const threat = enemy.threat ?? getThreat(best.current);
      const form = enemy.form || getBossFormByType(enemy.type);
      const phase2 = enemy.hp <= enemy.maxHp * 0.5;

      enemy.shotTimer = Math.max(0, (enemy.shotTimer || 0) - 1);
      if (enemy.attackDelay > 0 || enemy.shotTimer > 0) return;

      // フェーズで弾幕を変化
      let bulletCount;
      let spread;
      let speed;

      if (!phase2) {
        bulletCount = Math.min(34, Math.floor(3 + rank * 0.95 + form.bullet * 1.8 + threat * 1.6));
        spread = 1.2 + rank * 0.09 + threat * 0.12;
        speed = 2 + rank * 0.12 + threat * 0.2;
      } else {
        // HP50%以下：強化モード（広がり＋回転弾）
        bulletCount = Math.min(42, Math.floor(7 + rank * 1.65 + form.bullet * 2.2 + threat * 2.1));
        spread = 2.4 + rank * 0.14 + threat * 0.18;
        speed = 2.8 + rank * 0.18 + threat * 0.26;

        // 回転弾追加
        const spinCount = Math.min(38, Math.floor(8 + rank * 1.8 + threat * 2.5));
        for (let i = 0; i < spinCount; i++) {
          const angle = enemy.t * 0.1 + (Math.PI * 2 * i) / spinCount;
          bossBullets.current.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * speed * 0.7,
            vy: Math.sin(angle) * speed * 0.7,
            r: 3 + Math.min(5, rank * 0.22 + threat * 0.22),
            life: 200,
            color: form.accent,
          });
        }
      }

      const baseAngle = Math.atan2(p.y - enemy.y, p.x - enemy.x);

      for (let i = 0; i < bulletCount; i += 1) {
        const offset = (i - (bulletCount - 1) / 2) * (spread / Math.max(1, bulletCount - 1));
        const angle = baseAngle + offset;
        bossBullets.current.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 4 + Math.min(6, rank * 0.24 + threat * 0.26),
          life: 200,
          color: form.color,
        });
      }

      if ((enemy.type === "eclipse" || enemy.type === "seraph" || enemy.type === "hydra") && (phase2 || threat > 1.6)) {
        const ringCount = Math.min(32, Math.floor(10 + rank + threat * 2));
        for (let i = 0; i < ringCount; i += 1) {
          const angle = enemy.t * 0.045 + (Math.PI * 2 * i) / ringCount;
          bossBullets.current.push({
            x: enemy.x + Math.cos(angle) * 18,
            y: enemy.y + Math.sin(angle) * 18,
            vx: Math.cos(angle) * speed * 0.62,
            vy: Math.sin(angle) * speed * 0.62,
            r: 3.4,
            life: 180,
            color: form.accent,
          });
        }
      }

      enemy.shotTimer = phase2
        ? Math.max(14, Math.floor(76 - rank * 4.4 - threat * 4.2))
        : Math.max(24, Math.floor(112 - rank * 5.3 - threat * 3.8));
    };

    const spawnEnemy = () => {
      const area = getArea(best.current);
      const threat = getThreat(best.current);
      const pool = AREA_ENEMIES[area] || ENEMY_TYPES;
      const latePool = threat > 2
        ? [...pool, "charger", "shard", "warden", "seeker"]
        : threat > 0.7
        ? [...pool, "charger", "shard"]
        : pool;
      const type = latePool[Math.floor(Math.random() * latePool.length)];
      const stats = getEnemyStats(type, best.current);
      const lanes = [58, WIDTH / 2 - 14, WIDTH - 86];
      let lane = Math.floor(Math.random() * lanes.length);
      let x = clamp(lanes[lane] + (Math.random() - 0.5) * Math.min(80, threat * 18), 20, WIDTH - 42);
      if (Math.abs(x - player.current.x) < 52) {
        const safeLane = lanes.findIndex((laneX) => Math.abs(laneX - player.current.x) > 72);
        if (safeLane >= 0) {
          lane = safeLane;
          x = lanes[safeLane];
        }
      }
      enemies.current.push({
        boss: false,
        type,
        x,
        y: cameraY.current - 120,
        hp: stats.hp,
        maxHp: stats.hp,
        size: stats.size,
        speed: stats.speed,
        color: stats.color,
        accent: stats.accent,
        t: Math.random() * 10,
        dir: Math.random() < 0.5 ? -1 : 1,
        lane,
        wind: type === "seeker" || type === "charger" ? 44 : 0,
      });
    };

    const update = () => {
      const p = player.current;
      const difficulty = Math.min(1, best.current / 550);
      const threat = getThreat(best.current);
      const chaos = Math.min(1, best.current / 5200);
      let bossAlive = enemies.current.some((enemy) => enemy.boss && !enemy.dead);

      weapon.current.cooldown -= 1;
      const fireRate = Math.max(5, 22 - weapon.current.rapid * 2);
      if (weapon.current.cooldown <= 0) {
        weapon.current.cooldown = fireRate;
        const count = Math.min(14, 1 + weapon.current.spread);
        for (let i = 0; i < count; i += 1) {
          const offset = i - (count - 1) / 2;
          bullets.current.push({ x: p.x + offset * 6, y: p.y - 14, vx: offset * 0.22, vy: -8.2, r: 3, damage: weapon.current.power });
        }
      }

      if (weapon.current.orbit > 0) {
        weapon.current.orbitAngle += 0.08;
        for (let i = 0; i < weapon.current.orbit; i += 1) {
          const angle = weapon.current.orbitAngle + (Math.PI * 2 * i) / weapon.current.orbit;
          bullets.current.push({ x: p.x + Math.cos(angle) * 32, y: p.y + Math.sin(angle) * 32, vx: 0, vy: -0.15, r: 4, damage: Math.max(1, weapon.current.power - 1), life: 18, kind: "orbit" });
        }
      }

      p.vx = 0;
      if (keys.current.left) p.vx -= MOVE_SPEED;
      if (keys.current.right) p.vx += MOVE_SPEED;
      const touchDirection = (touchKeys.current.right ? 1 : 0) - (touchKeys.current.left ? 1 : 0);
      if (touchDirection !== 0) {
        touchKeys.current.frames += 1;
        const ramp = clamp(touchKeys.current.frames / 38, 0, 1);
        const touchSpeed = 1.05 + ramp * 2.35;
        p.vx = clamp(p.vx + touchDirection * touchSpeed, -MOVE_SPEED, MOVE_SPEED);
      } else {
        touchKeys.current.frames = 0;
      }
      p.x += p.vx;
      p.vy += GRAVITY;
      p.y += p.vy;
      if (p.x < -p.r) p.x = WIDTH + p.r;
      if (p.x > WIDTH + p.r) p.x = -p.r;

      if (!bossAlive && best.current >= nextBoss.current) {
        spawnBoss();
        nextBoss.current += 1000;
        bossAlive = true;
      }

      if (bossAlive && bossArena.current) {
        const arena = bossArena.current;
        const introDuration = arena.introDuration || BOSS_INTRO_DURATION;
        arena.intro = Math.max(0, arena.intro || 0);
        if (arena.intro > 0) arena.intro -= 1;
        const introProgress = clamp(1 - arena.intro / introDuration, 0, 1);

        if (arena.intro <= 0 && !arena.platformsCleared) {
          platforms.current = [];
          arena.platformsCleared = true;
        }

        const floorY = arena.floorY + (1 - introProgress) * 92;
        if (introProgress > 0.2 && p.y + p.r >= floorY) {
          p.y = floorY - p.r;
          p.vy = JUMP * 0.88;
          addBurst(p.x, floorY, 6, "#38bdf8");
        }
        if (introProgress > 0.55 && p.y - p.r < arena.ceilingY) {
          p.y = arena.ceilingY + p.r;
          p.vy = Math.max(1.8, Math.abs(p.vy) * 0.28);
          addBurst(p.x, arena.ceilingY, 6, "#fb7185");
        }
      }

      const bossIntroActive = bossAlive && bossArena.current && (bossArena.current.intro || 0) > 0;

      if (!bossAlive || bossIntroActive) platforms.current.forEach((platform) => {
        const previousY = p.y - p.vy;
        const landed = p.vy > 0 && previousY + p.r <= platform.y && p.y + p.r >= platform.y;
        const withinX = p.x > platform.x - p.r && p.x < platform.x + platform.w + p.r;
        if (landed && withinX) {
          p.vy = JUMP;
          addBurst(p.x, platform.y, 8, "#fef08a");
        }
      });

      const maxEnemies = bossAlive
        ? Math.floor(5 + chaos * 3 + Math.min(24, threat * 3.8))
        : Math.floor(3 + chaos * 16 + Math.min(56, threat * 8.2));
      const spawnRate = bossAlive
        ? 0.002 + chaos * 0.006 + Math.min(0.04, threat * 0.0045)
        : 0.002 + chaos * 0.016 + Math.min(0.08, threat * 0.0075);
      if (!bossIntroActive && enemies.current.filter((enemy) => !enemy.boss).length < maxEnemies && Math.random() < spawnRate) {
        spawnEnemy();
      }

      const powerRate = 0.0007 + difficulty * 0.0004;
      const upgradeRate = 0.00035 + difficulty * 0.0003;
      if (!bossAlive && items.current.length < 2 && Math.random() < powerRate) {
        const spot = findReachableSpot(platforms.current, p.y, p.x);
        items.current.push({ x: spot.x, y: spot.y, type: POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)], spin: 0 });
      }
      if (!bossAlive && items.current.length < 2 && Math.random() < upgradeRate) {
        const spot = findReachableSpot(platforms.current, p.y, p.x);
        items.current.push({ x: spot.x, y: spot.y, type: "upgrade", spin: 0 });
      }

      enemies.current.forEach((enemy) => {
        if (enemy.dead) return;
        bullets.current.forEach((bullet) => {
          if (enemy.dead) return;
          const enemySize = enemy.size || 24;
          const ex = enemy.boss ? enemy.x : enemy.x + enemySize / 2;
          const ey = enemy.boss ? enemy.y : enemy.y + enemySize / 2;
          const range = enemy.boss ? 38 * (enemy.scale || 1) : enemySize * 0.78;
          if (Math.abs(bullet.x - ex) < range && Math.abs(bullet.y - ey) < range) {
            if (enemy.boss && (bossArena.current?.intro || 0) > 0) return;
            bullet.hit = true;
            if (enemy.boss) {
              enemy.hp -= bullet.damage || 1;
              if (enemy.hp <= 0) {
                enemy.dead = true;
                best.current += 150;

                const arena = bossArena.current;
                const dropCount = 5 + Math.floor(Math.random() * 3);
                for (let i = 0; i < dropCount; i++) {
                  const isUpgrade = i === 0 || Math.random() < 0.45;
                  items.current.push({
                    x: clamp(enemy.x + (i - (dropCount - 1) / 2) * 32 + (Math.random() - 0.5) * 16, 36, WIDTH - 36),
                    y: arena ? arena.floorY - 46 - Math.random() * 34 : enemy.y + 26 + Math.random() * 34,
                    type: isUpgrade ? "upgrade" : POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)],
                    spin: Math.random() * Math.PI,
                  });
                }

                applyUpgrade(UPGRADE_TYPES[Math.floor(Math.random() * UPGRADE_TYPES.length)]);
                clearBossArena();

                addText("BOSS BREAK!", enemy.x, enemy.y - 40, "#facc15");
                addBurst(enemy.x, enemy.y, 90, "#facc15");
              }
            } else {
              enemy.hp -= bullet.damage || 1;
              if (enemy.hp <= 0) {
                enemy.dead = true;
                addBurst(ex, ey, 8 + Math.min(16, enemy.maxHp * 2), enemy.color || "#fb7185");
              } else {
                addBurst(ex, ey, 3, enemy.accent || "#fff");
              }
            }
          }
        });
      });

      enemies.current.forEach((enemy) => {
        if (enemy.dead) return;
        if (enemy.boss) {
          enemy.t += 1;
          const phase2 = enemy.hp <= enemy.maxHp * 0.45;
          const rank = enemy.rank ?? getBossRank(best.current);
          const threat = enemy.threat ?? getThreat(best.current);
          const form = enemy.form || getBossFormByType(enemy.type);
          const arena = bossArena.current;
          if (arena && (arena.intro || 0) > 0) {
            const introDuration = arena.introDuration || BOSS_INTRO_DURATION;
            const introProgress = clamp(1 - (arena.intro || 0) / introDuration, 0, 1);
            const easedIntro = introProgress * introProgress * (3 - 2 * introProgress);
            const targetIntroY = arena.cameraY + 84;
            const startIntroY = arena.cameraY - 92;
            enemy.x += (WIDTH / 2 - enemy.x) * 0.1;
            enemy.y = startIntroY + (targetIntroY - startIntroY) * easedIntro;
            enemy.vx *= 0.6;
            enemy.vy = 0;
            return;
          }
          const targetX = p.x;
          const targetY = cameraY.current + (phase2 ? 96 : 82) + Math.sin(enemy.t * 0.035) * (18 + Math.min(16, threat * 2));
          const dx = targetX - enemy.x;
          const dy = targetY - enemy.y;
          const moveFactor = (0.012 + rank * 0.0018 + threat * 0.0008) * form.move;
          enemy.vx = enemy.vx * 0.92 + dx * moveFactor;
          enemy.vy = enemy.vy * 0.92 + dy * moveFactor;
          const limit = phase2
            ? 2.8 + rank * 0.32 + threat * 0.16
            : 1.55 + rank * 0.18 + threat * 0.1;
          const speed = Math.hypot(enemy.vx, enemy.vy);
          if (speed > limit) {
            enemy.vx = (enemy.vx / speed) * limit;
            enemy.vy = (enemy.vy / speed) * limit;
          }
          enemy.attackDelay = Math.max(0, enemy.attackDelay - 1);
          enemy.dashTimer -= 1;
          fireBossPattern(enemy, p);
          if (rank >= 1 && enemy.attackDelay <= 0 && enemy.dashTimer <= 0) {
            const ax = p.x - enemy.x;
            const ay = p.y - enemy.y;
            const d = Math.hypot(ax, ay) || 1;

            const dash = (phase2 ? 5.8 + rank * 0.46 + threat * 0.22 : 3.0 + rank * 0.28 + threat * 0.16) * form.dash;

            enemy.vx += (ax / d) * dash;
            enemy.vy += (ay / d) * dash;

            enemy.dashTimer = phase2
              ? Math.max(44, Math.floor(122 - rank * 8 - threat * 3.5))
              : Math.max(76, Math.floor(190 - rank * 10 - threat * 4));

            addText(phase2 ? "激怒突進" : "突進予兆", enemy.x, enemy.y - 40, form.accent);
          }
          enemy.x = clamp(enemy.x + enemy.vx, 36, WIDTH - 36);
          enemy.y = clamp(enemy.y + enemy.vy, cameraY.current + 56, cameraY.current + HEIGHT * 0.38);
          if (Math.abs(enemy.x - p.x) < 34 + 12 * (enemy.scale || 1) && Math.abs(enemy.y - p.y) < 34 + 12 * (enemy.scale || 1)) {
            if (powers.current.shield > 0) {
              powers.current.shield = 0;
              enemy.hp -= 5;
              addBurst(p.x, p.y, 25, "#67e8f9");
            } else {
              gameOver();
            }
          }
          return;
        }

        const enemyStats = getEnemyStats(enemy.type, best.current);
        const enemySize = enemy.size || enemyStats.size;
        const baseSpeed = (powers.current.slow > 0 ? 0.62 : 1) * (1.05 + difficulty * 1.1 + Math.min(5.2, threat * 0.24)) * (enemy.speed || enemyStats.speed);
        enemy.t += 0.05;
        let vx = 0;
        let vy = baseSpeed;
        if (enemy.type === "seeker") {
          if (enemy.wind > 0) {
            enemy.wind -= 1;
            vy *= 0.5;
          } else {
            const dx = p.x - (enemy.x + enemySize / 2);
            const dy = p.y - (enemy.y + enemySize / 2);
            const d = Math.hypot(dx, dy) || 1;
            vx = (dx / d) * (0.8 + difficulty * 1.2 + threat * 0.16);
            vy = baseSpeed + (dy > 0 ? 0.6 + threat * 0.08 : 0);
          }
        } else if (enemy.type === "zigzag") {
          vx = Math.sin(enemy.t * 3) * (1.5 + difficulty * 2 + threat * 0.22);
        } else if (enemy.type === "swoop") {
          vx = Math.sin(enemy.t * 2) * (2.2 + threat * 0.18);
          vy = baseSpeed + Math.abs(Math.sin(enemy.t * 2)) * (2.2 + threat * 0.18);
        } else if (enemy.type === "patrol") {
          vx = enemy.dir * (1.2 + difficulty * 1.2 + threat * 0.14);
          if (enemy.x < 10 || enemy.x > WIDTH - enemySize - 4) enemy.dir *= -1;
        } else if (enemy.type === "charger") {
          if (enemy.wind > 0) {
            enemy.wind -= 1;
            vy *= 0.55;
            vx = Math.sin(enemy.t * 6) * 0.9;
          } else {
            vx = Math.sign(p.x - (enemy.x + enemySize / 2)) * (1.8 + difficulty * 1.4 + threat * 0.2);
            vy = baseSpeed + 1.25 + threat * 0.15;
          }
        } else if (enemy.type === "shard") {
          vx = Math.sin(enemy.t * 5 + enemy.lane) * (3.1 + threat * 0.3);
          vy = baseSpeed * 1.35;
        } else if (enemy.type === "warden") {
          vx = Math.sin(enemy.t * 1.4) * (1.1 + threat * 0.16);
          vy = baseSpeed * 0.78;
        }
        enemy.x += vx;
        enemy.y += vy;
        if (Math.abs(enemy.x + enemySize / 2 - p.x) < enemySize * 0.7 && Math.abs(enemy.y + enemySize / 2 - p.y) < enemySize * 0.7) {
          if (powers.current.shield > 0) {
            powers.current.shield = 0;
            enemy.dead = true;
            addBurst(p.x, p.y, 18, enemy.color || "#67e8f9");
          } else {
            gameOver();
          }
        }
      });

      enemies.current = enemies.current.filter((enemy) => !enemy.dead && (enemy.boss || enemy.y - cameraY.current < HEIGHT + 90));

      bossBullets.current.forEach((bullet) => {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        bullet.life -= 1;
        if (Math.abs(bullet.x - p.x) < 18 && Math.abs(bullet.y - p.y) < 22) {
          bullet.hit = true;
          if (powers.current.shield > 0) {
            powers.current.shield = 0;
            addBurst(p.x, p.y, 16, "#67e8f9");
          } else {
            gameOver();
          }
        }
      });
      bossBullets.current = bossBullets.current.filter((bullet) => !bullet.hit && bullet.life > 0 && bullet.y > cameraY.current - 80 && bullet.y < cameraY.current + HEIGHT + 100 && bullet.x > -60 && bullet.x < WIDTH + 60);

      items.current.forEach((item) => {
        item.spin += 0.06;
        if (powers.current.magnet > 0) {
          const dx = p.x - item.x;
          const dy = p.y - item.y;
          const d = Math.hypot(dx, dy);
          if (d < 95 && d > 1) {
            item.x += (dx / d) * 3.2;
            item.y += (dy / d) * 3.2;
          }
        }
        if (Math.abs(item.x - p.x) < 28 && Math.abs(item.y - p.y) < 32) {
          item.taken = true;
          if (item.type === "bonus") {
            best.current += 50;
            addText("+50", item.x, item.y - 20, "#facc15");
          } else if (item.type === "upgrade") {
            applyUpgrade(UPGRADE_TYPES[Math.floor(Math.random() * UPGRADE_TYPES.length)]);
          } else if (item.type === "clear") {
            enemies.current = enemies.current.filter((enemy) => enemy.boss);
            addText("CLEAR!", item.x, item.y - 20, "#fb7185");
          } else {
            powers.current[item.type] = (powers.current[item.type] || 0) + POWERUP_DURATION;
            addText(item.type.toUpperCase(), item.x, item.y - 20, "#fff");
          }
        }
      });
      items.current = items.current.filter((item) => !item.taken && item.y - cameraY.current < HEIGHT + 120);

      Object.keys(powers.current).forEach((key) => {
        if (powers.current[key] > 0) powers.current[key] -= 1;
      });
      particles.current.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.05;
        particle.life -= 0.025;
      });
      particles.current = particles.current.filter((particle) => particle.life > 0);
      bullets.current.forEach((bullet) => {
        bullet.x += bullet.vx || 0;
        bullet.y += bullet.vy || 0;
        if (bullet.life != null) bullet.life -= 1;
      });
      bullets.current = bullets.current.filter((bullet) => !bullet.hit && bullet.y > cameraY.current - 80 && bullet.y < cameraY.current + HEIGHT + 80 && (bullet.life == null || bullet.life > 0));
      floatingTexts.current.forEach((text) => {
        text.y -= 0.6;
        text.life -= 0.02;
      });
      floatingTexts.current = floatingTexts.current.filter((text) => text.life > 0);

      const targetCamera = bossArena.current
        ? bossArena.current.cameraY
        : Math.min(cameraY.current, p.y - HEIGHT * 0.65);
      cameraY.current += (targetCamera - cameraY.current) * (bossArena.current ? 0.28 : 0.1);
      best.current = Math.max(best.current, -cameraY.current / 8);
      const currentScore = Math.floor(best.current);
      if (currentScore >= nextToast.current) {
        addText(`BONUS ${nextToast.current}m`, WIDTH / 2, cameraY.current + 94, "#facc15");
        nextToast.current += 500;
      }
      setScore(currentScore);
      if (currentScore > highScoreRef.current) {
        highScoreRef.current = currentScore;
        safeSet(STORAGE_KEY, currentScore);
        setHighScore(currentScore);
      }

      if (!bossArena.current) {
        let top = Math.min(...platforms.current.map((platform) => platform.y));
        let lastX = platforms.current.filter((platform) => !platform.ground).sort((a, b) => a.y - b.y)[0]?.x ?? WIDTH / 2;
        platforms.current = platforms.current.map((platform) => {
          if (platform.ground) return platform;
          if (platform.y - cameraY.current > HEIGHT + 40) {
            top -= 80;
            const spread = 120 + Math.min(240, best.current * 0.05);
            const x = clamp(lastX + Math.random() * spread - spread / 2, 20, WIDTH - 110);
            lastX = x;
            return { ...platform, x, y: top, w: Math.max(72, 94 - difficulty * 16) };
          }
          return platform;
        });
      }

      if (p.y - cameraY.current > HEIGHT + 80) gameOver();
    };

    const drawStarPath = (points, outer, inner, rotation = -Math.PI / 2) => {
      for (let i = 0; i < points * 2; i += 1) {
        const angle = rotation + (Math.PI * i) / points;
        const r = i % 2 === 0 ? outer : inner;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const drawBossShape = (enemy) => {
      if (enemy.type === "core") {
        drawStarPath(12, 32, 23, enemy.t * 0.01);
      } else if (enemy.type === "hunter") {
        ctx.moveTo(0, -34);
        ctx.lineTo(18, -4);
        ctx.lineTo(34, 25);
        ctx.lineTo(8, 16);
        ctx.lineTo(0, 34);
        ctx.lineTo(-8, 16);
        ctx.lineTo(-34, 25);
        ctx.lineTo(-18, -4);
        ctx.closePath();
      } else if (enemy.type === "void") {
        drawStarPath(10, 36, 14, enemy.t * 0.018);
      } else if (enemy.type === "overlord") {
        drawStarPath(8, 38, 28, Math.PI / 8);
      } else if (enemy.type === "eclipse") {
        ctx.arc(0, 0, 35, 0.25 * Math.PI, 1.75 * Math.PI);
        ctx.quadraticCurveTo(-10, 0, 0, 28);
        ctx.quadraticCurveTo(12, 0, 0, -28);
        ctx.closePath();
      } else if (enemy.type === "seraph") {
        ctx.moveTo(0, -38);
        ctx.bezierCurveTo(30, -18, 42, 8, 20, 32);
        ctx.quadraticCurveTo(8, 22, 0, 38);
        ctx.quadraticCurveTo(-8, 22, -20, 32);
        ctx.bezierCurveTo(-42, 8, -30, -18, 0, -38);
        ctx.closePath();
      } else if (enemy.type === "hydra") {
        drawStarPath(7, 39, 25, enemy.t * 0.012);
      } else {
        drawStarPath(9, 34, 22);
      }
    };

    const drawEnemyShape = (enemy) => {
      const size = enemy.size || 24;
      const r = size / 2;
      if (enemy.type === "zigzag") {
        ctx.moveTo(-r, -r * 0.55);
        ctx.lineTo(-r * 0.1, -r);
        ctx.lineTo(r, -r * 0.35);
        ctx.lineTo(r * 0.25, r);
        ctx.lineTo(-r, r * 0.45);
        ctx.closePath();
      } else if (enemy.type === "swoop") {
        ctx.moveTo(0, -r * 1.05);
        ctx.lineTo(r * 1.05, r * 0.75);
        ctx.quadraticCurveTo(0, r * 0.28, -r * 1.05, r * 0.75);
        ctx.closePath();
      } else if (enemy.type === "seeker") {
        ctx.arc(0, 0, r, 0, Math.PI * 2);
      } else if (enemy.type === "charger") {
        ctx.moveTo(0, -r * 1.15);
        ctx.lineTo(r * 1.1, -r * 0.1);
        ctx.lineTo(r * 0.38, r);
        ctx.lineTo(-r * 0.38, r);
        ctx.lineTo(-r * 1.1, -r * 0.1);
        ctx.closePath();
      } else if (enemy.type === "shard") {
        drawStarPath(4, r * 1.1, r * 0.35, enemy.t);
      } else if (enemy.type === "warden") {
        drawStarPath(6, r * 1.08, r * 0.76, Math.PI / 6);
      } else {
        ctx.moveTo(-r, 0);
        ctx.lineTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.closePath();
      }
    };

    const drawItemIcon = (type, color) => {
      ctx.strokeStyle = "rgba(15,23,42,0.9)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (type === "shield") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.quadraticCurveTo(13, -9, 12, 1);
        ctx.quadraticCurveTo(10, 11, 0, 16);
        ctx.quadraticCurveTo(-10, 11, -12, 1);
        ctx.quadraticCurveTo(-13, -9, 0, -13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (type === "magnet") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, -1, 12, 0.12 * Math.PI, 0.88 * Math.PI);
        ctx.stroke();
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(-15, 7, 8, 7);
        ctx.fillRect(7, 7, 8, 7);
      } else if (type === "slow") {
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-11, -14);
        ctx.lineTo(11, -14);
        ctx.lineTo(2, 0);
        ctx.lineTo(11, 14);
        ctx.lineTo(-11, 14);
        ctx.lineTo(-2, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-5, -6);
        ctx.lineTo(5, -6);
        ctx.lineTo(0, 1);
        ctx.closePath();
        ctx.fill();
      } else if (type === "clear") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 3, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#fef9c3";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, -8);
        ctx.quadraticCurveTo(12, -18, 18, -10);
        ctx.stroke();
      } else if (type === "bonus") {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#fff7ed";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        drawStarPath(5, 16, 7, -Math.PI / 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#fff7ed";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-8, 4);
        ctx.lineTo(0, -7);
        ctx.lineTo(8, 4);
        ctx.moveTo(0, -7);
        ctx.lineTo(0, 12);
        ctx.stroke();
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      const [topColor, midColor, bottomColor] = getBackgroundColors(best.current);
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      bg.addColorStop(0, topColor);
      bg.addColorStop(0.42, midColor);
      bg.addColorStop(1, bottomColor);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const cloudAlpha = clamp((best.current - 650) / 700, 0, 1) * (1 - clamp((best.current - 2700) / 900, 0, 1));
      for (let i = 0; i < 80 + Math.floor(clamp((best.current - 2400) / 1200, 0, 1) * 60); i += 1) {
        const depth = 0.12 + (i % 5) * 0.07;
        const x = (i * 47) % WIDTH;
        const rawY = (i * 83 - cameraY.current * depth) % HEIGHT;
        const y = rawY < 0 ? rawY + HEIGHT : rawY;
        ctx.fillStyle = `rgba(255,255,255,${0.16 + depth * (1 - cloudAlpha * 0.55)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.7 + (i % 3) * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cloudAlpha > 0) {
        for (let i = 0; i < 6; i += 1) {
          const x = (i * 80 + time.current * 0.5) % (WIDTH + 120) - 60;
          const y = (i * 90 - cameraY.current * 0.2) % HEIGHT;
          ctx.fillStyle = `rgba(255,255,255,${0.45 * cloudAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 22, 0, Math.PI * 2);
          ctx.arc(x + 20, y + 6, 18, 0, Math.PI * 2);
          ctx.arc(x - 20, y + 6, 18, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      let platformAlpha = 1;
      if (bossArena.current) {
        const arena = bossArena.current;
        const introDuration = arena.introDuration || BOSS_INTRO_DURATION;
        const introProgress = clamp(1 - (arena.intro || 0) / introDuration, 0, 1);
        const easedIntro = introProgress * introProgress * (3 - 2 * introProgress);
        platformAlpha = arena.platformsCleared ? 0 : clamp((arena.intro || 0) / introDuration, 0, 1);
        const floorY = arena.floorY - cameraY.current + (1 - easedIntro) * 64;
        const ceilingY = arena.ceilingY - cameraY.current - (1 - easedIntro) * 24;
        const floorGrad = ctx.createLinearGradient(0, floorY - 18, 0, floorY + 22);
        floorGrad.addColorStop(0, "rgba(56,189,248,0.35)");
        floorGrad.addColorStop(1, "rgba(15,23,42,0.95)");
        ctx.save();
        ctx.globalAlpha = 0.16 + easedIntro * 0.84;
        ctx.fillStyle = floorGrad;
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 10 + easedIntro * 18;
        rounded(0, floorY, WIDTH, 24, 0);
        ctx.shadowBlur = 0;
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = clamp((easedIntro - 0.22) / 0.78, 0, 1);
        ctx.strokeStyle = "rgba(251,113,133,0.9)";
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(14, ceilingY);
        ctx.lineTo(WIDTH - 14, ceilingY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "rgba(254,242,242,0.82)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(WIDTH / 2, ceilingY + 22, 9, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = "rgba(254,242,242,0.82)";
        rounded(WIDTH / 2 - 11, ceilingY + 20, 22, 15, 4);
        ctx.restore();
      }

      if (platformAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = platformAlpha;
        platforms.current.forEach((platform) => {
          const y = platform.y - cameraY.current;
          const grad = ctx.createLinearGradient(platform.x, y, platform.x, y + 20);
          grad.addColorStop(0, platform.ground ? "#86efac" : "#fef08a");
          grad.addColorStop(1, platform.ground ? "#166534" : "#a16207");
          ctx.fillStyle = grad;
          ctx.shadowColor = platform.ground ? "#22c55e" : "#facc15";
          ctx.shadowBlur = 12;
          rounded(platform.x, y, platform.w, platform.ground ? 20 : 14, 7);
          ctx.shadowBlur = 0;
        });
        ctx.restore();
      }

      items.current.forEach((item) => {
        const y = item.y - cameraY.current + Math.sin(time.current * 0.12 + item.spin) * 5;
        const meta = {
          shield: "#67e8f9",
          magnet: "#f472b6",
          slow: "#a78bfa",
          clear: "#fb7185",
          bonus: "#facc15",
          upgrade: "#facc15",
        }[item.type] || "#facc15";
        ctx.save();
        ctx.translate(item.x, y);
        ctx.rotate(item.spin);
        ctx.shadowColor = meta;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.fillStyle = "rgba(15,23,42,0.72)";
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = meta;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        drawItemIcon(item.type, meta);
        ctx.restore();
      });

      bullets.current.forEach((bullet) => {
        const y = bullet.y - cameraY.current;
        ctx.fillStyle = bullet.kind === "orbit" ? "#4ade80" : "#fef08a";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(bullet.x, y, bullet.r || 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      bossBullets.current.forEach((bullet) => {
        const y = bullet.y - cameraY.current;
        ctx.fillStyle = bullet.color || "#fb7185";
        ctx.shadowColor = bullet.color || "#fb7185";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(bullet.x, y, bullet.r || 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      enemies.current.forEach((enemy) => {
        const y = enemy.y - cameraY.current;
        if (enemy.boss) {
          const phase2 = enemy.hp <= enemy.maxHp * 0.45;
          const form = enemy.form || getBossFormByType(enemy.type);
          const pulse = 1 + Math.sin(enemy.t * 0.08) * 0.03;
          ctx.save();
          ctx.translate(enemy.x, y);
          ctx.rotate(Math.sin(enemy.t * 0.018) * 0.08);
          ctx.scale((enemy.scale || 1) * pulse, (enemy.scale || 1) * pulse);
          const bossBody = ctx.createRadialGradient(-8, -10, 4, 0, 0, 44);
          bossBody.addColorStop(0, phase2 ? "#fff1f2" : "#f8fafc");
          bossBody.addColorStop(0.35, phase2 ? form.accent : form.color);
          bossBody.addColorStop(1, form.color);
          ctx.fillStyle = bossBody;
          ctx.shadowColor = phase2 ? form.accent : form.color;
          ctx.shadowBlur = 28 + (phase2 ? 10 : 0);
          ctx.beginPath();
          drawBossShape(enemy);
          ctx.fill();
          ctx.lineWidth = phase2 ? 3 : 2;
          ctx.strokeStyle = form.accent;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = form.accent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, 42, enemy.t * 0.025, enemy.t * 0.025 + Math.PI * 1.35);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, 50, -enemy.t * 0.018, -enemy.t * 0.018 + Math.PI * 0.9);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (enemy.type === "hydra") {
            ctx.fillStyle = form.accent;
            [-22, 0, 22].forEach((headX, index) => {
              ctx.beginPath();
              ctx.arc(headX, -30 + Math.sin(enemy.t * 0.08 + index) * 3, 8, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          if (enemy.type === "seraph") {
            ctx.strokeStyle = "#fef9c3";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-42, -4);
            ctx.quadraticCurveTo(-70, -24, -46, -42);
            ctx.moveTo(42, -4);
            ctx.quadraticCurveTo(70, -24, 46, -42);
            ctx.stroke();
          }
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(-8, -4, 3, 0, Math.PI * 2);
          ctx.arc(8, -4, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          rounded(-34, -52, 68, 7, 3);
          ctx.fillStyle = phase2 ? "#fb7185" : form.accent;
          rounded(-34, -52, 68 * clamp(enemy.hp / enemy.maxHp, 0, 1), 7, 3);
          ctx.restore();
          return;
        }
        const size = enemy.size || 24;
        const color = enemy.color || ENEMY_STATS[enemy.type]?.color || "#ff3b3b";
        const accent = enemy.accent || ENEMY_STATS[enemy.type]?.accent || "#fff";
        ctx.save();
        ctx.translate(enemy.x + size / 2, y + size / 2);
        ctx.rotate(Math.sin(enemy.t * 2) * 0.18);
        const enemyBody = ctx.createRadialGradient(-size * 0.2, -size * 0.25, 2, 0, 0, size * 0.72);
        enemyBody.addColorStop(0, accent);
        enemyBody.addColorStop(0.42, color);
        enemyBody.addColorStop(1, "#0f172a");
        ctx.fillStyle = enemyBody;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12 + Math.min(10, (enemy.maxHp || 1) * 1.2);
        ctx.beginPath();
        drawEnemyShape(enemy);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if ((enemy.maxHp || 1) > 1) {
          ctx.fillStyle = "rgba(15,23,42,0.82)";
          rounded(-size * 0.55, -size * 0.9, size * 1.1, 4, 2);
          ctx.fillStyle = accent;
          rounded(-size * 0.55, -size * 0.9, size * 1.1 * clamp((enemy.hp || 1) / (enemy.maxHp || 1), 0, 1), 4, 2);
        }
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-size * 0.18, -size * 0.12, 2, 0, Math.PI * 2);
        ctx.arc(size * 0.18, -size * 0.12, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, size * 0.22, Math.max(2, size * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      particles.current.forEach((particle) => {
        const y = particle.y - cameraY.current;
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color || "#fff";
        ctx.beginPath();
        ctx.arc(particle.x, y, particle.size || 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      const heroY = player.current.y - cameraY.current;
      ctx.save();
      ctx.translate(player.current.x, heroY + Math.sin(time.current * 0.12) * 2);
      ctx.fillStyle = "#7c3aed";
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.quadraticCurveTo(-30, 17, -18, 34);
      ctx.quadraticCurveTo(0, 25, 10, 8);
      ctx.closePath();
      ctx.fill();
      const body = ctx.createRadialGradient(0, -3, 2, 0, 0, 24);
      body.addColorStop(0, "#fff");
      body.addColorStop(0.55, "#bae6fd");
      body.addColorStop(1, "#38bdf8");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#bae6fd";
      ctx.beginPath();
      ctx.moveTo(-13, -12);
      ctx.lineTo(-8, -27);
      ctx.lineTo(-2, -12);
      ctx.moveTo(8, -12);
      ctx.lineTo(14, -27);
      ctx.lineTo(18, -10);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      rounded(-13, 7, 27, 5, 3);
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.ellipse(-6, -4, 3.5, 2.5, 0, 0, Math.PI * 2);
      ctx.ellipse(7, -4, 3.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      [[powers.current.shield, "#67e8f9"], [powers.current.magnet, "#f472b6"], [powers.current.slow, "#a78bfa"]]
        .filter(([value]) => value > 0)
        .forEach(([, color], index) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 24 + index * 5, 0, Math.PI * 2);
          ctx.stroke();
        });
      ctx.restore();

      floatingTexts.current.forEach((text) => {
        const y = text.y - cameraY.current;
        ctx.globalAlpha = Math.max(0, text.life);
        ctx.fillStyle = text.color || "#fff";
        ctx.font = "bold 16px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(text.text, text.x, y);
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
      });

      ctx.fillStyle = "rgba(15,23,42,0.54)";
      rounded(12, 12, 136, 42, 13);
      ctx.fillStyle = "white";
      ctx.font = "bold 22px system-ui";
      ctx.fillText(`${Math.floor(best.current)}m`, 24, 39);
      ctx.fillStyle = "#fcd34d";
      ctx.font = "bold 10px system-ui";
      ctx.fillText(`R${weapon.current.rapid} S${weapon.current.spread} P${weapon.current.power} O${weapon.current.orbit}`, 25, 51);

      const hud = [
        { label: "SHIELD", desc: "1回無敵", color: "#67e8f9", timer: powers.current.shield },
        { label: "MAGNET", desc: "吸い寄せ", color: "#f472b6", timer: powers.current.magnet },
        { label: "SLOW", desc: "敵減速", color: "#a78bfa", timer: powers.current.slow },
      ].filter((entry) => entry.timer > 0);
      hud.forEach((entry, index) => {
        const x = 232;
        const y = 12 + index * 46;
        ctx.fillStyle = "rgba(15,23,42,0.54)";
        rounded(x, y, 112, 40, 13);
        ctx.fillStyle = entry.color;
        ctx.font = "bold 12px system-ui";
        ctx.fillText(entry.label, x + 13, y + 19);
        ctx.fillStyle = "white";
        ctx.font = "bold 10px system-ui";
        ctx.fillText(`${Math.ceil(entry.timer / 60)}s`, x + 13, y + 34);
        ctx.fillStyle = "#cbd5f5";
        ctx.fillText(entry.desc, x + 55, y + 34);
      });

      if (pausedRef.current) {
        ctx.fillStyle = "rgba(0,0,0,0.48)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 34px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("PAUSE", WIDTH / 2, HEIGHT / 2 - 8);
        ctx.font = "14px system-ui";
        ctx.fillText("スペースでもう一度再開", WIDTH / 2, HEIGHT / 2 + 24);
        ctx.textAlign = "left";
      }
    };

    const tick = () => {
      time.current += 1;
      if (running.current && !deadRef.current && !pausedRef.current) update();
      draw();
      raf = window.requestAnimationFrame(tick);
    };

    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [screen, playerName]);

  const touch = (side, isDown) => {
    touchKeys.current[side] = isDown;
    if (!isDown && !touchKeys.current.left && !touchKeys.current.right) touchKeys.current.frames = 0;
  };

  const stopTouch = () => {
    touchKeys.current.left = false;
    touchKeys.current.right = false;
    touchKeys.current.frames = 0;
  };

  return (
    <div style={styles.page}>
      <div style={styles.phoneCard}>
        {screen === "home" && (
          <div style={styles.menuScreen}>
            <div style={styles.logoOrb}>✦</div>
            <div style={styles.bigTitle}>SKY CLIMBER</div>
            <div style={styles.overlayText}>魔法猫を操作して、空の城を登れ。</div>
            <div style={styles.nameBox}>
              <label style={styles.nameLabel}>PLAYER NAME</label>
              <input
                style={{ ...styles.nameInput, ...(nameLocked ? styles.nameInputError : {}) }}
                value={playerName}
                maxLength={12}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setNameLocked(false);
                  setLeaderboardError("");
                  setPlayerName(nextName);
                  safeSet(NAME_KEY, nextName);
                  setLeaderboard(makeLeaderboard([], highScoreRef.current, nextName, playerIdRef.current));
                }}
                onBlur={() => {
                  const nextName = playerName.trim()
                    ? normalizePlayerName(playerName)
                    : makeDefaultPlayerName(playerIdRef.current);
                  setPlayerName(nextName);
                  safeSet(NAME_KEY, nextName);
                  setLeaderboard(makeLeaderboard([], highScoreRef.current, nextName, playerIdRef.current));
                  void refreshLeaderboard(null, nextName, { checkName: true });
                }}
              />
              {nameLocked && <div style={styles.nameError}>{leaderboardError}</div>}
            </div>
            <div style={styles.homeScoreCard}>
              <div style={styles.homeScoreLabel}>YOUR BEST</div>
              <div style={styles.homeScore}>{highScore}m</div>
            </div>
            <button style={styles.mainButtonWide} onClick={startGame}>ゲーム開始</button>
            <button style={styles.secondaryButton} onClick={openLeaderboard}>月間ランキング TOP100</button>
          </div>
        )}

        {screen === "leaderboard" && (
          <div style={styles.menuScreen}>
            <div style={styles.headerRow}>
              <button style={styles.smallButton} onClick={() => setScreen("home")}>← トップ</button>
              <div style={styles.rankTitle}>MONTHLY TOP 100</div>
            </div>
            <div style={styles.rankMeta}>{leaderboardMonth}ランキング / リセット: {leaderboardReset}</div>
            {leaderboardStatus === "loading" && <div style={styles.rankMeta}>オンラインランキングを読み込み中...</div>}
            <div style={styles.leaderboardList}>
              {leaderboard.map((row) => (
                <div key={row.id} style={{ ...styles.rankRow, ...(row.me ? styles.myRankRow : {}) }}>
                  <div style={styles.rankNo}>#{row.rank}</div>
                  <div style={styles.rankName}>{row.name}</div>
                  <div style={styles.rankScore}>{row.score}m</div>
                </div>
              ))}
            </div>
            <div style={styles.onlineNote}>
              {leaderboardStatus === "online"
                ? "オンラインランキングです。月が変わるとJST基準で自動的に新しいランキングに切り替わります。"
                : leaderboardStatus === "name-taken"
                ? leaderboardError
                : leaderboardStatus === "error"
                ? `${leaderboardError}。ローカル記録を表示中です。`
                : "オンラインランキング未設定です。Supabase接続後に他ユーザーのスコアが表示されます。"}
            </div>
          </div>
        )}

        {screen === "game" && (
          <>
            <div style={styles.header}>
              <div>
                <div style={styles.title}>SKY CLIMBER</div>
              </div>
              <div style={styles.scoreBox}>
                <div style={styles.score}>{score}m</div>
                <div style={styles.best}>BEST {highScore}m</div>
              </div>
            </div>
            <div style={styles.topActions}>
              <button style={styles.miniButton} onClick={goHome}>トップへ</button>
              <button style={styles.miniButton} onClick={togglePause}>{paused ? "再開" : "一時停止"}</button>
              <button style={styles.miniButton} onClick={openLeaderboard}>ランキング</button>
            </div>
            <div style={styles.stage}>
              <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} style={styles.canvas} onContextMenu={(event) => event.preventDefault()} />
              {!started && (
                <div style={styles.overlay}>
                  <div style={styles.bigTitle}>SKY CLIMBER</div>
                  <div style={styles.overlayText}>魔法猫を操作して、空の城を登れ。</div>
                  <button style={styles.mainButton} onClick={reset}>スタート</button>
                </div>
              )}
              {dead && (
                <div style={styles.overlay}>
                  <div style={styles.bigTitle}>ゲームオーバー</div>
                  <div style={styles.overlayText}>記録：{score}m / BEST：{highScore}m</div>
                  <button style={styles.mainButton} onClick={reset}>リトライ</button>
                  <button style={styles.secondaryButtonSmall} onClick={goHome}>トップへ戻る</button>
                </div>
              )}
            </div>
            <div style={styles.controls} onPointerLeave={stopTouch} onPointerCancel={stopTouch}>
              <button style={styles.controlButton} onPointerDown={(event) => { event.preventDefault(); touch("left", true); }} onPointerUp={(event) => { event.preventDefault(); touch("left", false); }} onPointerCancel={() => touch("left", false)} onPointerLeave={() => touch("left", false)}>←</button>
              <button style={styles.controlButton} onPointerDown={(event) => { event.preventDefault(); touch("right", true); }} onPointerUp={(event) => { event.preventDefault(); touch("right", false); }} onPointerCancel={() => touch("right", false)} onPointerLeave={() => touch("right", false)}>→</button>
            </div>
            <div style={styles.help}>PC：←/→ または A/D、スペースで一時停止</div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100dvh", width: "100vw", overflow: "hidden", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent", background: "radial-gradient(circle at 70% 10%, #312e81 0%, transparent 30%), linear-gradient(135deg, #020617 0%, #0f172a 45%, #1e1b4b 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 10, boxSizing: "border-box", color: "white", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  phoneCard: { width: "min(100%, 390px)", maxHeight: "100dvh", background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(30,27,75,0.72))", border: "1px solid rgba(250,204,21,0.28)", borderRadius: 24, boxShadow: "0 0 50px rgba(0,0,0,0.7), inset 0 0 30px rgba(125,211,252,0.05)", backdropFilter: "blur(14px)", padding: 12, boxSizing: "border-box" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  title: { fontSize: 21, fontWeight: 950, letterSpacing: "-0.04em", textShadow: "0 0 14px rgba(192,132,252,0.6)" },
  subtitle: { fontSize: 11, color: "#c4b5fd" },
  scoreBox: { textAlign: "right", lineHeight: 1.1 },
  score: { fontSize: 22, fontWeight: 950, textShadow: "0 0 12px rgba(125,211,252,0.55)" },
  best: { fontSize: 11, color: "#fcd34d", fontWeight: 900 },
  stage: { position: "relative", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(250,204,21,0.26)", background: "black", boxShadow: "inset 0 0 32px rgba(0,0,0,0.45)" },
  canvas: { display: "block", width: "100%", maxHeight: "72dvh", objectFit: "contain", touchAction: "none" },
  overlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 24, boxSizing: "border-box" },
  bigTitle: { fontSize: 34, fontWeight: 950, letterSpacing: "-0.05em", textShadow: "0 0 18px rgba(251,146,60,0.7)" },
  overlayText: { fontSize: 14, color: "#e2e8f0" },
  mainButton: { border: "0", borderRadius: 16, padding: "12px 30px", color: "#0f172a", background: "linear-gradient(180deg, #fef08a, #facc15)", fontWeight: 950, fontSize: 16, boxShadow: "0 8px 24px rgba(250,204,21,0.35)", cursor: "pointer" },
  controls: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  controlButton: { height: 64, border: "1px solid rgba(216,180,254,0.45)", borderRadius: 18, color: "white", background: "linear-gradient(180deg, rgba(88,28,135,0.96), rgba(30,27,75,0.96))", fontSize: 28, fontWeight: 950, touchAction: "none", cursor: "pointer", boxShadow: "0 0 18px rgba(168,85,247,0.22)" },
  help: { marginTop: 8, textAlign: "center", color: "#94a3b8", fontSize: 11 },
  menuScreen: { minHeight: "min(720px, calc(100dvh - 44px))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" },
  logoOrb: { width: 86, height: 86, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 44, color: "#facc15", background: "radial-gradient(circle, rgba(250,204,21,0.55), rgba(168,85,247,0.22) 55%, rgba(15,23,42,0.1))", boxShadow: "0 0 36px rgba(250,204,21,0.35)" },
  nameBox: { width: "100%", maxWidth: 260, textAlign: "left", marginTop: 8 },
  nameLabel: { display: "block", fontSize: 10, fontWeight: 900, color: "#c4b5fd", marginBottom: 6, letterSpacing: "0.08em" },
  nameInput: { width: "100%", boxSizing: "border-box", border: "1px solid rgba(216,180,254,0.45)", borderRadius: 14, background: "rgba(15,23,42,0.7)", color: "white", padding: "12px 14px", fontSize: 16, fontWeight: 800, outline: "none" },
  nameInputError: { border: "1px solid rgba(251,113,133,0.95)", boxShadow: "0 0 0 3px rgba(251,113,133,0.14)" },
  nameError: { marginTop: 6, color: "#fecdd3", fontSize: 11, fontWeight: 800, lineHeight: 1.35 },
  homeScoreCard: { width: "100%", maxWidth: 260, borderRadius: 18, padding: 16, background: "rgba(15,23,42,0.48)", border: "1px solid rgba(250,204,21,0.26)", boxSizing: "border-box" },
  homeScoreLabel: { fontSize: 11, color: "#fcd34d", fontWeight: 900 },
  homeScore: { fontSize: 34, fontWeight: 950, textShadow: "0 0 14px rgba(250,204,21,0.35)" },
  mainButtonWide: { width: "100%", maxWidth: 260, border: "0", borderRadius: 16, padding: "14px 30px", color: "#0f172a", background: "linear-gradient(180deg, #fef08a, #facc15)", fontWeight: 950, fontSize: 17, boxShadow: "0 8px 24px rgba(250,204,21,0.35)", cursor: "pointer" },
  secondaryButton: { width: "100%", maxWidth: 260, border: "1px solid rgba(216,180,254,0.45)", borderRadius: 16, padding: "13px 20px", color: "white", background: "linear-gradient(180deg, rgba(88,28,135,0.9), rgba(30,27,75,0.9))", fontWeight: 900, fontSize: 15, cursor: "pointer" },
  secondaryButtonSmall: { border: "1px solid rgba(216,180,254,0.45)", borderRadius: 14, padding: "10px 20px", color: "white", background: "rgba(30,27,75,0.82)", fontWeight: 900, fontSize: 14, cursor: "pointer" },
  headerRow: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  smallButton: { border: "1px solid rgba(216,180,254,0.35)", borderRadius: 12, padding: "9px 11px", color: "white", background: "rgba(15,23,42,0.65)", fontWeight: 800, cursor: "pointer" },
  rankTitle: { fontSize: 15, fontWeight: 950, color: "#fcd34d" },
  rankMeta: { width: "100%", color: "#cbd5e1", fontSize: 11, fontWeight: 800, textAlign: "left", lineHeight: 1.35 },
  leaderboardList: { width: "100%", maxHeight: "calc(100dvh - 160px)", overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 6 },
  rankRow: { display: "grid", gridTemplateColumns: "54px 1fr 82px", alignItems: "center", gap: 8, padding: "10px 10px", borderRadius: 12, background: "rgba(15,23,42,0.54)", border: "1px solid rgba(148,163,184,0.18)", fontSize: 13 },
  myRankRow: { border: "1px solid rgba(250,204,21,0.75)", background: "rgba(250,204,21,0.13)" },
  rankNo: { color: "#fcd34d", fontWeight: 950, textAlign: "left" },
  rankName: { color: "white", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" },
  rankScore: { color: "#bae6fd", fontWeight: 950, textAlign: "right" },
  onlineNote: { fontSize: 10, color: "#94a3b8", lineHeight: 1.4 },
  topActions: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 8 },
  miniButton: { border: "1px solid rgba(216,180,254,0.35)", borderRadius: 12, padding: "8px 6px", color: "white", background: "rgba(15,23,42,0.65)", fontWeight: 800, fontSize: 12, cursor: "pointer" },
};

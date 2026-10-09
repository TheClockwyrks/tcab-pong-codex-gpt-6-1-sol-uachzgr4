import type { RenderApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { CaromState, MenuRect, StateView } from "./game";
import * as C from "./constants";
import { returnTitle, startMatch } from "./debug";

const CYAN = "#69e6db",
  CORAL = "#ff927e",
  GOLD = "#e6c77c",
  INK = "#e9f0ef",
  DIM = "#81949f";
export function menuItems(s: StateView): readonly string[] {
  switch (s.screen) {
    case "title":
      return C.TITLE_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "matchover":
      return C.MATCHOVER_ITEMS;
    case "howto":
      return ["BACK TO MENU"];
    default:
      return [];
  }
}
export function menuItemRect(s: StateView, index: number): MenuRect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuItems(s).length)
    return null;
  return {
    x: 440,
    y:
      (s.screen === "howto" ? 592 : s.screen === "title" ? 350 : 370) +
      index * 70,
    w: 400,
    h: 56,
  };
}
function confirm(s: StateView): CaromState {
  switch (s.screen) {
    case "title": {
      const next = { ...s, titleIndex: s.menuIndex };
      return s.menuIndex === 2
        ? { ...next, screen: "howto", menuIndex: 0, menuPresses: {} }
        : startMatch(next, s.menuIndex === 1 ? "versus" : "solo");
    }
    case "howto":
      return returnTitle(s);
    case "paused":
      return s.menuIndex === 0
        ? { ...s, screen: s.resumeScreen, menuPresses: {} }
        : s.menuIndex === 1
          ? startMatch(s, s.mode)
          : returnTitle(s);
    case "matchover":
      return s.menuIndex === 0 ? startMatch(s, s.mode) : returnTitle(s);
    default:
      return { ...s };
  }
}
export function readMenus(
  s: StateView,
  input: UpdateApi["input"],
  edges: Record<C.ActionName, boolean>,
): CaromState {
  // Input belongs to the screen at the start of the frame, including Escape's two edges.
  if (s.screen === "playing" || s.screen === "countdown") {
    return edges.pause
      ? {
          ...s,
          resumeScreen: s.screen,
          screen: "paused",
          menuIndex: 0,
          menuPresses: {},
        }
      : { ...s };
  }
  if (s.screen === "paused" && (edges.pause || edges.back))
    return { ...s, screen: s.resumeScreen, menuPresses: {} };
  if ((s.screen === "howto" || s.screen === "matchover") && edges.back)
    return returnTitle(s);
  const items = menuItems(s);
  let next: CaromState = { ...s };
  const up = edges["p1-up"] || edges["p2-up"];
  const down = edges["p1-down"] || edges["p2-down"];
  const moved = s.screen !== "howto" && (up || down);
  if (moved)
    next = {
      ...next,
      menuIndex: (s.menuIndex + (up ? -1 : 1) + items.length) % items.length,
    };
  const keyboardConfirm = edges.confirm && !moved;
  const presses: Record<number, number> = { ...s.menuPresses };
  let pointerConfirm: number | null = null;
  const hit = (x: number, y: number): number =>
    items.findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
  for (const p of input.pointerSamples()) {
    if (p.device !== "touch" && !p.primary) continue;
    const index = hit(p.x, p.y);
    if (index >= 0) next = { ...next, menuIndex: index };
    if (p.type === "down" && p.button === "primary") presses[p.id] = index;
    if (p.type === "up" && p.button === "primary") {
      if (index >= 0 && presses[p.id] === index && pointerConfirm === null)
        pointerConfirm = index;
      delete presses[p.id];
    }
  }
  for (const p of input.pointerContacts()) {
    if (p.device !== "touch") continue;
    const index = hit(p.x, p.y);
    if (index >= 0) next = { ...next, menuIndex: index };
  }
  next = { ...next, menuPresses: presses };
  if (keyboardConfirm) return confirm({ ...next, menuIndex: s.menuIndex });
  if (pointerConfirm !== null)
    return confirm({ ...next, menuIndex: pointerConfirm });
  return next;
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = DIM,
  align: CanvasTextAlign = "center",
  weight = 500,
): void {
  ctx.font = `${weight} ${size}px "Arial", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  glow = 0,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(8, w / 2));
  ctx.fill();
  ctx.restore();
}
function court(s: StateView, ctx: CanvasRenderingContext2D): void {
  // Subtle court lines give the blank space scale without competing with the ball.
  ctx.strokeStyle = "#182630";
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, C.FIELD_W - 48, C.FIELD_H - 48);
  ctx.beginPath();
  ctx.arc(C.FIELD_CX, C.FIELD_CY, 106, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([6, 14]);
  ctx.strokeStyle = "#2a3a43";
  ctx.beginPath();
  ctx.moveTo(C.NET_X, 28);
  ctx.lineTo(C.NET_X, C.FIELD_H - 28);
  ctx.stroke();
  ctx.restore();
  for (const o of s.obstacles) {
    bar(
      ctx,
      o.cx - C.OBSTACLE_HW,
      o.cy - C.OBSTACLE_HH,
      C.OBSTACLE_W,
      C.OBSTACLE_H,
      GOLD,
      12,
    );
    text(
      ctx,
      o.index === 0 ? "A" : "B",
      o.cx,
      o.cy + C.OBSTACLE_HH + 24,
      11,
      GOLD,
    );
  }
  bar(
    ctx,
    C.P1_X0,
    s.paddles.left.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    CYAN,
    18,
  );
  bar(
    ctx,
    C.P2_X0,
    s.paddles.right.cy - C.PADDLE_HALF,
    C.PADDLE_W,
    C.PADDLE_H,
    CORAL,
    18,
  );
  if (s.ball) {
    const b = s.ball;
    ctx.save();
    ctx.lineCap = "round";
    for (let i = 1; i < b.trail.length; i++) {
      const p = b.trail[i - 1],
        q = b.trail[i];
      ctx.globalAlpha = Math.max(0, 1 - (s.simTime - q.t) / C.TRAIL_TIME) * 0.5;
      ctx.strokeStyle = b.spin >= 0 ? CYAN : CORAL;
      ctx.lineWidth = C.BALL_R * 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = INK;
    ctx.shadowBlur = 20;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(b.x, b.y, C.BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
function menu(s: StateView, ctx: CanvasRenderingContext2D): void {
  menuItems(s).forEach((item, i) => {
    const r = menuItemRect(s, i)!;
    const selected = i === s.menuIndex;
    bar(ctx, r.x, r.y, r.w, r.h, selected ? "#213a40" : "#101d26");
    ctx.strokeStyle = selected ? CYAN : "#27343e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.stroke();
    text(
      ctx,
      item,
      C.FIELD_CX,
      r.y + r.h / 2,
      17,
      selected ? INK : DIM,
      "center",
      650,
    );
    if (selected) {
      text(ctx, "→", r.x + 28, r.y + r.h / 2, 22, CYAN);
      text(
        ctx,
        String(i + 1).padStart(2, "0"),
        r.x + r.w - 26,
        r.y + r.h / 2,
        11,
        CYAN,
      );
    }
  });
}
export function renderGame(s: StateView, api: RenderApi): void {
  const ctx = api.ctx;
  const live = s.screen === "playing" || s.screen === "countdown";
  ctx.save();
  court(s, ctx);
  if (live) {
    // Solid score panels keep the center net from crossing the digits.
    bar(ctx, 468, 26, 344, 106, "#0b1219");
    text(ctx, String(s.score.p1), 540, 78, 56, CYAN, "center", 700);
    text(ctx, String(s.score.p2), 740, 78, 56, CORAL, "center", 700);
    text(ctx, s.mode === "solo" ? "YOU" : "PLAYER 1", 540, 120, 11, CYAN);
    text(ctx, s.mode === "solo" ? "COMPUTER" : "PLAYER 2", 740, 120, 11, CORAL);
    text(
      ctx,
      s.mode === "solo" ? "SOLO / HUMAN vs COMPUTER" : "VERSUS / LOCAL DUEL",
      C.FIELD_CX,
      662,
      12,
      DIM,
    );
    text(
      ctx,
      `FIRST TO ${C.WIN_SCORE} · WIN BY ${C.WIN_LEAD}`,
      C.FIELD_CX,
      686,
      10,
      DIM,
    );
    text(ctx, "W / S", 82, 686, 11, CYAN, "left");
    text(
      ctx,
      s.mode === "solo" ? "P PAUSE" : "↑ / ↓",
      1198,
      686,
      11,
      CORAL,
      "right",
    );
    if (s.screen === "countdown") {
      text(ctx, "READY TO SERVE", C.FIELD_CX, 285, 15, INK, "center", 650);
      const progress =
        1 - Math.max(0, s.ball?.holdTimer ?? C.HOLD_TIME) / C.HOLD_TIME;
      bar(ctx, 590, 310, 100, 3, "#293c46");
      bar(ctx, 590, 310, Math.max(1, progress * 100), 3, CYAN);
    }
  } else {
    ctx.fillStyle = "rgba(11,18,25,0.92)";
    ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
    // Decorative court diagram frames the menu without obscuring its hit areas.
    text(ctx, "C / 01", 66, 52, 14, CYAN, "left", 700);
    text(ctx, "THE ANGLE IS EVERYTHING", 1214, 52, 11, DIM, "right");
    if (s.screen === "title") {
      text(
        ctx,
        "A PADDLE DUEL WITH A TWIST",
        C.FIELD_CX,
        173,
        13,
        CYAN,
        "center",
        650,
      );
      text(ctx, C.TITLE_TEXT, C.FIELD_CX, 245, 100, INK, "center", 800);
      text(ctx, "Move. Strike. Bend the rally.", C.FIELD_CX, 309, 18, DIM);
      // Original graphical identity: an angled ricochet route.
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(126, 480);
      ctx.lineTo(250, 356);
      ctx.lineTo(165, 236);
      ctx.stroke();
      bar(ctx, 148, 184, C.PADDLE_W, C.PADDLE_H, CYAN, 15);
      bar(ctx, 1070, 426, C.PADDLE_W, C.PADDLE_H, CORAL, 15);
      ctx.strokeStyle = CORAL;
      ctx.beginPath();
      ctx.moveTo(1128, 240);
      ctx.quadraticCurveTo(1018, 300, 1100, 404);
      ctx.stroke();
      text(ctx, "01 / FIND YOUR ANGLE", 178, 556, 10, DIM);
      text(ctx, "02 / MAKE IT CURVE", 1100, 556, 10, DIM);
    } else if (s.screen === "howto") {
      text(ctx, "HOW TO PLAY", C.FIELD_CX, 140, 46, INK, "center", 750);
      text(
        ctx,
        `First to ${C.WIN_SCORE}. Lead by ${C.WIN_LEAD}. Find a way past the other paddle.`,
        C.FIELD_CX,
        201,
        17,
        DIM,
      );
      const rows = [
        [
          "01",
          "TAKE CONTROL",
          "W / S moves the left paddle. ↑ / ↓ moves the right.",
          "In Solo, either set of keys controls you; the computer plays right.",
        ],
        [
          "02",
          "PUT A TWIST ON IT",
          "Strike while moving to add spin and curve the ball’s flight.",
          "The edge of your paddle creates a steeper angle. Speed builds with each hit.",
        ],
        [
          "03",
          "PLAY THE BANK SHOT",
          "The gold obstacles redirect the rally. Use them to find a new angle.",
          "P or Esc pauses. M toggles sound. Touch sliders move each paddle.",
        ],
      ];
      rows.forEach((r, i) => {
        const y = 274 + i * 102;
        text(ctx, r[0], 260, y, 16, CYAN, "left", 700);
        text(ctx, r[1], 310, y, 16, INK, "left", 700);
        text(ctx, r[2], 310, y + 29, 15, DIM, "left");
        text(ctx, r[3], 310, y + 53, 13, DIM, "left");
      });
    } else {
      text(
        ctx,
        s.screen === "paused" ? "RALLY ON HOLD" : "MATCH COMPLETE",
        C.FIELD_CX,
        179,
        12,
        CYAN,
        "center",
        650,
      );
      text(
        ctx,
        s.screen === "paused"
          ? "PAUSED"
          : s.winner === "left"
            ? "PLAYER 1 WINS"
            : s.mode === "solo"
              ? "COMPUTER WINS"
              : "PLAYER 2 WINS",
        C.FIELD_CX,
        248,
        54,
        INK,
        "center",
        750,
      );
      text(ctx, `${s.score.p1}  —  ${s.score.p2}`, C.FIELD_CX, 315, 28, DIM);
    }
    menu(s, ctx);
    text(
      ctx,
      "↑ ↓ OR W S TO SELECT    ·    ENTER TO PLAY",
      C.FIELD_CX,
      681,
      11,
      DIM,
    );
  }
  text(
    ctx,
    s.muted ? "M / SOUND OFF" : "M / SOUND ON",
    1214,
    27,
    10,
    DIM,
    "right",
  );
  ctx.restore();
}

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type {
  BallState,
  CaromState,
  PaddleState,
  Side,
  StateView,
} from "./game";
import * as C from "./constants";
import { parkedBall } from "./debug";

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
function movePaddle(p: PaddleState, vy: number, dt: number): PaddleState {
  const raw = p.cy + vy * dt;
  const cy = clamp(raw, C.PADDLE_MIN_CY, C.PADDLE_MAX_CY);
  return { ...p, cy, vy: raw !== cy && dt > 0 ? (cy - p.cy) / dt : vy };
}
function paddles(
  s: StateView,
  api: UpdateApi,
  dt: number,
): CaromState["paddles"] {
  const held = (name: C.ActionName): boolean => api.input.value(name) > 0;
  const solo = s.mode === "solo";
  const leftVy =
    (Number(held("p1-down") || (solo && held("p2-down"))) -
      Number(held("p1-up") || (solo && held("p2-up")))) *
    C.PADDLE_SPEED;
  let rightVy =
    (Number(held("p2-down")) - Number(held("p2-up"))) * C.PADDLE_SPEED;
  if (solo) {
    const defending =
      s.ai.tracking && s.screen === "playing" && s.ball && s.ball.vx > 0;
    const target =
      defending && s.ball ? s.ball.y - s.ball.vy * C.AI_REACT : C.AI_HOME_Y;
    const diff = target - s.paddles.right.cy;
    rightVy =
      !s.ai.movement ||
      Math.abs(diff) <= (defending ? C.AI_DEADZONE : C.AI_HOME_DEADZONE) ||
      dt <= 0
        ? 0
        : Math.sign(diff) * Math.min(C.AI_SPEED, Math.abs(diff) / dt);
  }
  return {
    left: movePaddle(
      s.paddles.left,
      s.paddles.left.driven ? s.paddles.left.drivenVy : leftVy,
      dt,
    ),
    right: movePaddle(
      s.paddles.right,
      s.paddles.right.driven ? s.paddles.right.drivenVy : rightVy,
      dt,
    ),
  };
}
/** A private working value; only the returned ball becomes authoritative state. */
type MovingBall = { -readonly [K in keyof BallState]: BallState[K] };
function rectangle(
  b: MovingBall,
  r: C.Rect,
): { face: number; bounced: boolean } | null {
  if (!(
    b.x > r.x0 - C.BALL_R &&
    b.x < r.x1 + C.BALL_R &&
    b.y > r.y0 - C.BALL_R &&
    b.y < r.y1 + C.BALL_R
  ))
    return null;
  const depths = [
    b.x - (r.x0 - C.BALL_R),
    r.x1 + C.BALL_R - b.x,
    b.y - (r.y0 - C.BALL_R),
    r.y1 + C.BALL_R - b.y,
  ];
  const face = depths.indexOf(Math.min(...depths));
  if (face === 0) b.x = r.x0 - C.BALL_R;
  if (face === 1) b.x = r.x1 + C.BALL_R;
  if (face === 2) b.y = r.y0 - C.BALL_R;
  if (face === 3) b.y = r.y1 + C.BALL_R;
  const inward =
    face === 0
      ? b.vx > 0
      : face === 1
        ? b.vx < 0
        : face === 2
          ? b.vy > 0
          : b.vy < 0;
  if (inward) {
    if (face < 2) b.vx = -b.vx;
    else b.vy = -b.vy;
  }
  return { face, bounced: inward };
}
function flight(s: StateView, dt: number, cues: Set<C.CueName>): BallState {
  const b: MovingBall = { ...s.ball! };
  if (b.held) return b;
  const n = Math.max(
    1,
    Math.ceil((Math.hypot(b.vx, b.vy) * dt) / C.MAX_SUBSTEP),
  );
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 0) {
      const a = (b.spin / speed) * h;
      const vx = b.vx * Math.cos(a) - b.vy * Math.sin(a);
      b.vy = b.vx * Math.sin(a) + b.vy * Math.cos(a);
      b.vx = vx;
    }
    b.spin *= Math.pow(0.5, h / C.SPIN_HALFLIFE);
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.y - C.BALL_R < 0 && b.vy < 0) {
      b.y = C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    } else if (b.y + C.BALL_R > C.FIELD_H && b.vy > 0) {
      b.y = C.FIELD_H - C.BALL_R;
      b.vy = -b.vy;
      cues.add(C.CUES.wallBounce);
    }
    for (const side of ["left", "right"] as const) {
      const p = s.paddles[side];
      const contact = rectangle(b, {
        x0: side === "left" ? C.P1_X0 : C.P2_X0,
        x1: side === "left" ? C.P1_X1 : C.P2_X1,
        y0: p.cy - C.PADDLE_HALF,
        y1: p.cy + C.PADDLE_HALF,
      });
      if (contact === null) continue;
      if (contact.face >= 2) {
        if (contact.bounced) cues.add(C.CUES.wallBounce);
        continue;
      }
      const theta =
        clamp((b.y - p.cy) / C.PADDLE_HALF, -1, 1) * C.MAX_BOUNCE_ANGLE;
      const outgoing = Math.min(
        Math.hypot(b.vx, b.vy) * C.SPEED_MULT,
        C.SPEED_CAP,
      );
      b.vx = (side === "left" ? 1 : -1) * outgoing * Math.cos(theta);
      b.vy = outgoing * Math.sin(theta);
      b.spin = clamp(
        b.spin + p.vy * C.SPIN_FROM_PADDLE,
        -C.SPIN_CLAMP,
        C.SPIN_CLAMP,
      );
      b.x = side === "left" ? C.P1_X1 + C.BALL_R : C.P2_X0 - C.BALL_R;
      cues.add(C.CUES.paddleHit);
    }
    for (const o of s.obstacles)
      if (rectangle(b, C.OBSTACLES[o.index])?.bounced)
        cues.add(C.CUES.obstacleBounce);
  }
  return b;
}
export function advanceSimulation(
  s: StateView,
  api: UpdateApi,
  dt: number,
): CaromState {
  if (s.screen !== "playing" && s.screen !== "countdown") return { ...s };
  let next: CaromState = { ...s, paddles: paddles(s, api, dt) };
  if (!s.ball) return next;
  const cues = new Set<C.CueName>();
  let ball: BallState;
  if (s.screen === "countdown") {
    const remaining = s.ball.holdTimer - dt;
    ball = { ...s.ball, holdTimer: Math.max(0, remaining) };
    if (remaining <= 0) {
      ball = {
        ...ball,
        held: false,
        vx:
          (s.receiver === "left" ? -1 : 1) *
          C.SERVE_SPEED *
          Math.cos(C.SERVE_ANGLE),
        vy: ball.serveSign * C.SERVE_SPEED * Math.sin(C.SERVE_ANGLE),
        trail: [],
      };
      next = { ...next, screen: "playing" };
    }
  } else ball = flight(next, dt, cues);
  ball = {
    ...ball,
    trail: [...ball.trail, { x: ball.x, y: ball.y, t: s.simTime }].filter(
      (p) => s.simTime - p.t <= C.TRAIL_TIME,
    ),
  };
  next = { ...next, ball };
  let scorer: Side | null = null;
  if (s.screen === "playing" && !ball.held) {
    if (ball.x - C.BALL_R > C.FIELD_W) scorer = "left";
    else if (ball.x + C.BALL_R < 0) scorer = "right";
  }
  if (scorer) {
    cues.add(C.CUES.score);
    const score = {
      ...s.score,
      [scorer === "left" ? "p1" : "p2"]:
        s.score[scorer === "left" ? "p1" : "p2"] + 1,
    };
    const winning =
      (score.p1 >= C.WIN_SCORE && score.p1 - score.p2 >= C.WIN_LEAD) ||
      (score.p2 >= C.WIN_SCORE && score.p2 - score.p1 >= C.WIN_LEAD);
    next = winning
      ? {
          ...next,
          score,
          winner: scorer,
          screen: "matchover",
          menuIndex: 0,
          menuPresses: {},
        }
      : {
          ...next,
          score,
          receiver: scorer === "left" ? "right" : "left",
          ball: parkedBall(),
          screen: "countdown",
        };
  }
  for (const cue of cues) api.audio.play(cue);
  return next;
}

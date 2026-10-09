import type {
  BallState,
  CaromDebugApi,
  CaromState,
  Mode,
  PaddleState,
  StateView,
} from "./game";
import * as C from "./constants";
import { menuItemRect } from "./presentation";

export const drawSign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1);
export function parkedBall(): BallState {
  return {
    x: C.FIELD_CX,
    y: C.FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: C.HOLD_TIME,
    serveSign: drawSign(),
    trail: [],
  };
}
const paddle = (): PaddleState => ({
  cy: C.FIELD_CY,
  vy: 0,
  driven: false,
  drivenVy: 0,
});
export function initialState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: paddle(), right: paddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: C.OBSTACLE_CENTERS.map((c, index) => ({
      index,
      cx: c.x,
      cy: c.y,
    })),
    simTime: 0,
    muted,
    menuPresses: {},
  };
}
export function startMatch(s: StateView, mode: Mode): CaromState {
  return {
    ...s,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...s.paddles.left, cy: C.FIELD_CY, vy: 0 },
      right: { ...s.paddles.right, cy: C.FIELD_CY, vy: 0 },
    },
    menuPresses: {},
  };
}
export function returnTitle(s: StateView): CaromState {
  return {
    ...initialState(s.muted),
    titleIndex: s.titleIndex,
    menuIndex: s.titleIndex,
    simTime: s.simTime,
  };
}
function ballPose(s: StateView, patch: Partial<BallState>): CaromState {
  if (!s.ball) throw new Error("Carom: no ball present");
  return { ...s, ball: { ...s.ball, ...patch } };
}
export function createDebug(): CaromDebugApi {
  return {
    version: C.CAROM_DEBUG_VERSION,
    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle(s, index) {
      const c = C.OBSTACLE_CENTERS[index];
      if (!c || !Number.isInteger(index))
        throw new Error(`Carom: invalid obstacle ${index}`);
      return {
        ...s,
        obstacles: [
          ...s.obstacles.filter((o) => o.index !== index),
          { index, cx: c.x, cy: c.y },
        ].sort((a, b) => a.index - b.index),
      };
    },
    reset: (s) => initialState(s.muted),
    reconcile: (s) => ({ ...s }),
    setScreen: (s, screen) => ({ ...s, screen }),
    setMode: (s, mode) => ({ ...s, mode }),
    setMenuIndex: (s, menuIndex) => ({ ...s, menuIndex }),
    setTitleIndex: (s, titleIndex) => ({ ...s, titleIndex }),
    setResumeScreen: (s, resumeScreen) => ({ ...s, resumeScreen }),
    setScore: (s, p1, p2) => ({ ...s, score: { p1, p2 } }),
    setWinner: (s, winner) => ({ ...s, winner }),
    setReceiver: (s, receiver) => ({ ...s, receiver }),
    setPaddleCy: (s, side, cy) => ({
      ...s,
      paddles: { ...s.paddles, [side]: { ...s.paddles[side], cy } },
    }),
    setPaddleVy: (s, side, drivenVy) => ({
      ...s,
      paddles: { ...s.paddles, [side]: { ...s.paddles[side], drivenVy } },
    }),
    setPaddleDriven: (s, side, driven) => ({
      ...s,
      paddles: { ...s.paddles, [side]: { ...s.paddles[side], driven } },
    }),
    setBallPosition: (s, x, y) => ballPose(s, { x, y }),
    setBallVelocity: (s, vx, vy) => ballPose(s, { vx, vy }),
    setBallSpin: (s, spin) => ballPose(s, { spin }),
    setBallHeld: (s, held) => ballPose(s, { held }),
    setBallHoldTimer: (s, holdTimer) => ballPose(s, { holdTimer }),
    setBallServeSign: (s, serveSign) => ballPose(s, { serveSign }),
    drawBallServeSign: (s) => ballPose(s, { serveSign: drawSign() }),
    setAiTracking: (s, tracking) => ({ ...s, ai: { ...s.ai, tracking } }),
    setAiMovement: (s, movement) => ({ ...s, ai: { ...s.ai, movement } }),
    setMuted(s, muted) {
      return { ...s, muted };
    },
    snapshot(s) {
      const { menuPresses: _menuPresses, ...copy } = structuredClone(s);
      return {
        ...copy,
        version: C.CAROM_DEBUG_VERSION,
        ball: s.ball
          ? {
              ...structuredClone(s.ball),
              speed: Math.hypot(s.ball.vx, s.ball.vy),
            }
          : null,
      };
    },
    menuItemRect,
  };
}

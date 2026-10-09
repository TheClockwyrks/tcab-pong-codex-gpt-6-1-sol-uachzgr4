import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { createDebug, initialState } from "./debug";
import { advanceSimulation } from "./simulation";
import { readMenus, renderGame } from "./presentation";
export const BACKGROUND = "#0b1219";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;
  /** Press origins for menu gestures, indexed by pointer identity. */
  readonly menuPresses: Readonly<Record<number, number>>;
}

export type StateView = DeepReadonly<CaromState>;
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export type CaromSnapshot = Omit<CaromState, "ball" | "menuPresses"> & {
  readonly version: number;
  readonly ball: (BallState & { readonly speed: number }) | null;
};
export interface CaromDebugApi {
  readonly version: number;
  clearWorld(s: StateView): CaromState;
  spawnBall(s: StateView): CaromState;
  spawnObstacle(s: StateView, index: number): CaromState;
  reset(s: StateView): CaromState;
  reconcile(s: StateView): CaromState;
  setScreen(s: StateView, screen: Screen): CaromState;
  setMode(s: StateView, mode: Mode): CaromState;
  setMenuIndex(s: StateView, index: number): CaromState;
  setTitleIndex(s: StateView, index: number): CaromState;
  setResumeScreen(s: StateView, screen: "countdown" | "playing"): CaromState;
  setScore(s: StateView, p1: number, p2: number): CaromState;
  setWinner(s: StateView, side: Side | null): CaromState;
  setReceiver(s: StateView, side: Side): CaromState;
  setPaddleCy(s: StateView, side: Side, cy: number): CaromState;
  setPaddleVy(s: StateView, side: Side, vy: number): CaromState;
  setPaddleDriven(s: StateView, side: Side, driven: boolean): CaromState;
  setBallPosition(s: StateView, x: number, y: number): CaromState;
  setBallVelocity(s: StateView, vx: number, vy: number): CaromState;
  setBallSpin(s: StateView, spin: number): CaromState;
  setBallHeld(s: StateView, held: boolean): CaromState;
  setBallHoldTimer(s: StateView, seconds: number): CaromState;
  setBallServeSign(s: StateView, sign: 1 | -1): CaromState;
  drawBallServeSign(s: StateView): CaromState;
  setAiTracking(s: StateView, enabled: boolean): CaromState;
  setAiMovement(s: StateView, enabled: boolean): CaromState;
  setMuted(s: StateView, muted: boolean): CaromState;
  snapshot(s: StateView): CaromSnapshot;
  menuItemRect(s: StateView, index: number): MenuRect | null;
}
export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const tones = [620, 240, 390, 840];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: "triangle",
        freq: tones[i],
        freqTo: tones[i] * (i === 3 ? 1.5 : 0.65),
        durationMs: i === 3 ? 180 : 65,
        gain: 0.16,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("p1 score", (s) => s.score.p1);
    api.diagnostics.register("p2 score", (s) => s.score.p2);
    for (const key of ["x", "y", "vx", "vy", "spin"] as const)
      api.diagnostics.register(`ball ${key}`, (s) => s.ball?.[key] ?? "absent");
    api.diagnostics.register("ball speed", (s) =>
      s.ball ? Math.hypot(s.ball.vx, s.ball.vy) : "absent",
    );
    for (const side of ["left", "right"] as const)
      for (const key of ["cy", "vy"] as const)
        api.diagnostics.register(`${side} ${key}`, (s) => s.paddles[side][key]);
    return [initialState(false), createDebug()];
  },
  update(state, api, dt) {
    const edges = Object.fromEntries(
      C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
    ) as Record<C.ActionName, boolean>;
    api.audio.setMuted(state.muted);
    if (edges.mute) api.audio.setMuted(!api.audio.muted());
    const next = readMenus(state, api.input, edges);
    return advanceSimulation(
      { ...next, simTime: state.simTime + dt, muted: api.audio.muted() },
      api,
      dt,
    );
  },
  render: renderGame,
};

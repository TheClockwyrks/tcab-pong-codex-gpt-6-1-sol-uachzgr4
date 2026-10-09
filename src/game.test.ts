import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { describe, expect, it } from "vitest";
import { BACKGROUND, game } from "./game";
import * as C from "./constants";

async function setup(step = 10) {
  const target = new EventTarget();
  const canvas = createCanvas(C.FIELD_W, C.FIELD_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.FIELD_W,
    height: C.FIELD_H,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.FIELD_W,
      cssHeight: () => C.FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  await engine.initialize();
  const key = (code: string, type = "keydown") => {
    const event = new Event(type);
    Object.assign(event, { code, repeat: false });
    target.dispatchEvent(event);
  };
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, "keyup");
  };
  const debug = engine.debug;
  const pose = (x: number, y: number, vx: number, vy: number, spin = 0) =>
    engine.apply((s) =>
      debug.setBallSpin(
        debug.setBallVelocity(
          debug.setBallPosition(
            debug.setBallHeld(debug.setScreen(s, "playing"), false),
            x,
            y,
          ),
          vx,
          vy,
        ),
        spin,
      ),
    );
  return { engine, debug, key, tap, pose, target };
}
describe("Carom through the engine", () => {
  it("registers diagnostics, starts, serves, pauses, and resumes without double Escape", async () => {
    const { engine, tap, debug } = await setup();
    expect(debug.snapshot(engine.state).ball?.speed).toBe(0);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(14);
    await tap("Enter");
    expect(engine.state.screen).toBe("countdown");
    await engine.advance(99);
    expect(engine.state.screen).toBe("playing");
    expect(debug.snapshot(engine.state).ball?.speed).toBeCloseTo(C.SERVE_SPEED);
    await tap("Escape");
    const ball = engine.state.ball;
    expect(engine.state.screen).toBe("paused");
    await engine.advance(10);
    expect(engine.state.ball).toEqual(ball);
    await tap("Escape");
    expect(engine.state.screen).toBe("playing");
    engine.destroy();
  });
  it("uses navigation precedence and remembers the title selection", async () => {
    const { engine, key, tap } = await setup();
    key("KeyW");
    key("KeyS");
    key("Enter");
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(2);
    expect(engine.state.screen).toBe("title");
    for (const code of ["KeyW", "KeyS", "Enter"]) key(code, "keyup");
    await tap("Enter");
    expect(engine.state.screen).toBe("howto");
    expect(engine.state.titleIndex).toBe(2);
    await tap("Escape");
    expect(engine.state.menuIndex).toBe(2);
    await tap("KeyW");
    await tap("Enter");
    expect(engine.state.mode).toBe("versus");
    await tap("KeyP");
    await tap("KeyS");
    await tap("KeyS");
    await tap("Enter");
    expect(engine.state.screen).toBe("title");
    expect(engine.state.menuIndex).toBe(1);
    engine.destroy();
  });
  it("moves both solo bindings, clamps actual velocity, and preserves driven velocity", async () => {
    const { engine, debug, key } = await setup();
    engine.apply((s) => debug.setScreen(s, "countdown"));
    key("ArrowDown");
    await engine.advance(1);
    expect(engine.state.paddles.left.cy).toBeCloseTo(
      C.FIELD_CY + C.PADDLE_SPEED * 0.01,
    );
    engine.apply((s) =>
      debug.setPaddleDriven(
        debug.setPaddleVy(
          debug.setPaddleCy(s, "left", C.PADDLE_MAX_CY),
          "left",
          900,
        ),
        "left",
        true,
      ),
    );
    await engine.advance(1);
    expect(engine.state.paddles.left.vy).toBe(0);
    expect(engine.state.paddles.left.drivenVy).toBe(900);
    engine.destroy();
  });
  it("curves flight and decays spin without changing speed", async () => {
    const { engine, debug, pose } = await setup();
    engine.apply((s) => debug.clearWorld(s));
    engine.apply((s) => debug.spawnBall(s));
    pose(200, 360, 520, 0, 600);
    await engine.advance(30);
    const ball = debug.snapshot(engine.state).ball!;
    expect(ball.vy).toBeGreaterThan(0);
    expect(ball.y).toBeGreaterThan(360);
    expect(ball.speed).toBeCloseTo(520, 5);
    expect(ball.spin).toBeCloseTo(600 * 2 ** (-0.3 / C.SPIN_HALFLIFE), 5);
    expect(
      ball.trail.every((p) => engine.state.simTime - p.t <= C.TRAIL_TIME),
    ).toBe(true);
    engine.destroy();
  });
  it.each(["left", "right"] as const)(
    "adds speed and signed paddle spin at the %s face",
    async (side) => {
      const { engine, debug, pose } = await setup();
      engine.apply((s) =>
        debug.setPaddleDriven(debug.setPaddleVy(s, side, -100), side, true),
      );
      pose(
        side === "left" ? C.P1_X1 + C.BALL_R + 1 : C.P2_X0 - C.BALL_R - 1,
        360,
        side === "left" ? -520 : 520,
        0,
      );
      const cues: string[] = [];
      engine.events.on("cue:played", (e) => cues.push(e.cue));
      await engine.advance(1);
      expect(debug.snapshot(engine.state).ball?.speed).toBeCloseTo(
        520 * C.SPEED_MULT,
        5,
      );
      expect(engine.state.ball!.spin).toBeLessThan(0);
      expect(Math.sign(engine.state.ball!.vx)).toBe(side === "left" ? 1 : -1);
      expect(cues).toEqual([C.CUES.paddleHit]);
      engine.destroy();
    },
  );
  it("resolves wall, end-cap and obstacle collisions with distinct cues", async () => {
    const { engine, pose } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    pose(250, C.BALL_R + 1, 0, -500);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBeGreaterThan(0);
    pose(C.P1_X0 + 8, C.FIELD_CY - C.PADDLE_HALF - C.BALL_R - 1, 0, 500);
    await engine.advance(1);
    expect(engine.state.ball!.vy).toBeLessThan(0);
    pose(C.OBSTACLES[0].x0 - C.BALL_R - 1, 220, 500, 0);
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeLessThan(0);
    expect(cues).toEqual([
      C.CUES.wallBounce,
      C.CUES.wallBounce,
      C.CUES.obstacleBounce,
    ]);
    engine.destroy();
  });
  it("scores only beyond the full ball, serves toward the receiver, and wins by two", async () => {
    const { engine, debug, pose } = await setup();
    engine.apply((s) => debug.setScore(s, 10, 10));
    pose(C.FIELD_W + C.BALL_R + 1, 360, 520, 0);
    await engine.advance(1);
    expect(engine.state.score).toEqual({ p1: 11, p2: 10 });
    expect(engine.state.screen).toBe("countdown");
    expect(engine.state.receiver).toBe("right");
    engine.apply((s) =>
      debug.setBallServeSign(debug.setBallHoldTimer(s, 0), -1),
    );
    await engine.advance(1);
    expect(engine.state.ball!.vx).toBeGreaterThan(0);
    expect(engine.state.ball!.vy).toBeLessThan(0);
    expect(engine.state.ball!.x).toBe(C.FIELD_CX);
    pose(C.FIELD_W + C.BALL_R + 1, 360, 520, 0);
    await engine.advance(1);
    expect(engine.state.screen).toBe("matchover");
    expect(engine.state.winner).toBe("left");
    await engine.advance(2);
    expect(engine.state.score.p1).toBe(12);
    engine.destroy();
  });
  it("gates the AI faculties independently", async () => {
    const { engine, debug, pose } = await setup();
    pose(900, 570, 520, 0);
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(C.AI_SPEED);
    engine.apply((s) => debug.setAiMovement(s, false));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    engine.apply((s) =>
      debug.setAiTracking(debug.setAiMovement(s, true), false),
    );
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(0);
    engine.apply((s) => debug.setPaddleCy(s, "right", 500));
    await engine.advance(1);
    expect(engine.state.paddles.right.vy).toBe(-C.AI_SPEED);
    engine.destroy();
  });
  it("poses the whole debug surface immutably and rejects missing entities", async () => {
    const { engine, debug } = await setup();
    const before = engine.state;
    engine.apply((s) =>
      debug.setMode(
        debug.setMenuIndex(
          debug.setTitleIndex(
            debug.setResumeScreen(
              debug.setWinner(debug.setReceiver(s, "right"), "right"),
              "countdown",
            ),
            1,
          ),
          2,
        ),
        "versus",
      ),
    );
    expect(before.screen).toBe("title");
    expect(before.mode).toBe("solo");
    engine.apply((s) => debug.clearWorld(s));
    expect(debug.snapshot(engine.state).obstacles).toEqual([]);
    expect(() => debug.setBallVelocity(engine.state, 2, 3)).toThrow();
    expect(() => debug.spawnObstacle(engine.state, 8)).toThrow();
    engine.apply((s) =>
      debug.spawnObstacle(debug.spawnObstacle(debug.spawnBall(s), 1), 0),
    );
    engine.apply((s) =>
      debug.drawBallServeSign(
        debug.setBallSpin(debug.setBallPosition(s, 4, 5), 23),
      ),
    );
    expect(debug.reconcile(engine.state)).toEqual(engine.state);
    expect(debug.menuItemRect(engine.state, 8)).toBeNull();
    engine.apply((s) => debug.setMuted(s, true));
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    engine.apply((s) => debug.reset(s));
    expect(engine.state.simTime).toBe(0);
    expect(engine.state.muted).toBe(true);
    engine.destroy();
  });
  it("confirms pointer gestures only when both edges occupy the same menu item", async () => {
    const { engine, debug, target } = await setup();
    const point = (type: string, i: number) => {
      const r = debug.menuItemRect(engine.state, i)!;
      const event = new Event(type);
      Object.assign(event, {
        clientX: r.x + 10,
        clientY: r.y + 10,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
      });
      target.dispatchEvent(event);
    };
    point("pointerdown", 0);
    await engine.advance(1);
    point("pointerup", 1);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    point("pointerdown", 1);
    point("pointerup", 1);
    await engine.advance(1);
    expect(engine.state.mode).toBe("versus");
    expect(engine.state.screen).toBe("countdown");
    engine.destroy();
  });
  it("agrees across 2ms and 16ms steps on a curved obstacle rally", async () => {
    const run = async (step: number) => {
      const { engine, debug, pose } = await setup(step);
      engine.apply((s) => debug.setPaddleDriven(s, "right", true));
      pose(300, 220, 520, 0, 160);
      await engine.advance(800 / step);
      const b = debug.snapshot(engine.state).ball!;
      engine.destroy();
      return b;
    };
    const a = await run(2),
      b = await run(16);
    expect(Math.abs(a.speed - b.speed)).toBeLessThan(10);
    expect(Math.sign(a.vx)).toBe(Math.sign(b.vx));
    expect(Math.sign(a.vy)).toBe(Math.sign(b.vy));
  });
});

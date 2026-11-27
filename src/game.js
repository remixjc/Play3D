import { items } from './economy.js';

export const court = {
  halfWidth: 6.55,
  farWall: -8.65,
  nearEdge: 8.35,
  paddleZ: 6.95,
  paddleWidth: 2.46,
  paddleDepth: 0.55,
  ballRadius: 0.19,
  brickWidth: 1.39,
  brickDepth: 0.89,
};

export const colors = {
  A: 0xff805b,
  V: 0xac89ff,
  C: 0x44d9ff,
  L: 0xbdf36b,
};

export const stages = [
  {
    name: '初光',
    speed: 11.3,
    rows: ['.AAAAAA.', 'AAVVVVAA', 'VVCCCCVV', '.CCLLCC.', '..LLLL..'],
  },
  {
    name: '双螺旋',
    speed: 13.8,
    rows: ['AA....LL', '.AA..LL.', '..AVLC..', '.VV..CC.', 'VV....CC', '.VV..CC.', '..VLCA..'],
  },
  {
    name: '色散核心',
    speed: 15.8,
    rows: ['AVCLLCVA', 'VC....CV', 'CL.VV.LC', 'CL.VV.LC', 'VC....CV', 'AVCLLCVA'],
  },
];

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const epsilon = 0.00001;

function makeBricks(stage) {
  return stage.rows.flatMap((row, rowIndex) => [...row].flatMap((type, column) => {
    if (type === '.') return [];
    return [{
      id: rowIndex * row.length + column,
      x: (column - (row.length - 1) / 2) * 1.55,
      z: -7.22 + rowIndex * 1.22,
      color: colors[type],
      active: true,
    }];
  }));
}

function sweepBox(ball, brick) {
  const halfWidth = court.brickWidth / 2 + court.ballRadius;
  const halfDepth = court.brickDepth / 2 + court.ballRadius;
  let enter = -Infinity;
  let exit = Infinity;
  let axis = 'z';

  for (const [position, velocity, center, half, dimension] of [
    [ball.x, ball.vx, brick.x, halfWidth, 'x'],
    [ball.z, ball.vz, brick.z, halfDepth, 'z'],
  ]) {
    if (Math.abs(velocity) < epsilon) {
      if (Math.abs(position - center) > half) return null;
      continue;
    }

    const edgeA = (center - half - position) / velocity;
    const edgeB = (center + half - position) / velocity;
    const first = Math.min(edgeA, edgeB);
    if (first > enter) {
      enter = first;
      axis = dimension;
    }
    exit = Math.min(exit, Math.max(edgeA, edgeB));
  }

  if (enter < -epsilon || exit < enter) return null;
  return { time: Math.max(0, enter), axis };
}

export class Game {
  constructor() {
    this.events = [];
    this.reset();
    this.state = 'menu';
  }

  reset() {
    this.events.length = 0;
    this.score = 0;
    this.lives = 3;
    this.level = 0;
    this.effects = { wide: 0, slow: 0, shield: 0 };
    this.loadStage();
  }

  loadStage() {
    this.stage = stages[this.level];
    this.bricks = makeBricks(this.stage);
    this.broken = 0;
    this.paddle = 0;
    this.prepareBall();
  }

  nextStage() {
    this.level += 1;
    this.loadStage();
  }

  prepareBall() {
    this.state = 'serve';
    this.combo = 0;
    this.ball = { x: this.paddle, z: court.paddleZ - 0.64, vx: 0, vz: 0 };
  }

  movePaddle(x) {
    if (this.state !== 'serve' && this.state !== 'playing') return;
    const limit = court.halfWidth - this.paddleWidth / 2 - 0.13;
    this.paddle = clamp(x, -limit, limit);
    if (this.state === 'serve') this.ball.x = this.paddle;
  }

  get paddleWidth() {
    return court.paddleWidth * (this.effects.wide ? 1.5 : 1);
  }

  canUseItem(id) {
    return Object.hasOwn(items, id) && (this.state === 'serve' || this.state === 'playing') && !this.effects[id];
  }

  useItem(id) {
    if (!this.canUseItem(id)) return false;
    this.effects[id] = items[id].seconds ?? 1;
    if (id === 'wide') this.movePaddle(this.paddle);
    return true;
  }

  launchDirection() {
    const angle = 0.23 - this.paddle * 0.045;
    return { x: Math.sin(angle), z: -Math.cos(angle) };
  }

  launch() {
    if (this.state !== 'serve') return;
    const direction = this.launchDirection();
    this.ball.vx = direction.x * this.stage.speed;
    this.ball.vz = direction.z * this.stage.speed;
    this.state = 'playing';
    this.events.push({ type: 'launch' });
  }

  togglePause() {
    if (this.state === 'playing' || this.state === 'serve') {
      this.pausedState = this.state;
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = this.pausedState;
    }
  }

  findCollision(limit) {
    const { ball } = this;
    let hit = null;
    let earliest = limit;
    const consider = (time, type, details) => {
      if (time < -epsilon || time > earliest) return;
      earliest = Math.max(0, time);
      hit = { time: earliest, type, ...details };
    };

    const side = court.halfWidth - court.ballRadius;
    if (ball.vx < 0) consider((-side - ball.x) / ball.vx, 'wall', { axis: 'x' });
    if (ball.vx > 0) consider((side - ball.x) / ball.vx, 'wall', { axis: 'x' });
    if (ball.vz < 0) {
      consider((court.farWall + court.ballRadius - ball.z) / ball.vz, 'wall', { axis: 'z' });
    } else if (ball.vz > 0) {
      const face = court.paddleZ - court.paddleDepth / 2 - court.ballRadius;
      const time = (face - ball.z) / ball.vz;
      const offset = ball.x + time * ball.vx - this.paddle;
      if (Math.abs(offset) <= this.paddleWidth / 2 + court.ballRadius) {
        consider(time, 'paddle', { offset });
      }
      consider((court.nearEdge + court.ballRadius - ball.z) / ball.vz, 'miss');
    }

    for (const brick of this.bricks) {
      if (!brick.active) continue;
      const collision = sweepBox(ball, brick);
      if (collision) consider(collision.time, 'brick', { axis: collision.axis, brick });
    }

    return hit;
  }

  step(dt) {
    if (this.state !== 'playing') return;
    let remaining = dt - Math.min(dt, this.effects.slow) * 0.35;
    for (let attempt = 0; attempt < 6 && remaining > epsilon; attempt += 1) {
      const hit = this.findCollision(remaining);
      const elapsed = hit ? hit.time : remaining;
      this.ball.x += this.ball.vx * elapsed;
      this.ball.z += this.ball.vz * elapsed;
      remaining -= elapsed;
      if (!hit) break;
      this.resolveCollision(hit);
      if (this.state !== 'playing') break;
    }
    this.effects.wide = Math.max(0, this.effects.wide - dt);
    this.effects.slow = Math.max(0, this.effects.slow - dt);
  }

  resolveCollision(hit) {
    const { ball } = this;
    if (hit.type === 'miss') {
      if (this.effects.shield) {
        this.effects.shield = 0;
        this.combo = 0;
        ball.vz *= -1;
        ball.z -= 0.001;
        this.events.push({ type: 'shield', x: ball.x, z: court.nearEdge });
        return;
      }
      this.lives -= 1;
      this.events.push({ type: 'miss', x: ball.x, z: court.nearEdge });
      if (this.lives === 0) {
        this.state = 'lost';
      } else {
        this.prepareBall();
      }
      return;
    }

    if (hit.type === 'paddle') {
      const angle = clamp(hit.offset / (this.paddleWidth / 2), -1, 1) * 1.06;
      const speed = Math.min(this.stage.speed + this.broken * 0.11, this.stage.speed + 4);
      ball.vx = Math.sin(angle) * speed;
      ball.vz = -Math.cos(angle) * speed;
      this.combo = 0;
    } else if (hit.axis === 'x') {
      ball.vx *= -1;
    } else {
      ball.vz *= -1;
    }

    // Only separate along the impact normal so a simultaneous corner hit can
    // still resolve on the other axis during the rest of this step.
    if (hit.axis === 'x') ball.x += Math.sign(ball.vx) * 0.001;
    else ball.z += Math.sign(ball.vz) * 0.001;

    if (hit.type === 'brick') {
      hit.brick.active = false;
      this.broken += 1;
      this.combo += 1;
      this.score += 100 * Math.min(this.combo, 5);
      this.events.push({ type: 'brick', brick: hit.brick, combo: this.combo });
      if (this.broken === this.bricks.length) {
        this.score += this.lives * 250;
        this.state = this.level === stages.length - 1 ? 'won' : 'cleared';
      }
    } else {
      this.events.push({ type: hit.type, x: ball.x, z: ball.z });
    }
  }
}

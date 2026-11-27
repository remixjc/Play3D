import assert from 'node:assert/strict';
import test from 'node:test';
import { Wallet, dailyReward } from '../src/economy.js';
import { Game, court } from '../src/game.js';

function walletStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test('daily points are granted once per local day and shared by wallets on the same origin', async () => {
  const storage = walletStorage();
  const first = new Wallet({ storage });
  const second = new Wallet({ storage });
  const day = new Date(2026, 10, 27, 13);
  assert.deepEqual(await Promise.all([first.claim(day), second.claim(day)]), [true, false]);
  assert.equal(await second.claim(new Date(2026, 10, 26, 13)), false);
  assert.equal(await second.claim(new Date(2026, 10, 28, 13)), true);
  assert.equal(first.snapshot().points, dailyReward * 2);
});

test('an item can only be exchanged with enough points and is spent only on activation', async () => {
  const wallet = new Wallet({ storage: walletStorage() });
  const game = new Game();
  assert.equal(await wallet.redeem('wide'), false);
  await wallet.claim();
  assert.equal(await wallet.redeem('wide'), true);
  assert.equal(wallet.snapshot().points, dailyReward - 45);
  assert.equal(await wallet.use('wide', () => game.useItem('wide')), false);
  assert.equal(wallet.snapshot().stock.wide, 1);
  game.reset();
  assert.equal(await wallet.use('wide', () => game.useItem('wide')), true);
  assert.equal(wallet.snapshot().stock.wide, 0);
  assert.equal(game.paddleWidth, court.paddleWidth * 1.5);
  assert.equal(game.useItem('wide'), false);
});

test('timed effects countdown in play only and slow affects ball movement', () => {
  const game = new Game();
  game.reset();
  assert.equal(game.useItem('slow'), true);
  game.step(0.2);
  assert.equal(game.effects.slow, 10);
  game.launch();
  const distance = game.ball.vz * 0.2;
  const start = game.ball.z;
  game.step(0.2);
  assert.equal(game.effects.slow, 9.8);
  assert.ok(Math.abs(game.ball.z - start - distance * 0.65) < 0.000001);
  game.togglePause();
  game.step(1);
  assert.equal(game.effects.slow, 9.8);
});

test('a shield reflects one miss, then the next miss drops a ball', () => {
  const game = new Game();
  game.reset();
  game.useItem('shield');
  game.launch();
  const miss = () => {
    game.ball = { x: 3, z: court.nearEdge, vx: 0, vz: 20 };
    game.step(0.02);
  };
  miss();
  assert.equal(game.lives, 3);
  assert.ok(game.ball.vz < 0);
  assert.equal(game.effects.shield, 0);
  miss();
  assert.equal(game.lives, 2);
  assert.equal(game.state, 'serve');
});

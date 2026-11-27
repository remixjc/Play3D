import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './style.css';
import { itemIds } from './economy.js';
import { Game, stages } from './game.js';
import { ItemPanel } from './item-panel.js';
import { CourtView } from './scene.js';

const element = id => document.getElementById(id);
const arena = element('arena');
const primary = element('primary');
const restart = element('restart');
const soundButton = element('sound-button');
const helpButton = element('help-button');
const helpDialog = element('help-dialog');
const result = element('result');
const resultButton = element('result-button');
const progress = element('level-progress');
const status = element('status');
const lifeIcons = [...element('lives-icons').children];
const comboLabel = element('combo');
const playIcon = primary.querySelector('.play-icon');
const countdown = element('countdown');
const countdownDigit = element('countdown-digit');
const countdownLength = 3000;

const states = {
  menu: { button: '开始游戏', status: '待开局' },
  serve: { button: '立即发球', status: '即将自动发球' },
  playing: { button: '暂停游戏', status: '对局中' },
  paused: { button: '继续游戏', status: '已暂停', title: '游戏暂停', description: '准备好后继续这局。' },
  cleared: { button: '下一关', status: '关卡通过', title: '关卡通过' },
  lost: { button: '再玩一局', status: '本局结束', title: '本局结束' },
  won: { button: '再玩一局', status: '全部通关', title: '全部通关' },
  unavailable: { button: '暂不可玩', status: '无法启动', title: '球场无法启动', description: '请在支持 WebGL 2 且开启硬件加速的浏览器中打开。' },
};

const scoreText = score => String(score).padStart(5, '0');

function readSetting(key) {
  try {
    return localStorage.getItem(`prism-break:${key}`);
  } catch {
    return null;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(`prism-break:${key}`, String(value));
  } catch {
    // The current session remains playable if storage is unavailable.
  }
}

class Sound {
  constructor() {
    this.enabled = readSetting('sound') === 'true';
  }

  async unlock() {
    if (!this.enabled) return;
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    if (!Audio) return;
    this.context ??= new Audio();
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {
        return;
      }
    }
  }

  play(type, combo = 1) {
    const context = this.context;
    if (!this.enabled || context?.state !== 'running') return;
    const tones = {
      launch: [330, 520, .11, .065],
      count: [310, 340, .085, .048],
      brick: [420 + combo * 62, 700 + combo * 88, .15, .099],
      paddle: [270, 155, .086, .075],
      wall: [165, 110, .043, .032],
      miss: [210, 65, .31, .088],
      shield: [460, 970, .28, .087],
      item: [355, 630, .13, .053],
      cleared: [440, 880, .42, .089],
    };
    const [start, end, length, volume] = tones[type];
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type === 'brick' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + length);
    gain.gain.setValueAtTime(.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .012);
    gain.gain.exponentialRampToValueAtTime(.001, now + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + length);
  }
}

const game = new Game();
const sound = new Sound();
const pressed = new Set();
let best = Math.max(0, Number(readSetting('best')) || 0);
let view;
let renderedState;
let needsDraw = true;
let comboUntil = 0;
let serveRemaining = countdownLength;
let serveDeadline = null;
let visibleDigit = null;
const itemPanel = new ItemPanel(game, () => {
  needsDraw = true;
  sound.play('item');
  if (game.state === 'serve' || game.state === 'playing') arena.focus({ preventScroll: true });
});

function resetCountdown() {
  serveRemaining = countdownLength;
  serveDeadline = null;
}

function renderCountdown(now) {
  const digit = serveDeadline === null ? null : Math.max(1, Math.ceil((serveDeadline - now) / 1000));
  if (digit === visibleDigit) return;
  visibleDigit = digit;
  countdown.hidden = digit === null;
  if (digit !== null) {
    countdownDigit.textContent = digit;
    sound.play('count');
  }
}

function updateHUD(now = performance.now()) {
  if (game.score > best) {
    best = game.score;
    writeSetting('best', best);
  }

  const state = states[game.state];
  if (game.state === 'serve') {
    serveDeadline ??= now + serveRemaining;
  } else if (serveDeadline !== null) {
    serveRemaining = Math.max(0, serveDeadline - now);
    serveDeadline = null;
  }
  renderCountdown(now);
  itemPanel.updateQuick();
  element('score').textContent = scoreText(game.score);
  element('best').textContent = scoreText(best);
  element('level').textContent = String(game.level + 1).padStart(2, '0');
  element('lives').textContent = game.lives;
  lifeIcons.forEach((icon, index) => icon.classList.toggle('spent', index >= game.lives));
  element('stage-name').textContent = game.stage.name;
  progress.max = game.bricks.length;
  progress.value = game.broken;
  element('progress-count').textContent = `${game.broken} / ${game.bricks.length}`;
  element('primary-label').textContent = state.button;
  primary.hidden = Boolean(state.title);
  playIcon.classList.toggle('pause', game.state === 'playing');
  restart.hidden = game.state === 'menu' || game.state === 'unavailable';
  if (game.state !== renderedState) {
    status.textContent = state.status;
    status.dataset.state = game.state;
  }

  result.hidden = !state.title;
  if (state.title) {
    let description = state.description;
    if (game.state === 'cleared') {
      description = `下一关 ${stages[game.level + 1].name} · 当前分数 ${game.score}`;
    } else if (!description) {
      description = `本局得分 ${game.score} · 本机最高分 ${best}`;
    }
    element('result-title').textContent = state.title;
    element('result-description').textContent = description;
    resultButton.textContent = state.button;
    resultButton.hidden = game.state === 'unavailable';
  }

  if (game.state !== renderedState) {
    if (['cleared', 'lost', 'won'].includes(game.state)) resultButton.focus({ preventScroll: true });
    if (['serve', 'playing'].includes(game.state) && document.activeElement === resultButton) {
      arena.focus({ preventScroll: true });
    }
    renderedState = game.state;
  }
  needsDraw = true;
}

function loadLevel(next = false) {
  if (next) game.nextStage();
  else game.reset();
  view.load(game);
  resetCountdown();
  comboLabel.textContent = '';
  comboUntil = 0;
}

function togglePause() {
  game.togglePause();
  pressed.clear();
  updateHUD();
  if (game.state === 'paused') resultButton.focus({ preventScroll: true });
  else arena.focus({ preventScroll: true });
}

function activate() {
  if (!view || game.state === 'unavailable' || helpDialog.open || itemPanel.dialog.open) return;
  void sound.unlock();

  switch (game.state) {
    case 'menu':
    case 'lost':
    case 'won':
      loadLevel();
      break;
    case 'cleared':
      loadLevel(true);
      break;
    case 'serve':
      game.launch();
      break;
    case 'playing':
    case 'paused':
      togglePause();
      return;
  }
  updateHUD();
  arena.focus({ preventScroll: true });
}

function pauseForDialog() {
  if (game.state === 'playing' || game.state === 'serve') {
    game.togglePause();
    updateHUD();
  }
  pressed.clear();
}

primary.addEventListener('click', activate);
resultButton.addEventListener('click', activate);
restart.addEventListener('click', () => {
  if (!view || game.state === 'unavailable') return;
  void sound.unlock();
  pressed.clear();
  loadLevel();
  updateHUD();
  arena.focus({ preventScroll: true });
});
helpButton.addEventListener('click', () => {
  pauseForDialog();
  helpDialog.showModal();
});
for (const id of ['settings-button', 'shop-shortcut']) {
  element(id).addEventListener('click', () => {
    pauseForDialog();
    itemPanel.open();
  });
}
soundButton.setAttribute('aria-pressed', String(sound.enabled));
soundButton.addEventListener('click', async () => {
  sound.enabled = !sound.enabled;
  soundButton.setAttribute('aria-pressed', String(sound.enabled));
  writeSetting('sound', sound.enabled);
  await sound.unlock();
  sound.play('paddle');
});

const arrows = new Set(['ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', event => {
  if (!view || helpDialog.open || itemPanel.dialog.open || game.state === 'unavailable' || event.altKey || event.metaKey || event.ctrlKey) return;
  if (arrows.has(event.key) && ['serve', 'playing'].includes(game.state)) {
    event.preventDefault();
    pressed.add(event.key);
  }
  if (event.code === 'Space' && game.state !== 'playing' && !event.target.closest('button')) {
    event.preventDefault();
    if (!event.repeat) activate();
  }
  if (event.key === 'Escape' && ['paused', 'playing', 'serve'].includes(game.state)) {
    event.preventDefault();
    if (!event.repeat) togglePause();
  }
  const item = { '1': itemIds[0], '2': itemIds[1], '3': itemIds[2] }[event.key];
  if (item && game.canUseItem(item) && !event.repeat) {
    event.preventDefault();
    void itemPanel.use(item);
  }
});
window.addEventListener('keyup', event => pressed.delete(event.key));
window.addEventListener('blur', () => pressed.clear());

let pointerId = null;
function movePointer(event) {
  if (!view || !['serve', 'playing'].includes(game.state)) return;
  game.movePaddle(view.pointerX(event.clientX));
  needsDraw = true;
}

arena.addEventListener('pointerdown', event => {
  if (!['serve', 'playing'].includes(game.state) || event.target.closest('button')) return;
  if (event.pointerType !== 'mouse') {
    pointerId = event.pointerId;
    arena.setPointerCapture(pointerId);
  }
  movePointer(event);
});
arena.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' || event.pointerId === pointerId) movePointer(event);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  arena.addEventListener(name, event => {
    if (event.pointerId === pointerId) pointerId = null;
  });
}

document.addEventListener('visibilitychange', () => {
  pressed.clear();
  if (document.hidden && (game.state === 'playing' || game.state === 'serve')) {
    game.togglePause();
    updateHUD();
  }
});

function applyEvents(now) {
  let changed = false;
  let bricks = 0;
  for (const event of game.events) {
    sound.play(event.type, event.combo);
    if (event.type === 'brick') {
      view.hit(event.brick, event.combo);
      bricks += 1;
      if (event.combo > 1) {
        comboUntil = now + 790;
        comboLabel.textContent = `${event.combo} 连击`;
      }
      changed = true;
    } else if (event.type === 'paddle' || event.type === 'miss' || event.type === 'shield') {
      const color = { miss: 0xff8a6d, shield: 0xffce69 }[event.type];
      view.pulse(event.x, event.z, color, event.type === 'shield' ? 1.7 : undefined);
      if (event.type === 'miss') resetCountdown();
      changed = true;
    }
  }
  game.events.length = 0;
  if (bricks) void itemPanel.earn(bricks);
  if (comboUntil && now >= comboUntil) {
    comboLabel.textContent = '';
    comboUntil = 0;
  }
  if (changed || renderedState !== game.state) {
    if (game.state === 'cleared' || game.state === 'won') sound.play('cleared');
    updateHUD(now);
  }
}

let previous = performance.now();
let accumulator = 0;
const timeStep = 1 / 120;

function frame(now) {
  const elapsed = Math.min((now - previous) / 1000, .085);
  previous = now;
  const direction = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'));
  if (direction && (game.state === 'serve' || game.state === 'playing')) {
    game.movePaddle(game.paddle + direction * elapsed * 19);
    needsDraw = true;
  }

  const autoLaunch = serveDeadline !== null && now >= serveDeadline;
  if (autoLaunch) {
    game.launch();
    accumulator = 0;
  } else if (game.state === 'playing') {
    accumulator += elapsed;
    while (accumulator >= timeStep) {
      game.step(timeStep);
      accumulator -= timeStep;
    }
  } else {
    accumulator = 0;
  }

  applyEvents(now);
  if (game.state === 'serve') renderCountdown(now);
  if (game.state === 'playing') itemPanel.updateQuick();
  if (game.state !== 'unavailable' && (needsDraw || view.dirty || game.state === 'playing' || view.hasEffects)) {
    view.draw(game, elapsed);
    needsDraw = false;
  }
  requestAnimationFrame(frame);
}

try {
  view = new CourtView(arena);
  view.load(game);
  view.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    if (game.state === 'playing' || game.state === 'serve') game.togglePause();
    updateHUD();
  });
  view.renderer.domElement.addEventListener('webglcontextrestored', () => {
    needsDraw = true;
  });
  requestAnimationFrame(frame);
} catch (error) {
  console.error('Unable to initialize the 3D court.', error);
  game.state = 'unavailable';
}
updateHUD();

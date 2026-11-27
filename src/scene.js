import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { colors, court } from './game.js';

const colorEntries = Object.values(colors);
const ice = 0x65f5db;
const deckWidth = court.halfWidth * 2;
const deckLength = court.nearEdge - court.farWall;
const deckCenter = (court.farWall + court.nearEdge) / 2;

function flat(color) {
  return new THREE.MeshBasicMaterial({ color });
}

function metal(color, roughness = 0.48) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.35 });
}

function lightMaterial(color, intensity) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    toneMapped: false,
  });
}

function model(parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function box(parent, material, x, y, z, width, height, length) {
  return model(parent, new THREE.BoxGeometry(width, height, length), material, x, y, z);
}

function texture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const result = new THREE.CanvasTexture(canvas);
  result.colorSpace = THREE.SRGBColorSpace;
  return result;
}

function createDeckMap() {
  return texture(768, 1024, (ctx, width, height) => {
    const backdrop = ctx.createLinearGradient(0, 0, width * 0.52, height);
    backdrop.addColorStop(0, '#222b55');
    backdrop.addColorStop(0.5, '#152540');
    backdrop.addColorStop(1, '#132c3a');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    const light = ctx.createRadialGradient(width * .5, height * .5, 0, width * .5, height * .5, height * .67);
    light.addColorStop(0, '#536e9355');
    light.addColorStop(1, '#0000001a');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#829bc437';
    ctx.beginPath();
    for (let x = 0; x <= width; x += width / 14) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += height / 18) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#8ca5ca76';
    ctx.setLineDash([7, 9]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#6cecc338';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, height * .913);
    ctx.lineTo(width, height * .913);
    ctx.stroke();

    ctx.translate(width / 2, height * .63);
    ctx.strokeStyle = '#9ab4dc37';
    ctx.lineWidth = 2;
    for (const radius of [48, 64, 90]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0.16, Math.PI - .16);
      ctx.arc(0, 0, radius, Math.PI + .16, Math.PI * 2 - .16);
      ctx.stroke();
    }
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-23, -23, 46, 46);
    ctx.strokeRect(-11, -11, 22, 22);
  });
}

function createDeck(scene) {
  const deck = new THREE.Group();
  scene.add(deck);
  const frame = metal(0x3e506c);
  const inlay = metal(0x202a43);
  const shell = metal(0x394d69);
  const faded = flat(0x325575);
  const bright = lightMaterial(ice, 1.39);
  const warm = lightMaterial(0xff8a6d, 1.3);

  box(deck, shell, 0, -.34, deckCenter, deckWidth + .92, .58, deckLength + .86);
  box(deck, inlay, 0, -.67, deckCenter, deckWidth + .43, .22, deckLength + .49);
  const map = createDeckMap();
  map.anisotropy = 4;
  const floor = model(deck, new THREE.PlaneGeometry(deckWidth, deckLength), new THREE.MeshBasicMaterial({ map }), 0, -.029, deckCenter);
  floor.rotation.x = -Math.PI / 2;

  for (const side of [-1, 1]) {
    const edge = side * (court.halfWidth + .13);
    box(deck, frame, edge, .047, deckCenter, .25, .2, deckLength + .12);
    box(deck, inlay, edge + side * .15, -.04, deckCenter, .12, .14, deckLength + .15);
    box(deck, faded, edge, .157, deckCenter, .035, .024, deckLength - .32);
    for (const z of [court.farWall + .78, deckCenter, court.nearEdge - .78]) {
      box(deck, bright, edge, .175, z, .052, .032, 1.2);
    }
    for (const z of [-6, -3, 0, 3, 6]) {
      box(deck, faded, edge + side * .28, -.052, z, .16, .11, .36);
    }
  }

  box(deck, frame, 0, .06, court.farWall - .14, deckWidth + .47, .23, .30);
  box(deck, faded, 0, .18, court.farWall - .13, deckWidth - 2.05, .024, .045);
  box(deck, bright, 0, .176, court.farWall - .135, 2.7, .035, .065);
  box(deck, frame, 0, -.183, court.nearEdge + .04, deckWidth + .42, .247, .21);

  for (const side of [-1, 1]) {
    for (const z of [court.farWall - .16, court.nearEdge + .04]) {
      box(deck, frame, side * 6.74, -.025, z, .52, .41, .50);
      box(deck, bright, side * 6.74, .193, z, .34, .024, .115);
    }
    for (let index = 0; index < 5; index += 1) {
      box(deck, warm, side * (0.2 + index * .28), -.20, court.nearEdge + .17, .13, .044, .04);
    }
  }
}

function createBackground(scene) {
  const background = texture(256, 256, (ctx, width, height) => {
    const glow = ctx.createRadialGradient(width * .5, height * .5, 0, width * .5, height * .5, width * .49);
    glow.addColorStop(0, '#23395d');
    glow.addColorStop(.46, '#172641');
    glow.addColorStop(1, '#090e1a');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  });
  const plane = model(scene, new THREE.PlaneGeometry(64, 58), new THREE.MeshBasicMaterial({ map: background }), 0, -1.37, -1);
  plane.rotation.x = -Math.PI / 2;

  const positions = [];
  let seed = 45230;
  const rand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 200; index += 1) {
    positions.push((rand() - .5) * 44, -.98 + rand() * .24, (rand() - .56) * 37);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0x7795bd, size: .043, transparent: true, opacity: .51,
  })));
}

function createGlowMap() {
  return texture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(.24, '#ffffffa9');
    gradient.addColorStop(.55, '#ffffff35');
    gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
}

export class CourtView {
  constructor(mount) {
    this.mount = mount;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090e1a);
    this.camera = new THREE.PerspectiveCamera(41, 1, .2, 100);
    this.camera.position.set(0, 15.8, 19.4);
    this.camera.lookAt(0, 0, -1.2);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .57, .72, .86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const fill = new THREE.HemisphereLight(0xd9ecff, 0x56658c, 2.13);
    this.scene.add(fill);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-6, 12, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x83baff, 1.4);
    rim.position.set(6, 4, -12);
    this.scene.add(rim);

    this.glowMap = createGlowMap();
    this.fragments = [];
    this.pulses = [];
    this.trailPoints = [];
    this.brickMeshes = new Map();
    this.shake = 0;
    this.flash = 0;
    this.time = 0;

    createBackground(this.scene);
    createDeck(this.scene);
    this.createActors();
    const resize = new ResizeObserver(() => this.resize());
    resize.observe(mount);
    this.resize();
  }

  createActors() {
    const { paddleWidth, paddleDepth, ballRadius, paddleZ } = court;
    this.paddle = new THREE.Group();
    this.paddle.position.z = paddleZ;
    this.scene.add(this.paddle);
    model(this.paddle, new RoundedBoxGeometry(paddleWidth, .36, paddleDepth, 3, .075), metal(0x208e8f, .29), 0, .20, 0);
    box(this.paddle, lightMaterial(0x78ffe4, 1.9), 0, .363, -.06, paddleWidth - .23, .042, .13);
    for (const side of [-1, 1]) {
      box(this.paddle, lightMaterial(0xe3fff6, 1.35), side * 1.02, .365, .115, .13, .045, .17);
    }

    this.ball = new THREE.Group();
    this.scene.add(this.ball);
    model(this.ball, new THREE.SphereGeometry(ballRadius, 18, 12), lightMaterial(0xf2fff7, 2.1), 0, 0, 0);
    this.ballGlow = this.glow(0x78f5e4, 1.2, .62);
    this.ball.add(this.ballGlow);
    this.shield = box(this.scene, lightMaterial(0xffce69, 2.5), 0, .14, court.nearEdge, deckWidth - .12, .032, .063);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(.89, .89), new THREE.MeshBasicMaterial({
      color: 0x030611, alphaMap: this.glowMap, transparent: true, opacity: .74, depthWrite: false,
    }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    this.aim = new THREE.Group();
    this.scene.add(this.aim);
    const dot = new THREE.SphereGeometry(.035, 6, 4);
    const dotMaterial = lightMaterial(0xc4fa73, 1.25);
    for (let index = 0; index < 13; index += 1) {
      model(this.aim, dot, dotMaterial, 0, .067, 0);
    }

    this.trail = Array.from({ length: 14 }, () => {
      const sprite = this.glow(0x5eeeda, .55, 0);
      this.scene.add(sprite);
      return sprite;
    });

    this.brickGeometry = new RoundedBoxGeometry(court.brickWidth, .47, court.brickDepth, 3, .095);
    this.stripeGeometry = new RoundedBoxGeometry(court.brickWidth - .22, .038, .062, 2, .014);
    this.brickStyles = new Map(colorEntries.map(color => [
      color,
      {
        body: new THREE.MeshStandardMaterial({
          color, roughness: .32, metalness: .16, emissive: color, emissiveIntensity: .14,
        }),
        led: lightMaterial(color, 1.5),
        shard: lightMaterial(color, 1.22),
      },
    ]));
    this.shard = new THREE.TetrahedronGeometry(1);
    this.ring = new THREE.RingGeometry(.88, 1, 40);
  }

  glow(color, size, opacity) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowMap, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  resize() {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (!width || !height) return;

    const ratio = Math.min(devicePixelRatio, width < 540 ? 1.35 : 1.6);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    const corners = [];
    for (const x of [-7.28, 7.28]) {
      for (const z of [-9.27, 9.04]) {
        for (const y of [-.7, .63]) {
          corners.push(new THREE.Vector3(x, y, z).project(this.camera));
        }
      }
    }
    const left = Math.min(...corners.map(point => point.x));
    const right = Math.max(...corners.map(point => point.x));
    const bottom = Math.min(...corners.map(point => point.y));
    const top = Math.max(...corners.map(point => point.y));
    const horizontalRoom = width < 600 ? 1.92 : 1.82;
    const zoom = Math.min(horizontalRoom / (right - left), 1.69 / (top - bottom));
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.camera.projectionMatrix.elements[8] += (left + right) * zoom / 2;
    this.camera.projectionMatrix.elements[9] += (bottom + top) * zoom / 2;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.dirty = true;
  }

  get hasEffects() {
    return this.fragments.length > 0 || this.pulses.length > 0 || this.shake > 0 || this.flash > 0;
  }

  pointerX(clientX) {
    const rect = this.mount.getBoundingClientRect();
    const edge = new THREE.Vector3(court.halfWidth, .25, court.paddleZ).project(this.camera).x;
    return ((clientX - rect.left) / rect.width * 2 - 1) / edge * court.halfWidth;
  }

  load(game) {
    for (const group of this.brickMeshes.values()) group.removeFromParent();
    for (const item of this.fragments) item.mesh.removeFromParent();
    for (const pulse of this.pulses) {
      pulse.mesh.removeFromParent();
      pulse.mesh.material.dispose();
    }
    this.brickMeshes.clear();
    this.trailPoints.length = 0;
    this.fragments.length = 0;
    this.pulses.length = 0;
    this.shake = 0;
    this.flash = 0;

    for (const brick of game.bricks) {
      const materials = this.brickStyles.get(brick.color);
      const group = new THREE.Group();
      group.position.set(brick.x, .25, brick.z);
      model(group, this.brickGeometry, materials.body, 0, 0, 0);
      model(group, this.stripeGeometry, materials.led, 0, .223, .32);
      this.brickMeshes.set(brick.id, group);
      this.scene.add(group);
    }
  }

  hit(brick, combo) {
    this.brickMeshes.get(brick.id).visible = false;
    const count = this.reducedMotion.matches ? 5 : 13;
    const material = this.brickStyles.get(brick.color).shard;
    for (let index = 0; index < count; index += 1) {
      const direction = index * Math.PI * 2 / count;
      const speed = 1.55 + Math.random() * 2.9;
      const mesh = model(this.scene, this.shard, material, brick.x, .4, brick.z);
      const size = .047 + Math.random() * .09;
      mesh.scale.set(size, size * 1.17, size * .7);
      mesh.rotation.set(direction, direction * .62, 0);
      this.fragments.push({
        mesh, size, life: .37 + Math.random() * .34, age: 0,
        vx: Math.cos(direction) * speed, vy: 1.8 + Math.random() * 3.1, vz: Math.sin(direction) * speed,
      });
    }
    this.pulse(brick.x, brick.z, brick.color, combo >= 3 ? 1.6 : 1.12);
    this.shake = this.reducedMotion.matches ? 0 : Math.min(.021 + combo * .009, .064);
    this.flash = this.reducedMotion.matches ? 0 : .12;
  }

  pulse(x, z, color = ice, size = .8) {
    const ring = model(this.scene, this.ring, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .73, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }), x, .022, z);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(.12);
    this.pulses.push({ mesh: ring, age: 0, size });
  }

  updateEffects(dt) {
    for (let index = this.fragments.length - 1; index >= 0; index -= 1) {
      const piece = this.fragments[index];
      piece.age += dt;
      if (piece.age >= piece.life) {
        piece.mesh.removeFromParent();
        this.fragments.splice(index, 1);
        continue;
      }
      piece.vy -= dt * 11;
      piece.mesh.position.x += dt * piece.vx;
      piece.mesh.position.y = Math.max(.02, piece.mesh.position.y + dt * piece.vy);
      piece.mesh.position.z += dt * piece.vz;
      piece.mesh.rotation.x += dt * 8;
      piece.mesh.rotation.y += dt * 5;
      piece.mesh.scale.setScalar(piece.size * (1 - piece.age / piece.life));
    }

    for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.pulses[index];
      pulse.age += dt * 3.3;
      if (pulse.age >= 1) {
        pulse.mesh.removeFromParent();
        pulse.mesh.material.dispose();
        this.pulses.splice(index, 1);
        continue;
      }
      pulse.mesh.scale.setScalar(.12 + pulse.size * (1 - (1 - pulse.age) ** 2));
      pulse.mesh.material.opacity = (1 - pulse.age) * .66;
    }
  }

  draw(game, dt) {
    this.dirty = false;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * .35);
    this.flash = Math.max(0, this.flash - dt * .9);
    this.camera.position.x = Math.sin(this.time * 116) * this.shake;
    this.bloom.strength = (this.reducedMotion.matches ? .43 : .57) + this.flash;
    this.updateEffects(dt);

    const alive = game.state === 'playing' || (game.state === 'paused' && game.pausedState === 'playing');
    const ready = game.state === 'serve' || game.state === 'menu' || (game.state === 'paused' && game.pausedState === 'serve');
    this.paddle.position.x = game.paddle;
    this.paddle.scale.x = game.paddleWidth / court.paddleWidth;
    this.shield.visible = Boolean(game.effects.shield);
    this.ballGlow.material.color.setHex(game.effects.slow ? 0xb69bff : 0x78f5e4);
    this.ball.visible = alive || ready;
    this.ball.position.set(game.ball.x, .28, game.ball.z);
    this.shadow.visible = this.ball.visible;
    this.shadow.position.set(game.ball.x, .013, game.ball.z);
    this.aim.visible = ready;
    if (ready) {
      const direction = game.launchDirection();
      this.aim.children.forEach((point, index) => {
        const distance = .55 + index * .35;
        point.position.x = game.ball.x + direction.x * distance;
        point.position.z = game.ball.z + direction.z * distance;
        point.scale.setScalar(1.18 - index * .047);
      });
    }

    if (!alive) {
      this.trailPoints.length = 0;
    } else if (dt && game.state === 'playing') {
      this.trailPoints.unshift({ x: game.ball.x, z: game.ball.z });
      if (this.trailPoints.length > this.trail.length) this.trailPoints.pop();
    }
    const trailLength = this.reducedMotion.matches ? 4 : this.trail.length;
    this.trail.forEach((sprite, index) => {
      const point = this.trailPoints[index];
      sprite.visible = Boolean(point) && index < trailLength;
      if (sprite.visible) {
        const strength = 1 - index / trailLength;
        sprite.position.set(point.x, .24, point.z);
        sprite.scale.setScalar(.13 + strength * .33);
        sprite.material.opacity = strength * .75;
      }
    });

    this.composer.render();
  }
}

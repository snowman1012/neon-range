const canvas = document.querySelector('#view');
const ctx = canvas.getContext('2d');
const $ = s => document.querySelector(s);

let W, H, dpr = 1, mode = 'boards', score = 0, shots = 0, hits = 0, headshots = 0;
let ammo = 12, reloading = false, running = false, sens = 1, last = 0, recoil = 0, muzzle = 0;
let moveX = 0, moveY = 0, bob = 0, bobAmount = 0;
const keys = {}, targets = [], particles = [];
const player = { x: 0, z: 1, yaw: 0, pitch: 0 };

function resize() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize); resize();

function world(x, y, z) {
  const dx = x - player.x, dz = z - player.z;
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  const rx = dx * cy - dz * sy, rz = dx * sy + dz * cy;
  if (rz < .12) return null;
  const f = Math.min(W, H) * .96;
  return { x: W / 2 + rx / rz * f, y: H / 2 - (y - 1.62) / rz * f - player.pitch * f, z: rz, s: f / rz };
}

function polygon(points, fill, stroke, width = 1) {
  if (!points.length) return;
  ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function quad3(points, fill, stroke) {
  const p = points.map(v => world(...v));
  if (p.some(v => !v)) return;
  polygon(p.map(v => [v.x, v.y]), fill, stroke);
}

function line3(a, b, color, width = 1) {
  const p = world(...a), q = world(...b); if (!p || !q) return;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
}

function resetTargets() {
  targets.length = 0;
  [-5.4, -2.7, 0, 2.7, 5.4].forEach((x, i) => targets.push({
    x, base: x, z: 12 + (i % 2) * 3.8, w: mode === 'boards' ? .78 : .65,
    h: mode === 'boards' ? 1.5 : 1.82, alive: true, t: i * 1.35, respawn: 0
  }));
}

function renderRange() {
  const horizon = H / 2 - player.pitch * Math.min(W, H) * .96;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#111820'); sky.addColorStop(1, '#56626b');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, Math.max(0, horizon));
  const floor = ctx.createLinearGradient(0, horizon, 0, H);
  floor.addColorStop(0, '#343b40'); floor.addColorStop(1, '#11161a');
  ctx.fillStyle = floor; ctx.fillRect(0, horizon, W, H - horizon);

  quad3([[-12, 0, 1], [-12, 5, 1], [-12, 5, 34], [-12, 0, 34]], '#283139', '#3e4a53');
  quad3([[12, 0, 1], [12, 0, 34], [12, 5, 34], [12, 5, 1]], '#252e35', '#3e4a53');
  quad3([[-12, 5, 1], [12, 5, 1], [12, 5, 34], [-12, 5, 34]], '#171d22');
  quad3([[-12, 0, 32], [-12, 5, 32], [12, 5, 32], [12, 0, 32]], '#20282e');

  for (let z = 2; z <= 32; z += 2) line3([-12, 0, z], [12, 0, z], z % 4 ? '#94a4aa18' : '#a9bcc526');
  for (let x = -12; x <= 12; x += 1.5) line3([x, 0, 1], [x, 0, 32], '#b7c8cf18');
  [-8, -4, 0, 4, 8].forEach(x => line3([x, .012, 2], [x, .012, 32], '#dfe9ed36', 1.5));
  [-9, 9].forEach(x => { for (let z = 5; z < 32; z += 7) quad3([[x - .18, 0, z], [x + .18, 0, z], [x + .18, 4.8, z], [x - .18, 4.8, z]], '#46525a'); });
  for (let z = 5; z < 32; z += 7) {
    quad3([[-4.5, 4.94, z - .15], [4.5, 4.94, z - .15], [4.5, 4.94, z + .15], [-4.5, 4.94, z + .15]], '#dce9e9');
    const l = world(0, 4.82, z); if (l) { const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 130 / Math.max(1, l.z / 5)); glow.addColorStop(0, '#dffaff32'); glow.addColorStop(1, '#dffaff00'); ctx.fillStyle = glow; ctx.fillRect(l.x - 150, l.y - 90, 300, 180); }
  }
  quad3([[-3.8, .02, 7], [3.8, .02, 7], [3.1, .02, 9.8], [-3.1, .02, 9.8]], '#ffffff09');
}

function renderTarget(t) {
  if (!t.alive) return;
  const foot = world(t.x, 0, t.z), head = world(t.x, t.h, t.z); if (!foot || !head) return;
  const h = foot.y - head.y, w = t.w * foot.s; t.screen = { x: foot.x, y: head.y, w, h };
  ctx.save(); ctx.globalAlpha = Math.max(.35, Math.min(1, 20 / t.z));
  ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(foot.x, foot.y + 3, w * .7, w * .18, 0, 0, Math.PI * 2); ctx.fill();
  if (mode === 'boards') {
    ctx.strokeStyle = '#172026'; ctx.lineWidth = Math.max(3, w * .08);
    ctx.beginPath(); ctx.moveTo(foot.x - w * .38, foot.y); ctx.lineTo(foot.x, foot.y - h * .3); ctx.lineTo(foot.x + w * .38, foot.y); ctx.stroke();
    const cy = head.y + h * .36, r = w * .67;
    ctx.fillStyle = '#1a2126'; ctx.fillRect(foot.x - r * 1.08, cy - r * 1.08, r * 2.16, r * 2.16);
    ['#e5e7e6', '#242b30', '#d7dcda', '#c54343', '#f06a5f'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(foot.x, cy, r * (1 - i * .19), 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(foot.x - r * .18, cy - r * .22, r * .12, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#11181d'; ctx.lineWidth = Math.max(2, w * .05);
    ctx.fillStyle = '#d9dcda'; ctx.beginPath(); ctx.arc(foot.x, head.y + h * .13, w * .29, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const vest = ctx.createLinearGradient(foot.x - w, 0, foot.x + w, 0); vest.addColorStop(0, '#7f1f26'); vest.addColorStop(.5, '#e04f50'); vest.addColorStop(1, '#671820');
    polygon([[foot.x - w * .48, head.y + h * .29], [foot.x + w * .48, head.y + h * .29], [foot.x + w * .38, head.y + h * .77], [foot.x - w * .38, head.y + h * .77]], vest, '#171c20', Math.max(2, w * .04));
    ctx.fillStyle = '#d8dbd9'; ctx.fillRect(foot.x - w * .68, head.y + h * .34, w * .2, h * .37); ctx.fillRect(foot.x + w * .48, head.y + h * .34, w * .2, h * .37);
    ctx.fillStyle = '#20282e'; ctx.fillRect(foot.x - w * .34, head.y + h * .76, w * .24, h * .24); ctx.fillRect(foot.x + w * .1, head.y + h * .76, w * .24, h * .24);
    ctx.fillStyle = '#ffcf66'; ctx.fillRect(foot.x - w * .08, head.y + h * .42, w * .16, h * .18);
  }
  ctx.restore();
}

function renderGun(now) {
  const moving = Math.min(1, Math.hypot(moveX, moveY) + (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD ? 1 : 0));
  bobAmount += (moving - bobAmount) * .1; bob += .11 + moving * .1;
  const bx = Math.sin(bob) * 7 * bobAmount, by = Math.abs(Math.cos(bob)) * 5 * bobAmount + recoil * 26;
  const x = W / 2 + 22 + bx, y = H + 22 + by, s = Math.max(.76, Math.min(1.2, W / 860));
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(bob * .5) * .008 * bobAmount + recoil * .018);
  const hand = ctx.createLinearGradient(-160, -100, 120, 5); hand.addColorStop(0, '#5a3f32'); hand.addColorStop(.45, '#b78868'); hand.addColorStop(1, '#654436');
  polygon([[-185, 8], [-167, -56], [-112, -106], [-58, -92], [-39, -24], [-52, 8]], hand, '#33231d', 2);
  polygon([[35, 8], [42, -72], [91, -112], [151, -73], [176, 8]], hand, '#33231d', 2);
  const receiver = ctx.createLinearGradient(-100, -155, 112, -20); receiver.addColorStop(0, '#48545e'); receiver.addColorStop(.42, '#20282f'); receiver.addColorStop(1, '#080c0f');
  polygon([[-93, 4], [-86, -112], [-63, -161], [68, -164], [112, -102], [126, 4]], receiver, '#030506', 3);
  polygon([[-72, -10], [-56, -105], [17, -112], [51, -36], [41, 5]], '#12181d', '#030506', 3);
  ctx.fillStyle = '#080c10'; ctx.fillRect(-33, -93, 69, 31); ctx.strokeStyle = '#697680'; ctx.lineWidth = 2; ctx.strokeRect(-29, -89, 61, 23);
  const body = ctx.createLinearGradient(-75, -250, 74, -115); body.addColorStop(0, '#53616c'); body.addColorStop(.28, '#2f3a43'); body.addColorStop(.7, '#151c22'); body.addColorStop(1, '#070b0e');
  polygon([[-69, -128], [-49, -249], [-19, -280], [23, -280], [57, -245], [78, -130]], body, '#020405', 3);
  polygon([[-47, -248], [-31, -274], [35, -274], [55, -246]], '#182027', '#06090c', 2);
  polygon([[-54, -218], [-34, -249], [39, -249], [60, -216]], '#11181e', '#59656e', 1.5);
  ctx.strokeStyle = '#070b0e'; ctx.lineWidth = 5; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-43 + i * 19, -235); ctx.lineTo(-33 + i * 14, -184); ctx.stroke(); }
  const barrel = ctx.createLinearGradient(-22, -350, 30, -245); barrel.addColorStop(0, '#77828a'); barrel.addColorStop(.22, '#323d45'); barrel.addColorStop(1, '#0a0e12');
  polygon([[-18, -349], [-9, -376], [11, -376], [22, -349], [35, -263], [-31, -263]], barrel, '#020405', 2.5);
  polygon([[-13, -366], [-8, -391], [10, -391], [15, -366]], '#141b20', '#020405', 2);
  ctx.fillStyle = '#05080a'; ctx.beginPath(); ctx.ellipse(1, -391, 10, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#0a0e12'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(1, -350, 22, 29, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#707d84'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(1, -350, 16, 23, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#10161a'; ctx.fillRect(-5, -376, 12, 28);
  polygon([[-43, -157], [-34, -191], [-20, -205], [-15, -158]], '#0b1014', '#020405', 2);
  polygon([[18, -158], [22, -205], [37, -190], [47, -156]], '#0b1014', '#020405', 2);
  ctx.strokeStyle = '#71808a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-27, -169); ctx.lineTo(30, -169); ctx.stroke();
  ctx.fillStyle = '#ef5b5b'; ctx.fillRect(-3, -354, 8, 4); ctx.fillRect(-2, -176, 6, 3);
  if (muzzle > 0) {
    ctx.globalCompositeOperation = 'screen'; const g = ctx.createRadialGradient(1, -397, 0, 1, -397, 64); g.addColorStop(0, '#fff'); g.addColorStop(.18, '#ffd36a'); g.addColorStop(.55, '#ff711f88'); g.addColorStop(1, '#ff4b0000'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1, -397, 64, 0, Math.PI * 2); ctx.fill();
    polygon([[1, -393], [-31, -437], [-7, -414], [2, -455], [14, -414], [36, -437]], '#ffe69a');
  }
  ctx.restore();
}

function crosshair() {
  const x = W / 2, y = H / 2, gap = 5 + recoil * 17;
  ctx.strokeStyle = '#f4fbff'; ctx.lineWidth = 2; ctx.shadowColor = '#000'; ctx.shadowBlur = 3; ctx.beginPath();
  ctx.moveTo(x - gap - 7, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + 7, y);
  ctx.moveTo(x, y - gap - 7); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + 7); ctx.stroke();
  ctx.fillStyle = '#ef5b5b'; ctx.fillRect(x - 1, y - 1, 2, 2); ctx.shadowBlur = 0;
}

function renderParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 95 * dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = p.life * 2; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  const dt = Math.min(.04, (now - last) / 1000 || 0); last = now;
  if (running) {
    const speed = 4.3 * dt, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - moveY;
    const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + moveX;
    player.x += (fx * forward + rx * side) * speed; player.z += (fz * forward + rz * side) * speed;
    player.x = Math.max(-9.5, Math.min(9.5, player.x)); player.z = Math.max(.6, Math.min(9, player.z));
    if (mode === 'dummies') targets.forEach(t => { if (t.alive) t.x = t.base + Math.sin(now / 720 + t.t) * 2.25; });
    targets.forEach(t => { if (!t.alive && (t.respawn -= dt) <= 0) { t.alive = true; t.base = -5 + Math.random() * 10; t.x = t.base; t.z = 10.5 + Math.random() * 7; } });
  }
  recoil *= Math.pow(.001, dt); muzzle = Math.max(0, muzzle - dt * 8);
  renderRange(); [...targets].sort((a, b) => b.z - a.z).forEach(renderTarget); renderParticles(dt); renderGun(now); crosshair(); requestAnimationFrame(frame);
}

function toast(text) { const m = $('#message'); m.textContent = text; m.classList.add('show'); clearTimeout(toast.id); toast.id = setTimeout(() => m.classList.remove('show'), 900); }
function update() { $('#score').textContent = score; $('#accuracy').textContent = shots ? Math.round(hits / shots * 100) + '%' : '—'; $('#headshots').textContent = headshots; $('#ammo').textContent = reloading ? '…' : ammo; }

function shoot() {
  if (!running || reloading) return; if (ammo <= 0) { reload(); return; }
  ammo--; shots++; recoil = 1; muzzle = 1;
  let best = null, head = false;
  for (const t of targets) {
    if (!t.alive || !t.screen) continue; const s = t.screen, cx = W / 2, cy = H / 2;
    if (mode === 'boards') {
      const dx = (cx - s.x) / (s.w * .67), dy = (cy - (s.y + s.h * .36)) / (s.w * .67), d = Math.hypot(dx, dy);
      if (d <= 1 && (!best || t.z < best.z)) { best = t; head = d < .22; }
    } else if (cx > s.x - s.w * .68 && cx < s.x + s.w * .68 && cy > s.y && cy < s.y + s.h) {
      if (!best || t.z < best.z) { best = t; head = cy < s.y + s.h * .27; }
    }
  }
  const mark = $('#hitmark'); mark.className = 'hitmark'; void mark.offsetWidth;
  if (best) {
    hits++; best.alive = false; best.respawn = .7; score += head ? 100 : 50; if (head) headshots++;
    mark.classList.add('on'); if (head) mark.classList.add('head'); toast(head ? '헤드샷 +100' : '명중 +50');
    for (let i = 0; i < 14; i++) particles.push({ x: W / 2, y: H / 2, vx: (Math.random() - .5) * 150, vy: (Math.random() - .5) * 150, life: .28 + Math.random() * .25, size: 2 + Math.random() * 3, color: head ? '#ff776d' : '#e8f2ed' });
  } else toast('빗나감');
  if (ammo === 0) setTimeout(reload, 250); update();
}

function reload() { if (reloading || ammo === 12) return; reloading = true; update(); toast('재장전'); setTimeout(() => { ammo = 12; reloading = false; update(); }, 950); }
function start() { running = true; $('#panel').hidden = true; if (matchMedia('(pointer:fine)').matches) canvas.requestPointerLock(); toast(mode === 'boards' ? '사격판 모드' : '이동 허수아비 모드'); }
function lookRate() { return .00065 + sens * .00165; }

document.addEventListener('mousemove', e => { if (document.pointerLockElement === canvas && running) { const r = lookRate(); player.yaw += e.movementX * r; player.pitch = Math.max(-.62, Math.min(.62, player.pitch + e.movementY * r)); } });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && running && matchMedia('(pointer:fine)').matches) { running = false; $('#panel').hidden = false; } });
canvas.addEventListener('mousedown', e => { if (e.button === 0) { if (!running) start(); else shoot(); } });
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') reload(); }); addEventListener('keyup', e => keys[e.code] = false);

document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b)); $('#modeText').textContent = mode === 'boards' ? '고정된 사격판의 중앙을 맞히세요.' : '좌우로 움직이는 허수아비를 맞히세요.'; score = shots = hits = headshots = 0; resetTargets(); update(); toast(mode === 'boards' ? '사격판 모드' : '이동 허수아비 모드'); });
$('#start').onclick = start; $('#settingsBtn').onclick = () => { running = false; if (document.pointerLockElement) document.exitPointerLock(); $('#panel').hidden = false; };
function setSens(v) { sens = Math.max(.2, Math.min(3, Math.round(v * 10) / 10)); $('#sensitivity').value = sens; $('#sensitivityValue').value = sens.toFixed(1); localStorage.setItem('rangeSensitivity', String(sens)); }
$('#sensitivity').oninput = e => setSens(+e.target.value); $('#sensitivity').onchange = e => setSens(+e.target.value); $('#sensDown').onclick = () => setSens(sens - .1); $('#sensUp').onclick = () => setSens(sens + .1); setSens(+(localStorage.getItem('rangeSensitivity') || 1));
$('#fire').onpointerdown = e => { e.preventDefault(); e.stopPropagation(); shoot(); }; $('#reloadMobile').onpointerdown = e => { e.preventDefault(); e.stopPropagation(); reload(); };

const stick = $('#stick'), knob = stick.querySelector('i');
function moveStick(e) { const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), limit = r.width * .32, len = Math.hypot(dx, dy) || 1, k = Math.min(1, limit / len), x = dx * k, y = dy * k; moveX = x / limit; moveY = y / limit; knob.style.transform = `translate(${x}px,${y}px)`; }
stick.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); stick.setPointerCapture(e.pointerId); moveStick(e); }; stick.onpointermove = e => { if (stick.hasPointerCapture(e.pointerId)) moveStick(e); };
function releaseStick(e) { if (stick.hasPointerCapture(e.pointerId)) stick.releasePointerCapture(e.pointerId); moveX = moveY = 0; knob.style.transform = 'translate(0,0)'; }
stick.onpointerup = releaseStick; stick.onpointercancel = releaseStick;

const lookZone = $('#lookZone'); let lookId = null, lookX = 0, lookY = 0;
lookZone.onpointerdown = e => { e.preventDefault(); if (!running) { start(); return; } lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY; lookZone.setPointerCapture(e.pointerId); };
lookZone.onpointermove = e => { if (e.pointerId !== lookId || !running) return; const r = lookRate() * 2.45; player.yaw += (e.clientX - lookX) * r; player.pitch = Math.max(-.62, Math.min(.62, player.pitch + (e.clientY - lookY) * r)); lookX = e.clientX; lookY = e.clientY; };
lookZone.onpointerup = lookZone.onpointercancel = e => { if (e.pointerId === lookId) lookId = null; };

resetTargets(); update(); requestAnimationFrame(frame);


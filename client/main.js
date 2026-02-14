import { renderFrame, drawBackground } from "./render.js";
import { loadLdtkProject, compileLdtkLevel, drawCompiledLevel } from "./ldtk.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const chatEl = document.getElementById("chat");
const chatMessagesEl = document.getElementById("chat-messages");
const chatInputEl = document.getElementById("chat-input");
const mainMenuEl = document.getElementById("main-menu");
const mainMenuNameEl = document.getElementById("main-menu-name");
const mainMenuStartEl = document.getElementById("main-menu-start");
const classButtons = Array.from(document.querySelectorAll(".main-menu__class-btn"));
const deathPopupEl = document.getElementById("death-popup");
const skillsToggleEl = document.getElementById("skills-toggle");
const skillsMenuEl = document.getElementById("skills-menu");
const skillsLevelEl = document.getElementById("skills-level");
const skillsPointsEl = document.getElementById("skills-points");
const levelUpPopupEl = document.getElementById("levelup-popup");
const statHealthEl = document.getElementById("stat-health");
const statDamageEl = document.getElementById("stat-damage");
const statSpeedEl = document.getElementById("stat-speed");
const statAttackSpeedEl = document.getElementById("stat-attackSpeed");
const skillUpButtons = Array.from(document.querySelectorAll(".skill-up"));

let compiledLevel = null;

(async () => {
  const projectUrl = "/levels/level_0.json"; 
  const project = await loadLdtkProject(projectUrl);
  compiledLevel = await compileLdtkLevel(project, "Level_0", projectUrl);
})();

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --- Input state ---
const keys = { up: false, down: false, left: false, right: false, mouseOne: false, mouseTwo: false };
const queuedAttacks = { melee: false, throw: false };
function setKey(e, isDown) {
  if (!sessionActive) return;
  if (isChatFocused()) return;

  switch (e.key) {
    case "w": case "W": case "ArrowUp": keys.up = isDown; break;
    case "s": case "S": case "ArrowDown": keys.down = isDown; break;
    case "a": case "A": case "ArrowLeft": keys.left = isDown; break;
    case "d": case "D": case "ArrowRight": keys.right = isDown; break;
    case "q": case "Q": if (isDown) queuedAttacks.melee = true; break;
    case "e": case "E": if (isDown) queuedAttacks.throw = true; break;
    case "`": if(isDown){chatEl.style.display = (chatEl.style.display === "none") ? "" : "none"; if(chatEl.style.display != "none") chatEl.focus()}; break;
    default: return;
  }
  e.preventDefault();
}
window.addEventListener("keydown", (e) => setKey(e, true), { passive: false });
window.addEventListener("keyup", (e) => setKey(e, false), { passive: false });

const mouse = { x: 0, y: 0 };
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
window.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});
window.addEventListener("mousedown", (e) => {
  if (!sessionActive) return;
  if (isChatFocused()) return;
  switch(e.button) {
    case 0:
      keys.mouseOne = true;
      break;
    case 2:
      keys.mouseTwo = true;
      break;
  }
  if (e.button === 0) {
    queuedAttacks.melee = true;
  } else if (e.button === 2) {
    queuedAttacks.throw = true;
  }
});
window.addEventListener("mouseup", (e) => {
  if (!sessionActive) return;
  if(isChatFocused()) return;
  switch(e.button) {
    case 0:
      keys.mouseOne = false;
      break;
    case 2:
      keys.mouseTwo = false;
      break;
  }
});

// --- Networking ---
let socket = null;

const C2S = { INPUT: "c2s:input", CHAT: "c2s:chat", SKILL_UPGRADE: "c2s:skill_upgrade" };
const S2C = { INIT: "s2c:init", SNAPSHOT: "s2c:snapshot", DISCONNECT: "s2c:disconnect", CHAT: "s2c:chat" };

let meId = null;
let lastSnapshot = { players: {} };
let inputSeq = 0;
let chatFadeTimer = null;
const chatBubblesById = {};

const CHAT_BUBBLE_MAX_PER_PLAYER = 3;
const CHAT_BUBBLE_VISIBLE_MS = 5_000;
const CHAT_BUBBLE_FADE_MS = 700;
const LEVEL_UP_AURA_MS = 1_100;
const LEVEL_UP_POPUP_VISIBLE_MS = 1_200;
const DEATH_EFFECT_MS = 1_250;
let skillsMenuOpen = false;
let levelUpPopupTimer = null;
let levelUpEffects = [];
let deathEffects = [];
let sessionActive = false;
let selectedClass = "blade";

function isChatFocused() {
  return document.activeElement === chatInputEl;
}

function sanitizePlayerName(rawName) {
  const raw = typeof rawName === "string" ? rawName : "";
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.slice(0, 20);
}

function getPlayerNameById(id) {
  const player = id && lastSnapshot?.players ? lastSnapshot.players[id] : null;
  const name = typeof player?.name === "string" ? player.name.trim() : "";
  return name || `Player-${String(id || "").slice(0, 4)}`;
}

function setSkillsMenuOpen(nextOpen) {
  skillsMenuOpen = !!nextOpen;
  if (skillsMenuOpen) {
    skillsMenuEl.classList.add("skills-menu--open");
  } else {
    skillsMenuEl.classList.remove("skills-menu--open");
  }
}

function updateSkillMenuFromSnapshot() {
  const players = lastSnapshot.players || {};
  const me = meId ? players[meId] : null;
  if (!me) return;

  const stats = me.stats || {};
  const points = me.skillPoints || 0;

  skillsLevelEl.textContent = String(me.level || 1);
  skillsPointsEl.textContent = String(points);
  statHealthEl.textContent = String(stats.health || 0);
  statDamageEl.textContent = String(stats.damage || 0);
  statSpeedEl.textContent = String(stats.speed || 0);
  statAttackSpeedEl.textContent = String(stats.attackSpeed || 0);

  for (const btn of skillUpButtons) {
    btn.disabled = points <= 0;
  }
}

function showChat() {
  chatEl.classList.remove("chat--faded");
}

function scheduleChatFade() {
  if (chatFadeTimer) {
    clearTimeout(chatFadeTimer);
    chatFadeTimer = null;
  }

  if (isChatFocused()) return;

  chatFadeTimer = setTimeout(() => {
    if (!isChatFocused()) {
      chatEl.classList.add("chat--faded");
    }
  }, 12_000);
}

function appendChatMessage({ id, text, name }) {
  if (!text) return;

  const row = document.createElement("div");
  row.className = "chat-row";

  const author = document.createElement("span");
  author.className = "chat-author";
  const authorName = typeof name === "string" && name.trim() ? name.trim() : getPlayerNameById(id);
  author.textContent = id === meId ? `You (${authorName}):` : `${authorName}:`;

  row.appendChild(author);
  row.appendChild(document.createTextNode(text));
  chatMessagesEl.appendChild(row);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function queuePlayerChatBubble({ id, text, ts }) {
  if (!id || !text) return;

  const createdAt = Number.isFinite(ts) ? ts : Date.now();
  const fadeStartAt = createdAt + CHAT_BUBBLE_VISIBLE_MS;
  const expiresAt = fadeStartAt + CHAT_BUBBLE_FADE_MS;

  if (!chatBubblesById[id]) {
    chatBubblesById[id] = [];
  }

  const queue = chatBubblesById[id];
  queue.push({ text, fadeStartAt, expiresAt });

  while (queue.length > CHAT_BUBBLE_MAX_PER_PLAYER) {
    queue.shift();
  }
}

function pruneExpiredChatBubbles(now = Date.now()) {
  for (const id of Object.keys(chatBubblesById)) {
    const queue = chatBubblesById[id];
    if (!Array.isArray(queue) || queue.length === 0) {
      delete chatBubblesById[id];
      continue;
    }

    chatBubblesById[id] = queue.filter((msg) => now < msg.expiresAt);
    if (chatBubblesById[id].length === 0) {
      delete chatBubblesById[id];
    }
  }
}

function clearGameplayInput() {
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;
  keys.mouseOne = false;
  keys.mouseTwo = false;
  queuedAttacks.melee = false;
  queuedAttacks.throw = false;
}

function showDeathPopup() {
  deathPopupEl?.classList.add("death-popup--show");
}

function hideDeathPopup() {
  deathPopupEl?.classList.remove("death-popup--show");
}

function queueDeathEffect(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const now = Date.now();
  const particles = [];
  const count = 22;
  const palette = ["#ff5e5e", "#ff7b7b", "#ffb0b0", "#ffd4d4"];

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + (Math.random() * 180);
    particles.push({
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + (Math.random() * 3.5),
      color: palette[i % palette.length],
    });
  }

  deathEffects.push({
    x,
    y,
    createdAt: now,
    expiresAt: now + DEATH_EFFECT_MS,
    particles,
  });
}

function pruneExpiredDeathEffects(now = Date.now()) {
  deathEffects = deathEffects.filter((evt) => evt && now < evt.expiresAt);
}

function queueLevelUpEffect(level) {
  if (!meId || !Number.isFinite(level)) return;

  const now = Date.now();
  levelUpEffects.push({
    playerId: meId,
    level: Math.max(1, Math.floor(level)),
    createdAt: now,
    expiresAt: now + LEVEL_UP_AURA_MS,
  });
}

function pruneExpiredLevelUpEffects(now = Date.now()) {
  levelUpEffects = levelUpEffects.filter((evt) => evt && now < evt.expiresAt);
}

function showLevelUpPopup(level) {
  if (!levelUpPopupEl || !Number.isFinite(level)) return;

  levelUpPopupEl.textContent = `LEVEL UP - ${Math.max(1, Math.floor(level))}`;
  levelUpPopupEl.classList.remove("levelup-popup--show");
  void levelUpPopupEl.offsetWidth;
  levelUpPopupEl.classList.add("levelup-popup--show");

  if (levelUpPopupTimer) {
    clearTimeout(levelUpPopupTimer);
    levelUpPopupTimer = null;
  }

  levelUpPopupTimer = setTimeout(() => {
    levelUpPopupEl.classList.remove("levelup-popup--show");
    levelUpPopupTimer = null;
  }, LEVEL_UP_POPUP_VISIBLE_MS);
}

function submitChatFromInput() {
  if (!sessionActive || !socket) return;
  const text = chatInputEl.value.trim();
  if (!text) return;
  socket.emit(C2S.CHAT, text);
  chatInputEl.value = "";
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (!sessionActive) return;

  if (isChatFocused()) {
    e.preventDefault();
    submitChatFromInput();
    chatInputEl.blur();
    return;
  } 
  
  chatInputEl.focus();
  e.preventDefault();
  showChat();
});

chatInputEl.addEventListener("focus", () => {
  showChat();
  if (chatFadeTimer) {
    clearTimeout(chatFadeTimer);
    chatFadeTimer = null;
  }
});

chatInputEl.addEventListener("blur", () => {
  scheduleChatFade();
});

scheduleChatFade();
setSkillsMenuOpen(false);
chatEl.classList.add("chat--faded");

function setSelectedClass(nextClass) {
  selectedClass = nextClass === "thrower" ? "thrower" : "blade";
  for (const btn of classButtons) {
    const isActive = btn.dataset.class === selectedClass;
    btn.classList.toggle("main-menu__class-btn--active", isActive);
  }
}

for (const btn of classButtons) {
  btn.addEventListener("click", () => {
    setSelectedClass(btn.dataset.class);
  });
}

if (mainMenuNameEl) {
  mainMenuNameEl.focus();
  mainMenuNameEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    mainMenuStartEl?.click();
  });
}

mainMenuStartEl?.addEventListener("click", () => {
  const playerName = sanitizePlayerName(mainMenuNameEl?.value || "");
  if (!playerName) {
    if (mainMenuNameEl) mainMenuNameEl.focus();
    return;
  }

  sessionActive = true;
  hideDeathPopup();
  mainMenuEl?.classList.add("main-menu--hidden");
  connectSession({ playerName, playerClass: selectedClass });
});

skillsToggleEl.addEventListener("click", () => {
  if (!sessionActive) return;
  setSkillsMenuOpen(!skillsMenuOpen);
});

for (const btn of skillUpButtons) {
  btn.addEventListener("click", () => {
    if (!sessionActive || !socket) return;
    const stat = btn.dataset.stat;
    if (!stat) return;
    socket.emit(C2S.SKILL_UPGRADE, { stat });
  });
}

function bindSocketHandlers(activeSocket) {
  activeSocket.on(S2C.INIT, (msg) => {
    meId = msg.meId;
  });

  activeSocket.on(S2C.SNAPSHOT, (snap) => {
    const prevPlayers = lastSnapshot.players || {};
    const prevMe = meId ? prevPlayers[meId] : null;

    lastSnapshot = snap;
    updateSkillMenuFromSnapshot();

    const nextPlayers = snap?.players || {};
    const nextMe = meId ? nextPlayers[meId] : null;
    const prevLevel = Number.isFinite(prevMe?.level) ? Math.floor(prevMe.level) : null;
    const nextLevel = Number.isFinite(nextMe?.level) ? Math.floor(nextMe.level) : null;
    const prevHealth = Number.isFinite(prevMe?.health) ? prevMe.health : null;
    const nextHealth = Number.isFinite(nextMe?.health) ? nextMe.health : null;

    if (Number.isFinite(prevLevel) && Number.isFinite(nextLevel) && nextLevel > prevLevel) {
      queueLevelUpEffect(nextLevel);
      showLevelUpPopup(nextLevel);
    }

    if (Number.isFinite(prevHealth) && Number.isFinite(nextHealth) && prevHealth > 0 && nextHealth <= 0) {
      queueDeathEffect(nextMe?.x ?? prevMe?.x, nextMe?.y ?? prevMe?.y);
      showDeathPopup();
      clearGameplayInput();
    } else if (Number.isFinite(prevHealth) && Number.isFinite(nextHealth) && prevHealth <= 0 && nextHealth > 0) {
      hideDeathPopup();
      clearGameplayInput();
    }
  });

  activeSocket.on(S2C.DISCONNECT, ({ id }) => {
    if (lastSnapshot?.players) delete lastSnapshot.players[id];
    delete chatBubblesById[id];
  });

  activeSocket.on(S2C.CHAT, (msg) => {
    const chatMsg = msg || {};
    appendChatMessage(chatMsg);
    queuePlayerChatBubble(chatMsg);
    showChat();
    scheduleChatFade();
  });
}

function connectSession({ playerName, playerClass }) {
  if (socket) return;

  socket = io({
    auth: {
      name: playerName,
      playerClass,
    },
  });
  bindSocketHandlers(socket);
}

// --- Main loop (render + send inputs) ---
function computeAimAngle() {
  const players = lastSnapshot.players || {};
  const me = meId ? players[meId] : null;
  if (!me) return 0;

  const camera = getCameraForPlayer(me);
  const meScreenX = (me.x - camera.x) + camera.w / 2;
  const meScreenY = (me.y - camera.y) + camera.h / 2;
  return Math.atan2(mouse.y - meScreenY, mouse.x - meScreenX);
}

function sendInput() {
  if (!sessionActive || !socket || !meId) return;
  const players = lastSnapshot.players || {};
  const me = players[meId];
  if (!me || me.health <= 0) return;

  const aim = computeAimAngle();
  socket.emit(C2S.INPUT, {
    seq: ++inputSeq,
    up: keys.up,
    down: keys.down,
    left: keys.left,
    right: keys.right,
    aim,
    attackMelee: queuedAttacks.melee,
    attackThrow: queuedAttacks.throw,
  });

  queuedAttacks.melee = keys.mouseOne;
  queuedAttacks.throw = keys.mouseOne;
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function getCameraForPlayer(me) {
  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;

  let cameraX = me ? me.x : 0;
  let cameraY = me ? me.y : 0;

  if (compiledLevel) {
    const minX = compiledLevel.worldX + halfW;
    const maxX = compiledLevel.worldX + compiledLevel.pxWid - halfW;
    const minY = compiledLevel.worldY + halfH;
    const maxY = compiledLevel.worldY + compiledLevel.pxHei - halfH;

    cameraX = clamp(cameraX, minX, maxX);
    cameraY = clamp(cameraY, minY, maxY);
  }

  return {
    x: cameraX,
    y: cameraY,
    w: window.innerWidth,
    h: window.innerHeight,
  };
}

function render() {
  ctx.imageSmoothingEnabled = false;
  pruneExpiredChatBubbles();
  pruneExpiredLevelUpEffects();
  pruneExpiredDeathEffects();

  const players = lastSnapshot.players || {};
  const me = meId ? players[meId] : null;
  const camera = getCameraForPlayer(me);

  let background = compiledLevel ? compiledLevel.background : null;
  drawBackground(ctx, camera, background);

  if (compiledLevel) {
    drawCompiledLevel(ctx, compiledLevel, camera);
  } 

  renderFrame(ctx, {
    meId,
    players,
    projectiles: lastSnapshot.projectiles || [],
    slashes: lastSnapshot.slashes || [],
    expEvents: lastSnapshot.expEvents || [],
    damageEvents: lastSnapshot.damageEvents || [],
    levelUpEffects,
    deathEffects,
    camera,
    chatBubblesById,
  });
}

function frame() {
  sendInput();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

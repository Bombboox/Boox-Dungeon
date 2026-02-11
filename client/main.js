import { renderFrame, drawBackground } from "./render.js";
import { loadLdtkProject, compileLdtkLevel, drawCompiledLevel } from "./ldtk.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

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
const keys = { up: false, down: false, left: false, right: false };
function setKey(e, isDown) {
  switch (e.key) {
    case "w": case "W": case "ArrowUp": keys.up = isDown; break;
    case "s": case "S": case "ArrowDown": keys.down = isDown; break;
    case "a": case "A": case "ArrowLeft": keys.left = isDown; break;
    case "d": case "D": case "ArrowRight": keys.right = isDown; break;
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

// --- Networking ---
const socket = io(); // served from same origin by express+socket.io

const C2S = { INPUT: "c2s:input" };
const S2C = { INIT: "s2c:init", SNAPSHOT: "s2c:snapshot", DISCONNECT: "s2c:disconnect" };

let meId = null;
let lastSnapshot = { players: {} };
let inputSeq = 0;

socket.on(S2C.INIT, (msg) => {
  meId = msg.meId;
});

socket.on(S2C.SNAPSHOT, (snap) => {
  lastSnapshot = snap;
});

socket.on(S2C.DISCONNECT, ({ id }) => {
  if (lastSnapshot?.players) delete lastSnapshot.players[id];
});

// --- Main loop (render + send inputs) ---
function computeAimAngle() {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return Math.atan2(mouse.y - cy, mouse.x - cx);
}

function sendInput() {
  if (!meId) return;

  const aim = computeAimAngle();
  socket.emit(C2S.INPUT, {
    seq: ++inputSeq,
    up: keys.up,
    down: keys.down,
    left: keys.left,
    right: keys.right,
    aim,
  });
}

function render() {
  ctx.imageSmoothingEnabled = false;
  const players = lastSnapshot.players || {};
  const me = meId ? players[meId] : null;

  const camera = {
    x: me ? me.x : 0,
    y: me ? me.y : 0,
    w: window.innerWidth,
    h: window.innerHeight,
  };

  let background = compiledLevel ? compiledLevel.background : null;
  drawBackground(ctx, camera, background);

  if (compiledLevel) {
    drawCompiledLevel(ctx, compiledLevel, camera);
  } 

  renderFrame(ctx, {
    meId,
    players,
    camera,
  });
}

function frame() {
  sendInput();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

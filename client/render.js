const TextureCache = new Map(); 

function loadTexture(key, url) {
  if (TextureCache.has(key)) return TextureCache.get(key);

  const entry = { img: new Image(), loaded: false, error: false };
  entry.img.onload = () => (entry.loaded = true);
  entry.img.onerror = () => (entry.error = true);
  entry.img.src = url;

  TextureCache.set(key, entry);
  return entry;
}

function worldToScreen(x, y, camera) {
  return {
    x: Math.round((x - camera.x) + camera.w / 2),
    y: Math.round((y - camera.y) + camera.h / 2),
  };
}

export function drawBackground(ctx, camera, color) {
  ctx.fillStyle = color ? color : "#111";
  ctx.fillRect(0, 0, camera.w, camera.h);

  // Debug grid (toggle off later)
  const gridSize = 64;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;

  const startX = Math.floor((camera.x - camera.w / 2) / gridSize) * gridSize;
  const endX   = Math.floor((camera.x + camera.w / 2) / gridSize) * gridSize;
  const startY = Math.floor((camera.y - camera.h / 2) / gridSize) * gridSize;
  const endY   = Math.floor((camera.y + camera.h / 2) / gridSize) * gridSize;

  for (let x = startX; x <= endX; x += gridSize) {
    const sx = (x - camera.x) + camera.w / 2;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, camera.h);
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y += gridSize) {
    const sy = (y - camera.y) + camera.h / 2;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(camera.w, sy);
    ctx.stroke();
  }
}

function drawFallbackCharacter(ctx, sx, sy, radius, angle, color, isLocal) {
  // Body
  ctx.beginPath();
  ctx.fillStyle = color || "#4aa3ff";
  ctx.arc(sx, sy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Outline (local player gets a brighter outline)
  ctx.lineWidth = isLocal ? 3 : 2;
  ctx.strokeStyle = isLocal ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)";
  ctx.stroke();

  // Facing dot
  const dotDist = radius * 0.75;
  const dx = Math.cos(angle) * dotDist;
  const dy = Math.sin(angle) * dotDist;

  ctx.beginPath();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.arc(sx + dx, sy + dy, Math.max(3, radius * 0.18), 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.arc(sx - radius * 0.25, sy - radius * 0.25, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacter(ctx, camera, player, opts) {
  const { localPlayerId, textureBaseUrl } = opts || {};
  const radius = player.radius ?? 18;
  const color = player.color ?? "#4aa3ff";

  const { x: sx, y: sy } = worldToScreen(player.x, player.y, camera);
  const angle = player.angle ?? 0;
  const isLocal = player.id === localPlayerId;

  if (player.skinKey) {
    const url = `${textureBaseUrl || ""}${player.skinKey}.png`;
    const tex = loadTexture(player.skinKey, url);

    if (tex.loaded && !tex.error) {
      const size = radius * 2.2; 
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.drawImage(tex.img, -size / 2, -size / 2, size, size);
      ctx.restore();

      if (isLocal) {
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 3, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,0.65)";
        ctx.stroke();
      }
      return;
    }
  }

  drawFallbackCharacter(ctx, sx, sy, radius, angle, color, isLocal);
}

export function renderFrame(ctx, state) {
  const camera = state.camera;

  const players = Object.values(state.players || {});
  for (const p of players) {
    drawCharacter(ctx, camera, p, {
      localPlayerId: state.meId,
      textureBaseUrl: "/assets/skins/", 
    });
  }
}

export function makeCamera(canvas, targetX, targetY) {
  return {
    x: targetX,
    y: targetY,
    w: canvas.width,
    h: canvas.height,
  };
}

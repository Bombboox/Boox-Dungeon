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

function drawBar(ctx, x, y, width, height, ratio, fillColor) {
  const clamped = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = fillColor;
  ctx.fillRect(x + 1, y + 1, (width - 2) * clamped, height - 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function drawEnemyHealthBar(ctx, camera, entity) {
  if (entity.type !== "enemy") return;
  if (!Number.isFinite(entity.maxHealth) || entity.maxHealth <= 0) return;

  const { x: sx, y: sy } = worldToScreen(entity.x, entity.y, camera);
  const width = Math.max(26, (entity.radius || 14) * 2.2);
  const height = 6;
  const x = Math.round(sx - width / 2);
  const y = Math.round(sy - (entity.radius || 14) - 14);
  const ratio = (entity.health || 0) / entity.maxHealth;

  const enemyName = typeof entity.name === "string" && entity.name.trim() ? entity.name.trim() : "Enemy";
  const enemyLevel = Number.isFinite(entity.level) ? Math.max(1, Math.floor(entity.level)) : 1;
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = "bold 11px Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`${enemyName}  LVL ${enemyLevel}`, sx, y - 3);
  ctx.restore();

  drawBar(ctx, x, y, width, height, ratio, "#ff5e5e");
}

function drawProjectile(ctx, camera, projectile, textureBaseUrl) {
  const radius = projectile.radius ?? 6;
  const angle = projectile.angle ?? 0;
  const { x: sx, y: sy } = worldToScreen(projectile.x, projectile.y, camera);

  if (projectile.spriteKey) {
    const key = `projectile:${projectile.spriteKey}`;
    const url = `${textureBaseUrl || ""}${projectile.spriteKey}.png`;
    const tex = loadTexture(key, url);
    if (tex.loaded && !tex.error) {
      const w = radius * 3;
      const h = radius * 2;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.drawImage(tex.img, -w / 2, -h / 2, w, h);
      ctx.restore();
      return;
    }
  }

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  ctx.fillStyle = "#ffe082";
  ctx.strokeStyle = "rgba(255, 160, 60, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.5, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSlash(ctx, camera, slash, textureBaseUrl) {
  if (!Number.isFinite(slash.x1) || !Number.isFinite(slash.y1) || !Number.isFinite(slash.x2) || !Number.isFinite(slash.y2)) {
    return;
  }

  const a = worldToScreen(slash.x1, slash.y1, camera);
  const b = worldToScreen(slash.x2, slash.y2, camera);
  const thickness = Math.max(2, slash.thickness ?? 8);

  if (slash.spriteKey) {
    const key = `slash:${slash.spriteKey}`;
    const url = `${textureBaseUrl || ""}${slash.spriteKey}.png`;
    const tex = loadTexture(key, url);
    if (tex.loaded && !tex.error) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle);
      ctx.drawImage(tex.img, -len / 2, -thickness, len, thickness * 2);
      ctx.restore();
      return;
    }
  }

  const progress = Math.max(0, Math.min(1, slash.progress ?? 0));
  const alpha = 0.95 - (progress * 0.45);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#d5f3ff";
  ctx.lineWidth = thickness;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.strokeStyle = "rgba(124, 219, 255, 0.72)";
  ctx.lineWidth = Math.max(1, thickness * 0.5);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function drawLocalHealthBar(ctx, me, camera) {
  if (!me || !Number.isFinite(me.maxHealth) || me.maxHealth <= 0) return;
  const width = 220;
  const height = 18;
  const x = innerWidth - width - 16;
  const y = camera.h - height - 16;
  const ratio = (me.health || 0) / me.maxHealth;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x - 6, y - 24, width + 12, height + 32);
  ctx.fillStyle = "#fff";
  ctx.font = "12px Consolas, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`HP ${Math.max(0, Math.ceil(me.health || 0))}/${me.maxHealth}`, x, y - 18);
  drawBar(ctx, x, y, width, height, ratio, "#61d46d");
}

function drawLocalExpBar(ctx, me, camera) {
  if (!me || !Number.isFinite(me.expToNext) || me.expToNext <= 0) return;

  const width = 220;
  const height = 12;
  const x = innerWidth - width - 16;
  const y = camera.h - height - 64;
  const ratio = (me.exp || 0) / me.expToNext;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x - 6, y - 16, width + 12, height + 22);
  ctx.fillStyle = "#fff";
  ctx.font = "12px Consolas, monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`LVL ${me.level || 1}  XP ${Math.floor(me.exp || 0)}/${me.expToNext}`, x, y - 12);
  drawBar(ctx, x, y, width, height, ratio, "#56b5ff");
}

function drawExpGainEvents(ctx, camera, entitiesById, expEvents) {
  if (!Array.isArray(expEvents) || expEvents.length === 0) return;

  const now = Date.now();
  for (const evt of expEvents) {
    if (!evt || !evt.playerId) continue;
    const player = entitiesById[evt.playerId];
    if (!player) continue;
    if (!Number.isFinite(evt.createdAt) || !Number.isFinite(evt.expiresAt) || evt.expiresAt <= evt.createdAt) continue;
    if (now >= evt.expiresAt) continue;

    const progress = Math.max(0, Math.min(1, (now - evt.createdAt) / (evt.expiresAt - evt.createdAt)));
    const alpha = 1 - progress;
    const rise = 26 * progress;

    const { x: sx, y: sy } = worldToScreen(player.x, player.y, camera);
    const y = sy - (player.radius || 18) - 28 - rise;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#b6ff7b";
    ctx.font = "bold 14px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${evt.amount || 0} XP`, sx, y);
    ctx.restore();
  }
}

function drawDamageEvents(ctx, camera, damageEvents, meId) {
  if (!Array.isArray(damageEvents) || damageEvents.length === 0) return;
  if (!meId) return;

  console.log("lol");

  const now = Date.now();
  for (const evt of damageEvents) {
    if (!evt || evt.playerId !== meId) continue;
    if (!Number.isFinite(evt.amount) || evt.amount <= 0) continue;
    if (!Number.isFinite(evt.x) || !Number.isFinite(evt.y)) continue;
    if (!Number.isFinite(evt.createdAt) || !Number.isFinite(evt.expiresAt) || evt.expiresAt <= evt.createdAt) continue;
    if (now >= evt.expiresAt) continue;

    const progress = Math.max(0, Math.min(1, (now - evt.createdAt) / (evt.expiresAt - evt.createdAt)));
    const alpha = 1 - progress;
    const rise = 28 * progress;
    const drift = 8 * progress;

    const { x: sx, y: sy } = worldToScreen(evt.x, evt.y, camera);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffd66b";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 2;
    ctx.font = "bold 15px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(String(Math.floor(evt.amount)), sx + drift, sy - 22 - rise);
    ctx.fillText(String(Math.floor(evt.amount)), sx + drift, sy - 22 - rise);
    ctx.restore();
  }
}

function drawLevelUpEffects(ctx, camera, entitiesById, levelUpEffects) {
  if (!Array.isArray(levelUpEffects) || levelUpEffects.length === 0) return;

  const now = Date.now();
  for (const evt of levelUpEffects) {
    if (!evt || !evt.playerId) continue;
    if (!Number.isFinite(evt.createdAt) || !Number.isFinite(evt.expiresAt) || evt.expiresAt <= evt.createdAt) continue;
    if (now >= evt.expiresAt) continue;

    const entity = entitiesById[evt.playerId];
    if (!entity) continue;

    const progress = Math.max(0, Math.min(1, (now - evt.createdAt) / (evt.expiresAt - evt.createdAt)));
    const pulse = Math.sin(progress * Math.PI);
    const baseRadius = (entity.radius || 18) + 6;
    const outerRadius = baseRadius + (24 * progress);

    const { x: sx, y: sy } = worldToScreen(entity.x, entity.y, camera);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const glow = ctx.createRadialGradient(sx, sy, baseRadius * 0.6, sx, sy, outerRadius);
    glow.addColorStop(0, "rgba(146, 224, 255, 0.00)");
    glow.addColorStop(0.65, `rgba(146, 224, 255, ${0.24 * (1 - progress)})`);
    glow.addColorStop(1, "rgba(146, 224, 255, 0.00)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95 - (progress * 0.65);
    ctx.strokeStyle = "#9ce5ff";
    ctx.lineWidth = 2 + (1.5 * (1 - progress));
    ctx.beginPath();
    ctx.arc(sx, sy, outerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.5 * pulse;
    ctx.strokeStyle = "#e3f9ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, baseRadius + (8 * pulse), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawDeathEffects(ctx, camera, deathEffects) {
  if (!Array.isArray(deathEffects) || deathEffects.length === 0) return;

  const now = Date.now();
  for (const evt of deathEffects) {
    if (!evt) continue;
    if (!Number.isFinite(evt.x) || !Number.isFinite(evt.y)) continue;
    if (!Number.isFinite(evt.createdAt) || !Number.isFinite(evt.expiresAt) || evt.expiresAt <= evt.createdAt) continue;
    if (now >= evt.expiresAt) continue;

    const progress = Math.max(0, Math.min(1, (now - evt.createdAt) / (evt.expiresAt - evt.createdAt)));
    const alpha = 1 - progress;
    const flashRadius = 10 + (60 * progress);

    const center = worldToScreen(evt.x, evt.y, camera);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const flash = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, flashRadius);
    flash.addColorStop(0, `rgba(255, 130, 130, ${0.6 * alpha})`);
    flash.addColorStop(1, "rgba(255, 130, 130, 0)");
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(center.x, center.y, flashRadius, 0, Math.PI * 2);
    ctx.fill();

    const particles = Array.isArray(evt.particles) ? evt.particles : [];
    for (const p of particles) {
      if (!p) continue;
      const px = evt.x + ((p.vx || 0) * progress);
      const py = evt.y + ((p.vy || 0) * progress) + (26 * progress * progress);
      const ps = worldToScreen(px, py, camera);
      const radius = Math.max(0.5, (p.radius || 2) * (1 - (progress * 0.35)));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color || "#ff7b7b";
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawPlayerChatBubbles(ctx, camera, entity, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return;

  const now = Date.now();
  const bubbleGap = 6;
  const verticalOffset = (entity.radius || 18) + 16;
  const maxBubbleWidth = 220;

  let stackOffset = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || typeof msg.text !== "string" || !msg.text) continue;

    const fadeStartAt = Number.isFinite(msg.fadeStartAt) ? msg.fadeStartAt : now;
    const expiresAt = Number.isFinite(msg.expiresAt) ? msg.expiresAt : now;
    if (now >= expiresAt) continue;

    let alpha = 1;
    if (now > fadeStartAt) {
      const fadeDuration = Math.max(1, expiresAt - fadeStartAt);
      alpha = 1 - (now - fadeStartAt) / fadeDuration;
      if (alpha <= 0) continue;
    }

    const { x: sx, y: sy } = worldToScreen(entity.x, entity.y, camera);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = "13px Consolas, monospace";
    ctx.textBaseline = "middle";

    const textWidth = Math.ceil(ctx.measureText(msg.text).width);
    const bubbleWidth = Math.min(maxBubbleWidth, textWidth + 16);
    const bubbleHeight = 24;
    const bubbleX = Math.round(sx - bubbleWidth / 2);
    const bubbleY = Math.round(sy - verticalOffset - stackOffset - bubbleHeight);

    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    drawRoundedRectPath(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(msg.text, sx, bubbleY + bubbleHeight / 2 + 0.5);
    ctx.restore();

    stackOffset += bubbleHeight + bubbleGap;
  }
}

export function renderFrame(ctx, state) {
  const camera = state.camera;
  const entities = Object.values(state.entities || state.players || {});
  const projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
  const slashes = Array.isArray(state.slashes) ? state.slashes : [];
  const expEvents = Array.isArray(state.expEvents) ? state.expEvents : [];
  const damageEvents = Array.isArray(state.damageEvents) ? state.damageEvents : [];
  const levelUpEffects = Array.isArray(state.levelUpEffects) ? state.levelUpEffects : [];
  const deathEffects = Array.isArray(state.deathEffects) ? state.deathEffects : [];
  const chatBubblesById = state.chatBubblesById || {};
  const textureBaseUrl = "/assets/skins/";
  let me = null;

  for (const projectile of projectiles) {
    drawProjectile(ctx, camera, projectile, textureBaseUrl);
  }

  for (const entity of entities) {
    drawCharacter(ctx, camera, entity, {
      localPlayerId: state.meId,
      textureBaseUrl,
    });
    drawEnemyHealthBar(ctx, camera, entity);
    if (entity.type === "player") {
      drawPlayerChatBubbles(ctx, camera, entity, chatBubblesById[entity.id]);
    }
    if (entity.id === state.meId) me = entity;
  }

  drawLevelUpEffects(ctx, camera, state.players || state.entities || {}, levelUpEffects);
  drawDeathEffects(ctx, camera, deathEffects);

  for (const slash of slashes) {
    drawSlash(ctx, camera, slash, textureBaseUrl);
  }

  drawExpGainEvents(ctx, camera, state.players || state.entities || {}, expEvents);
  drawDamageEvents(ctx, camera, damageEvents, state.meId);
  drawLocalExpBar(ctx, me, camera);
  drawLocalHealthBar(ctx, me, camera);
}

export function makeCamera(canvas, targetX, targetY) {
  return {
    x: targetX,
    y: targetY,
    w: canvas.width,
    h: canvas.height,
  };
}

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const PLAYER_SPEED = 220;
export const PLAYER_RADIUS = 18;
export const ENEMY_SPEED = 120;
export const ENEMY_RADIUS = 16;
export const PLAYER_MAX_HEALTH = 100;
export const ENEMY_MAX_HEALTH = 40;
export const CONTACT_DAMAGE = 10;
export const PLAYER_IFRAMES_MS = 600;
export const PLAYER_RESPAWN_MS = 5000;

export const PLAYER_CLASSES = {
    BLADE: "blade",
    THROWER: "thrower",
};

const MELEE_SWING_DURATION_MS = 400;
const MELEE_SWING_START_OFFSET = -1.2;
const MELEE_SWING_END_OFFSET = 1.2;
const MELEE_SWING_INNER_RANGE = 14;
const MELEE_SWING_OUTER_RANGE = 82;
const MELEE_SWING_THICKNESS = 10;

const THROW_PROJECTILE_SPEED = 520;
const THROW_PROJECTILE_RANGE = 520;
const THROW_PROJECTILE_RADIUS = 6;
const INVENTORY_SIZE = 32;
const HOTBAR_SIZE = 10;
const GLYPH_SLOTS = 5;

const ENEMY_RESPAWN_MS = 4500;
const ENEMY_EXP_REWARD = 45;

const STAT_HEALTH_GAIN = 20;
const STAT_DAMAGE_GAIN = 0.12;
const STAT_SPEED_GAIN = 20;
const STAT_ATTACK_SPEED_GAIN = 0.08;
const ATTACK_SPEED_MIN_SCALE = 0.45;

const EXP_POPUP_MS = 900;
const DAMAGE_POPUP_MS = 700;

import { Enemy, Player } from "./entities.js";
import { createStarterItems, GLYPH_STAT_KEYS, WEAPON_TYPES } from "./items.js";

let nextProjectileId = 1;
let nextSlashId = 1;
const activeProjectiles = [];
const activeSlashes = [];
const pendingEnemyRespawns = [];
const pendingPlayerRespawns = [];
const expGainEvents = [];
const damageEvents = [];
let nextItemId = 1;
const DEFAULT_MELEE_WEAPON = WEAPON_TYPES.TRAINING_BLADE;
const DEFAULT_THROW_WEAPON = WEAPON_TYPES.PRACTICE_THROWER;

function createItemId() {
    return `item:${nextItemId++}`;
}

function expToNextLevel(level) {
    const safeLevel = Math.max(1, level | 0);
    return Math.floor(100 * Math.pow(1.22, safeLevel - 1));
}

function getGlyphAdditiveBonus(player, statKey) {
    if (!player || !Array.isArray(player.equippedGlyphs)) return 0;
    let bonus = 0;
    for (const glyph of player.equippedGlyphs) {
        if (!glyph || glyph.type !== "glyph") continue;
        if (glyph.stat !== statKey) continue;
        if (!Number.isFinite(glyph.percentBoost)) continue;
        bonus += glyph.percentBoost;
    }
    return Math.max(0, bonus);
}

function getEquippedWeapon(player) {
    const weapon = player?.equippedWeapon;
    if (!weapon || weapon.type !== "weapon") return null;
    if (weapon.weaponClass !== player.playerClass) return null;
    return weapon;
}

function getEnemyLevelMultiplier(level) {
    const safeLevel = Math.max(1, level | 0);
    return Math.pow(2, (safeLevel - 1) / 10);
}

function applyPlayerDerivedStats(player) {
    if (!player || player.type !== "player") return;
    const healthPoints = player.stats?.health || 0;
    const speedPoints = player.stats?.speed || 0;
    const healthGlyphBonus = getGlyphAdditiveBonus(player, "health");
    const speedGlyphBonus = getGlyphAdditiveBonus(player, "speed");

    const oldMax = player.maxHealth;
    const baseMax = player.baseMaxHealth + (healthPoints * STAT_HEALTH_GAIN);
    const baseSpeed = player.baseSpeed + (speedPoints * STAT_SPEED_GAIN);
    player.maxHealth = Math.max(1, Math.floor(baseMax * (1 + healthGlyphBonus)));
    player.speed = baseSpeed * (1 + speedGlyphBonus);
    if (!Number.isFinite(player.health)) {
        player.health = player.maxHealth;
    } 
    player.health = Math.max(0, Math.min(player.health, player.maxHealth));
}

function getPlayerAttackSpeedScale(player) {
    const points = player?.stats?.attackSpeed || 0;
    return Math.max(ATTACK_SPEED_MIN_SCALE, 1 - (points * STAT_ATTACK_SPEED_GAIN));
}

function getPlayerDamageMultiplier(player) {
    const points = player?.stats?.damage || 0;
    const glyphBonus = getGlyphAdditiveBonus(player, "damage");
    return 1 + (points * STAT_DAMAGE_GAIN) + glyphBonus;
}

function grantExp(player, amount, nowMs) {
    if (!player || player.type !== "player" || !Number.isFinite(amount) || amount <= 0) return;

    player.exp += amount;
    while (player.exp >= player.expToNext) {
        player.exp -= player.expToNext;
        player.level += 1;
        player.skillPoints += 1;
        player.expToNext = expToNextLevel(player.level);
    }

    expGainEvents.push({
        id: `xp:${player.id}:${nowMs}:${Math.random().toString(16).slice(2)}`,
        playerId: player.id,
        amount: Math.floor(amount),
        createdAt: nowMs,
        expiresAt: nowMs + EXP_POPUP_MS,
    });
}

function markEnemyHit(enemy, damage, attackerId, nowMs) {
    if (!enemy || enemy.type !== "enemy" || enemy.health <= 0) return;
    const appliedDamage = Math.max(0, Math.min(enemy.health, Number.isFinite(damage) ? damage : 0));
    enemy.lastHitBy = attackerId || null;
    enemy.takeDamage(damage);
    if (!attackerId || appliedDamage <= 0) return;

    damageEvents.push({
        id: `dmg:${attackerId}:${enemy.id}:${nowMs}:${Math.random().toString(16).slice(2)}`,
        playerId: attackerId,
        amount: Math.floor(appliedDamage),
        x: enemy.x,
        y: enemy.y,
        createdAt: nowMs,
        expiresAt: nowMs + DAMAGE_POPUP_MS,
    });
}

export function spawnPlayer(id, x, y, playerClass = PLAYER_CLASSES.BLADE, name = "Player") {
    const player = new Player({
        id,
        x: x - PLAYER_RADIUS,
        y: y - PLAYER_RADIUS,
        radius: PLAYER_RADIUS,
        speed: PLAYER_SPEED,
        maxHealth: PLAYER_MAX_HEALTH,
        playerClass,
        name,
    });
    player.spawnX = player.x;
    player.spawnY = player.y;
    player.respawnMs = PLAYER_RESPAWN_MS;
    player.expToNext = expToNextLevel(player.level);
    player.inventory = new Array(INVENTORY_SIZE).fill(null);
    player.hotbar = new Array(HOTBAR_SIZE).fill(null);
    player.equippedWeapon = null;
    player.equippedGlyphs = new Array(GLYPH_SLOTS).fill(null);
    player.selectedHotbarIndex = 0;

    const starterItems = createStarterItems(createItemId);
    for (let i = 0; i < starterItems.length && i < player.inventory.length; i += 1) {
        player.inventory[i] = starterItems[i];
    }

    const starterWeaponIndex = player.inventory.findIndex((item) => item?.type === "weapon" && item.weaponClass === player.playerClass);
    if (starterWeaponIndex >= 0) {
        player.equippedWeapon = player.inventory[starterWeaponIndex];
        player.inventory[starterWeaponIndex] = null;
    }
    applyPlayerDerivedStats(player);
    return player;
}

export function spawnEnemy(id, x, y, options = {}) {
    const parsedLevel = Number(options.level);
    const enemyLevel = Math.max(1, Number.isFinite(parsedLevel) ? Math.floor(parsedLevel) : 1);
    const enemyName = typeof options.name === "string" && options.name.trim() ? options.name.trim() : "Enemy";
    const levelMult = getEnemyLevelMultiplier(enemyLevel);
    const scaledHealth = Math.max(1, Math.floor(ENEMY_MAX_HEALTH * levelMult));
    const scaledExpReward = Math.max(1, Math.floor(ENEMY_EXP_REWARD * levelMult));

    const enemy = new Enemy({
        id,
        x,
        y,
        name: enemyName,
        level: enemyLevel,
        radius: ENEMY_RADIUS,
        speed: ENEMY_SPEED,
        maxHealth: scaledHealth,
    });
    enemy.expReward = scaledExpReward;
    enemy.respawnMs = ENEMY_RESPAWN_MS;
    enemy.lastHitBy = null;
    enemy.contactDamage = CONTACT_DAMAGE;
    return enemy;
}

export function getPlayerSpawn(level) {

}

export function applyInput(player, inputMsg) {
    if (!player || typeof player.applyInput !== "function") return;
    player.applyInput(inputMsg);
}

export function applySkillUpgrade(player, statKey) {
    if (!player || player.type !== "player") return false;
    if (!player.stats || player.skillPoints <= 0) return false;
    if (!Object.prototype.hasOwnProperty.call(player.stats, statKey)) return false;

    player.stats[statKey] += 1;
    player.skillPoints -= 1;
    applyPlayerDerivedStats(player);
    return true;
}

function isValidSlotIndex(index, size) {
    return Number.isInteger(index) && index >= 0 && index < size;
}

function getSlotRef(player, location) {
    if (!player || !location || typeof location !== "object") return null;
    const kind = location.kind;
    const index = location.index;

    if (kind === "inventory") {
        if (!isValidSlotIndex(index, INVENTORY_SIZE)) return null;
        return {
            get: () => player.inventory[index],
            set: (value) => { player.inventory[index] = value || null; },
        };
    }
    if (kind === "hotbar") {
        if (!isValidSlotIndex(index, HOTBAR_SIZE)) return null;
        return {
            get: () => player.hotbar[index],
            set: (value) => { player.hotbar[index] = value || null; },
        };
    }
    if (kind === "weapon") {
        return {
            get: () => player.equippedWeapon,
            set: (value) => { player.equippedWeapon = value || null; },
        };
    }
    if (kind === "glyph") {
        if (!isValidSlotIndex(index, GLYPH_SLOTS)) return null;
        return {
            get: () => player.equippedGlyphs[index],
            set: (value) => { player.equippedGlyphs[index] = value || null; },
        };
    }
    return null;
}

function itemFitsLocation(player, item, location) {
    if (!location) return false;
    if (!item) return true;

    if (location.kind === "weapon") {
        return item.type === "weapon" && item.weaponClass === player.playerClass;
    }
    if (location.kind === "glyph") {
        return item.type === "glyph" && GLYPH_STAT_KEYS.has(item.stat);
    }
    return location.kind === "inventory" || location.kind === "hotbar";
}

function sameLocation(a, b) {
    if (!a || !b) return false;
    return a.kind === b.kind && a.index === b.index;
}

function sanitizeHotbarIndex(value) {
    const idx = Number(value);
    if (!Number.isInteger(idx)) return null;
    if (idx < 0 || idx >= HOTBAR_SIZE) return null;
    return idx;
}

export function applyInventoryAction(player, payload) {
    if (!player || player.type !== "player" || !payload || typeof payload !== "object") return false;
    const action = payload.action;

    if (action === "selectHotbar") {
        const idx = sanitizeHotbarIndex(payload.index);
        if (idx === null) return false;
        player.selectedHotbarIndex = idx;
        return true;
    }

    if (action !== "swap") return false;

    const from = payload.from;
    const to = payload.to;
    if (sameLocation(from, to)) return false;

    const fromRef = getSlotRef(player, from);
    const toRef = getSlotRef(player, to);
    if (!fromRef || !toRef) return false;

    const sourceItem = fromRef.get();
    const targetItem = toRef.get();
    if (!sourceItem) return false;
    if (!itemFitsLocation(player, sourceItem, to)) return false;
    if (!itemFitsLocation(player, targetItem, from)) return false;

    fromRef.set(targetItem || null);
    toRef.set(sourceItem || null);
    applyPlayerDerivedStats(player);
    return true;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function circleOverlaps(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const rr = ar + br;
    return (dx * dx) + (dy * dy) <= rr * rr;
}

function distanceSqPointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = (abx * abx) + (aby * aby);

    if (abLenSq <= 0.000001) {
        const dx = px - ax;
        const dy = py - ay;
        return (dx * dx) + (dy * dy);
    }

    const t = clamp01(((apx * abx) + (apy * aby)) / abLenSq);
    const cx = ax + (abx * t);
    const cy = ay + (aby * t);
    const dx = px - cx;
    const dy = py - cy;
    return (dx * dx) + (dy * dy);
}

function makeSlashSegment(owner, slash, nowMs) {
    const elapsedMs = nowMs - slash.startedAt;
    const progress = clamp01(elapsedMs / slash.durationMs);

    const accelBias = 0.2;
    const eased = progress + (accelBias * ((progress * progress) - progress));

    const swingAngle = owner.angle + slash.startOffset + ((slash.endOffset - slash.startOffset) * eased);
    const innerX = owner.x + (Math.cos(swingAngle) * slash.innerRange);
    const innerY = owner.y + (Math.sin(swingAngle) * slash.innerRange);
    const outerX = owner.x + (Math.cos(swingAngle) * slash.outerRange);
    const outerY = owner.y + (Math.sin(swingAngle) * slash.outerRange);

    return {
        progress,
        innerX,
        innerY,
        outerX,
        outerY,
        angle: swingAngle,
    };
}

function queueMeleeSlash(player, nowMs) {
    const weapon = getEquippedWeapon(player);
    if (!weapon || weapon.attackKind !== "melee") return;
    const baseCooldown = Number.isFinite(weapon.cooldownMs) ? weapon.cooldownMs : DEFAULT_MELEE_WEAPON.cooldownMs;
    const cooldown = baseCooldown * getPlayerAttackSpeedScale(player);
    const lastMeleeAt = Number.isFinite(player.lastMeleeAt) ? player.lastMeleeAt : -Infinity;
    if (nowMs - lastMeleeAt < cooldown) return;

    player.lastMeleeAt = nowMs;
    activeSlashes.push({
        id: `slash:${nextSlashId++}`,
        ownerId: player.id,
        startedAt: nowMs,
        durationMs: MELEE_SWING_DURATION_MS,
        startOffset: MELEE_SWING_START_OFFSET,
        endOffset: MELEE_SWING_END_OFFSET,
        innerRange: MELEE_SWING_INNER_RANGE,
        outerRange: MELEE_SWING_OUTER_RANGE,
        thickness: MELEE_SWING_THICKNESS,
        damage: (Number.isFinite(weapon.damage) ? weapon.damage : DEFAULT_MELEE_WEAPON.damage) * getPlayerDamageMultiplier(player),
        hitEnemies: new Set(),
        spriteKey: null,
    });
}

function queueThrowProjectile(player, nowMs) {
    const weapon = getEquippedWeapon(player);
    if (!weapon || weapon.attackKind !== "throw") return;
    const baseCooldown = Number.isFinite(weapon.cooldownMs) ? weapon.cooldownMs : DEFAULT_THROW_WEAPON.cooldownMs;
    const cooldown = baseCooldown * getPlayerAttackSpeedScale(player);
    const lastThrowAt = Number.isFinite(player.lastThrowAt) ? player.lastThrowAt : -Infinity;
    if (nowMs - lastThrowAt < cooldown) return;

    player.lastThrowAt = nowMs;
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const spawnDistance = (player.radius || PLAYER_RADIUS) + THROW_PROJECTILE_RADIUS + 2;
    activeProjectiles.push({
        id: `proj:${nextProjectileId++}`,
        ownerId: player.id,
        x: player.x + (dirX * spawnDistance),
        y: player.y + (dirY * spawnDistance),
        dirX,
        dirY,
        speed: THROW_PROJECTILE_SPEED,
        remainingRange: THROW_PROJECTILE_RANGE,
        radius: THROW_PROJECTILE_RADIUS,
        damage: (Number.isFinite(weapon.damage) ? weapon.damage : DEFAULT_THROW_WEAPON.damage) * getPlayerDamageMultiplier(player),
        angle: player.angle,
        spriteKey: null,
    });
}

function scheduleEnemyRespawn(enemy, nowMs) {
    if (!enemy || !enemy.id) return;
    if (pendingEnemyRespawns.some((r) => r.id === enemy.id)) return;
    pendingEnemyRespawns.push({
        id: enemy.id,
        x: enemy.spawnX,
        y: enemy.spawnY,
        name: enemy.name,
        level: enemy.level,
        respawnAt: nowMs + (enemy.respawnMs || ENEMY_RESPAWN_MS),
    });
}

function processEnemyDeaths(entitiesById, nowMs) {
    for (const entity of entitiesById.values()) {
        if (!entity || entity.type !== "enemy" || entity.health > 0) continue;

        if (entity.lastHitBy) {
            const killer = entitiesById.get(entity.lastHitBy);
            if (killer && killer.type === "player") {
                grantExp(killer, entity.expReward || ENEMY_EXP_REWARD, nowMs);
            }
        }

        scheduleEnemyRespawn(entity, nowMs);
        entitiesById.delete(entity.id);
    }
}

function processEnemyRespawns(entitiesById, nowMs) {
    for (let i = pendingEnemyRespawns.length - 1; i >= 0; i -= 1) {
        const respawn = pendingEnemyRespawns[i];
        if (nowMs < respawn.respawnAt) continue;
        const enemy = spawnEnemy(respawn.id, respawn.x, respawn.y, {
            name: respawn.name,
            level: respawn.level,
        });
        entitiesById.set(enemy.id, enemy);
        pendingEnemyRespawns.splice(i, 1);
    }
}

function schedulePlayerRespawn(player, nowMs) {
    if (!player || player.type !== "player" || player.health > 0) return;
    if (pendingPlayerRespawns.some((respawn) => respawn.id === player.id)) return;

    pendingPlayerRespawns.push({
        id: player.id,
        respawnAt: nowMs + (player.respawnMs || PLAYER_RESPAWN_MS),
    });
}

function processPlayerRespawns(entitiesById, nowMs) {
    for (let i = pendingPlayerRespawns.length - 1; i >= 0; i -= 1) {
        const respawn = pendingPlayerRespawns[i];
        if (nowMs < respawn.respawnAt) continue;

        const player = entitiesById.get(respawn.id);
        if (!player || player.type !== "player") {
            pendingPlayerRespawns.splice(i, 1);
            continue;
        }

        player.x = Number.isFinite(player.spawnX) ? player.spawnX : player.x;
        player.y = Number.isFinite(player.spawnY) ? player.spawnY : player.y;
        player.health = player.maxHealth;
        player.lastDamageAt = nowMs;
        player.pendingMeleeAttack = false;
        player.pendingThrowAttack = false;
        player.input = { up: false, down: false, left: false, right: false, aim: player.input?.aim || 0 };

        pendingPlayerRespawns.splice(i, 1);
    }
}

export function stepWorld(entitiesById, dt) {
    const entities = Array.from(entitiesById.values());
    const alivePlayers = entities.filter((e) => e && e.type === "player" && e.health > 0);
    const enemies = entities.filter((e) => e && e.type === "enemy" && e.health > 0);

    for (const entity of entities) {
        if (!entity || typeof entity.step !== "function") continue;
        if (entity.type === "enemy") {
            entity.step(dt, alivePlayers);
            continue;
        }
        entity.step(dt);
    }

    const nowMs = Date.now();
    for (const player of alivePlayers) {
        if (player.pendingMeleeAttack) {
            queueMeleeSlash(player, nowMs);
            player.pendingMeleeAttack = false;
        }
        if (player.pendingThrowAttack) {
            queueThrowProjectile(player, nowMs);
            player.pendingThrowAttack = false;
        }
    }

    for (let i = activeSlashes.length - 1; i >= 0; i -= 1) {
        const slash = activeSlashes[i];
        const owner = entitiesById.get(slash.ownerId);
        if (!owner || owner.health <= 0) {
            activeSlashes.splice(i, 1);
            continue;
        }

        const segment = makeSlashSegment(owner, slash, nowMs);
        slash.renderState = {
            id: slash.id,
            ownerId: slash.ownerId,
            x1: segment.innerX,
            y1: segment.innerY,
            x2: segment.outerX,
            y2: segment.outerY,
            thickness: slash.thickness,
            progress: segment.progress,
            angle: segment.angle,
            spriteKey: slash.spriteKey,
        };

        for (const enemy of enemies) {
            if (enemy.health <= 0) continue;
            if (slash.hitEnemies.has(enemy.id)) continue;
            const distSq = distanceSqPointToSegment(
                enemy.x,
                enemy.y,
                segment.innerX,
                segment.innerY,
                segment.outerX,
                segment.outerY
            );
            const hitRadius = (enemy.radius || ENEMY_RADIUS) + slash.thickness;
            if (distSq > hitRadius * hitRadius) continue;
            slash.hitEnemies.add(enemy.id);
            markEnemyHit(enemy, slash.damage, slash.ownerId, nowMs);
        }

        if (segment.progress >= 1) {
            activeSlashes.splice(i, 1);
        }
    }

    for (let i = activeProjectiles.length - 1; i >= 0; i -= 1) {
        const projectile = activeProjectiles[i];
        const travelDistance = projectile.speed * dt;
        projectile.x += projectile.dirX * travelDistance;
        projectile.y += projectile.dirY * travelDistance;
        projectile.angle = Math.atan2(projectile.dirY, projectile.dirX);
        projectile.remainingRange -= travelDistance;

        let shouldRemove = projectile.remainingRange <= 0;
        if (!shouldRemove) {
            for (const enemy of enemies) {
                if (!enemy || enemy.health <= 0) continue;
                if (!circleOverlaps(
                    projectile.x,
                    projectile.y,
                    projectile.radius,
                    enemy.x,
                    enemy.y,
                    enemy.radius || ENEMY_RADIUS
                )) {
                    continue;
                }
                markEnemyHit(enemy, projectile.damage, projectile.ownerId, nowMs);
                shouldRemove = true;
                break;
            }
        }

        if (shouldRemove) {
            activeProjectiles.splice(i, 1);
        }
    }

    processEnemyDeaths(entitiesById, nowMs);
    processEnemyRespawns(entitiesById, nowMs);

    for (const entity of entitiesById.values()) {
        if (!entity || entity.type !== "player") continue;
        if (entity.health > 0) continue;
        schedulePlayerRespawn(entity, nowMs);
    }
    processPlayerRespawns(entitiesById, nowMs);

    for (const enemy of enemies) {
        if (!enemy || enemy.health <= 0) continue;
        for (const player of alivePlayers) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const touchDistance = (player.radius || 0) + (enemy.radius || 0);
            if ((dx * dx) + (dy * dy) > touchDistance * touchDistance) continue;

            if (nowMs - player.lastDamageAt < PLAYER_IFRAMES_MS) continue;
            player.lastDamageAt = nowMs;
            player.takeDamage(enemy.contactDamage || CONTACT_DAMAGE);
        }
    }

    for (let i = expGainEvents.length - 1; i >= 0; i -= 1) {
        if (expGainEvents[i].expiresAt <= nowMs) {
            expGainEvents.splice(i, 1);
        }
    }
    for (let i = damageEvents.length - 1; i >= 0; i -= 1) {
        if (damageEvents[i].expiresAt <= nowMs) {
            damageEvents.splice(i, 1);
        }
    }
}

export function makeSnapshot(entitiesById, nowMs) {
    const players = {};
    for (const entity of entitiesById.values()) {
        if (!entity || !entity.id) continue;
        players[entity.id] = typeof entity.toSnapshot === "function"
            ? entity.toSnapshot()
            : {
                id: entity.id,
                x: entity.x,
                y: entity.y,
                angle: entity.angle,
                radius: entity.radius,
                color: entity.color,
            };
    }
    return {
        t: nowMs,
        players,
        projectiles: activeProjectiles.map((projectile) => ({
            id: projectile.id,
            x: projectile.x,
            y: projectile.y,
            radius: projectile.radius,
            angle: projectile.angle,
            spriteKey: projectile.spriteKey,
            ownerId: projectile.ownerId,
        })),
        slashes: activeSlashes
            .map((slash) => slash.renderState)
            .filter(Boolean),
        expEvents: expGainEvents.map((evt) => ({
            id: evt.id,
            playerId: evt.playerId,
            amount: evt.amount,
            createdAt: evt.createdAt,
            expiresAt: evt.expiresAt,
        })),
        damageEvents: damageEvents.map((evt) => ({
            id: evt.id,
            playerId: evt.playerId,
            amount: evt.amount,
            x: evt.x,
            y: evt.y,
            createdAt: evt.createdAt,
            expiresAt: evt.expiresAt,
        })),
    };
}

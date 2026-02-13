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

export const PLAYER_CLASSES = {
    BLADE: "blade",
    THROWER: "thrower",
};

export const WEAPON_CLASS_BY_ATTACK = {
    melee: PLAYER_CLASSES.BLADE,
    throw: PLAYER_CLASSES.THROWER,
};

const MELEE_COOLDOWN_MS = 900;
const MELEE_SWING_DURATION_MS = 400;
const MELEE_SWING_START_OFFSET = -1.2;
const MELEE_SWING_END_OFFSET = 1.2;
const MELEE_SWING_INNER_RANGE = 14;
const MELEE_SWING_OUTER_RANGE = 82;
const MELEE_SWING_THICKNESS = 10;
const MELEE_DAMAGE = 20;

const THROW_COOLDOWN_MS = 350;
const THROW_DAMAGE = 16;
const THROW_PROJECTILE_SPEED = 520;
const THROW_PROJECTILE_RANGE = 520;
const THROW_PROJECTILE_RADIUS = 6;

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

let nextProjectileId = 1;
let nextSlashId = 1;
const activeProjectiles = [];
const activeSlashes = [];
const pendingEnemyRespawns = [];
const expGainEvents = [];
const damageEvents = [];

function expToNextLevel(level) {
    const safeLevel = Math.max(1, level | 0);
    return Math.floor(100 * Math.pow(1.22, safeLevel - 1));
}

function getEnemyLevelMultiplier(level) {
    const safeLevel = Math.max(1, level | 0);
    return Math.pow(2, (safeLevel - 1) / 10);
}

function applyPlayerDerivedStats(player) {
    if (!player || player.type !== "player") return;
    const healthPoints = player.stats?.health || 0;
    const speedPoints = player.stats?.speed || 0;

    const oldMax = player.maxHealth;
    player.maxHealth = player.baseMaxHealth + (healthPoints * STAT_HEALTH_GAIN);
    player.speed = player.baseSpeed + (speedPoints * STAT_SPEED_GAIN);
    if (!Number.isFinite(player.health)) {
        player.health = player.maxHealth;
    } else if (player.maxHealth > oldMax) {
        player.health += (player.maxHealth - oldMax);
    }
    player.health = Math.max(0, Math.min(player.health, player.maxHealth));
}

function getPlayerAttackSpeedScale(player) {
    const points = player?.stats?.attackSpeed || 0;
    return Math.max(ATTACK_SPEED_MIN_SCALE, 1 - (points * STAT_ATTACK_SPEED_GAIN));
}

function getPlayerDamageMultiplier(player) {
    const points = player?.stats?.damage || 0;
    return 1 + (points * STAT_DAMAGE_GAIN);
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

export function spawnPlayer(id, x, y, playerClass = PLAYER_CLASSES.BLADE) {
    const player = new Player({
        id,
        x: x - PLAYER_RADIUS,
        y: y - PLAYER_RADIUS,
        radius: PLAYER_RADIUS,
        speed: PLAYER_SPEED,
        maxHealth: PLAYER_MAX_HEALTH,
        playerClass,
    });
    player.expToNext = expToNextLevel(player.level);
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
    if (!player || player.playerClass !== WEAPON_CLASS_BY_ATTACK.melee) return;
    const cooldown = MELEE_COOLDOWN_MS * getPlayerAttackSpeedScale(player);
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
        damage: MELEE_DAMAGE * getPlayerDamageMultiplier(player),
        hitEnemies: new Set(),
        spriteKey: null,
    });
}

function queueThrowProjectile(player, nowMs) {
    if (!player || player.playerClass !== WEAPON_CLASS_BY_ATTACK.throw) return;
    const cooldown = THROW_COOLDOWN_MS * getPlayerAttackSpeedScale(player);
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
        damage: THROW_DAMAGE * getPlayerDamageMultiplier(player),
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

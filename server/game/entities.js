export class Entity {
    constructor({
        id,
        x = 0,
        y = 0,
        angle = 0,
        radius = 18,
        color = "#4aa3ff",
        speed = 0,
        type = "entity",
        maxHealth = 100,
        health = maxHealth,
    } = {}) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.radius = radius;
        this.color = color;
        this.speed = speed;
        this.type = type;
        this.maxHealth = maxHealth;
        this.health = Math.max(0, Math.min(health, maxHealth));
    }

    normalizeAngle(angle) {
        let a = angle;
        if (a > Math.PI) a = ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
        if (a < -Math.PI) a = ((a - Math.PI) % (2 * Math.PI)) + Math.PI;
        return a;
    }

    moveNormalized(vx, vy, dt, speed = this.speed) {
        if (vx === 0 && vy === 0) return;

        const len = Math.hypot(vx, vy);
        if (len === 0) return;

        this.x += (vx / len) * speed * dt;
        this.y += (vy / len) * speed * dt;
    }

    step(_dt) {}

    takeDamage(amount) {
        if (!Number.isFinite(amount) || amount <= 0) return;
        this.health = Math.max(0, this.health - amount);
    }

    toSnapshot() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            angle: this.angle,
            radius: this.radius,
            color: this.color,
            type: this.type,
            health: this.health,
            maxHealth: this.maxHealth,
        };
    }
}

export const PLAYER_CLASSES = {
    BLADE: "blade",
    THROWER: "thrower",
};

function randomPlayerColor() {
    const colors = ["#4aa3ff", "#ff6b6b", "#7CFF6B", "#ffd166", "#b388ff"];
    return colors[(Math.random() * colors.length) | 0];
}

export class Player extends Entity {
    constructor({
        id,
        x = 0,
        y = 0,
        angle = 0,
        radius = 18,
        color = randomPlayerColor(),
        speed = 220,
        maxHealth = 100,
        playerClass = PLAYER_CLASSES.BLADE,
        name = "Player",
    } = {}) {
        super({
            id,
            x,
            y,
            angle,
            radius,
            color,
            speed,
            type: "player",
            maxHealth,
            health: maxHealth,
        });

        this.input = { up: false, down: false, left: false, right: false, aim: 0 };
        this.lastInputSeq = 0;
        this.lastDamageAt = -Infinity;
        this.playerClass = playerClass;
        this.name = typeof name === "string" && name.trim() ? name.trim() : "Player";
        this.pendingMeleeAttack = false;
        this.pendingThrowAttack = false;
        this.baseMaxHealth = maxHealth;
        this.baseSpeed = speed;
        this.level = 1;
        this.exp = 0;
        this.expToNext = 100;
        this.skillPoints = 0;
        this.stats = {
            health: 0,
            damage: 0,
            speed: 0,
            attackSpeed: 0,
        };
        this.lastMeleeAt = -Infinity;
        this.lastThrowAt = -Infinity;
        this.inventory = [];
        this.hotbar = [];
        this.equippedWeapon = null;
        this.equippedGlyphs = [];
        this.selectedHotbarIndex = 0;
    }

    applyInput(inputMsg) {
        if (!inputMsg || typeof inputMsg !== "object") return;

        const seq = inputMsg.seq | 0;
        if (seq <= this.lastInputSeq) return;

        this.lastInputSeq = seq;
        this.input.up = !!inputMsg.up;
        this.input.down = !!inputMsg.down;
        this.input.right = !!inputMsg.right;
        this.input.left = !!inputMsg.left;

        if (Number.isFinite(inputMsg.aim)) {
            this.input.aim = this.normalizeAngle(inputMsg.aim);
        }
        if (inputMsg.attackMelee === true) {
            this.pendingMeleeAttack = true;
        }
        if (inputMsg.attackThrow === true) {
            this.pendingThrowAttack = true;
        }
    }

    step(dt) {
        if (this.health <= 0) return;

        let vx = 0;
        let vy = 0;

        if (this.input.up) vy -= 1;
        if (this.input.down) vy += 1;
        if (this.input.left) vx -= 1;
        if (this.input.right) vx += 1;

        this.moveNormalized(vx, vy, dt);
        this.angle = this.input.aim;
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
            playerClass: this.playerClass,
            name: this.name,
            level: this.level,
            exp: this.exp,
            expToNext: this.expToNext,
            skillPoints: this.skillPoints,
            stats: {
                health: this.stats.health,
                damage: this.stats.damage,
                speed: this.stats.speed,
                attackSpeed: this.stats.attackSpeed,
            },
            inventory: Array.isArray(this.inventory) ? this.inventory : [],
            hotbar: Array.isArray(this.hotbar) ? this.hotbar : [],
            equippedWeapon: this.equippedWeapon || null,
            equippedGlyphs: Array.isArray(this.equippedGlyphs) ? this.equippedGlyphs : [],
            selectedHotbarIndex: Number.isFinite(this.selectedHotbarIndex) ? this.selectedHotbarIndex : 0,
        };
    }
}

export class Enemy extends Entity {
    constructor({
        id,
        x = 0,
        y = 0,
        name = "Enemy",
        level = 1,
        angle = 0,
        radius = 16,
        color = "#ff6b6b",
        speed = 120,
        maxHealth = 40,
        maxDistanceFromSpawn = 300,
        aggroRange = 260     // range where enemy starts to chase player
    } = {}) {
        super({
            id,
            x,
            y,
            angle,
            radius,
            color,
            speed,
            type: "enemy",
            maxHealth,
            health: maxHealth,
        });

        this.spawnX = this.x;
        this.spawnY = this.y;
        this.name = typeof name === "string" && name.trim() ? name.trim() : "Enemy";
        this.level = Math.max(1, Number.isFinite(level) ? Math.floor(level) : 1);
        this.maxDistanceFromSpawn = maxDistanceFromSpawn;
        this.behavior = "idle"; // can be 'idle' or 'chasing'
        this.aggroRange = aggroRange;
        this.targetId = null; // currently chased player id, or null
    }

    toSnapshot() {
        return {
            ...super.toSnapshot(),
            name: this.name,
            level: this.level,
        };
    }

    step(dt, players = []) {
        if (this.health <= 0) return;

        let closestPlayer = null;
        let closestDistSq = Infinity;

        for (const player of players) {
            if (!player || player.type !== "player" || player.health <= 0) continue;
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const distSq = (dx * dx) + (dy * dy);
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closestPlayer = player;
            }
        }

        if (this.behavior === "idle") {
            if (
                closestPlayer &&
                Math.sqrt(closestDistSq) <= this.aggroRange
            ) {
                this.behavior = "chasing";
                this.targetId = closestPlayer.id;
            } else {
                const dsx = this.spawnX - this.x;
                const dsy = this.spawnY - this.y;
                const distToSpawnSq = dsx * dsx + dsy * dsy;
                if (distToSpawnSq > 1) {
                    this.moveNormalized(dsx, dsy, dt);
                    this.angle = Math.atan2(dsy, dsx);
                }
                return;
            }
        }

        if (this.behavior === "chasing") {
            let target = players.find(
                (p) => p && p.type === "player" && p.health > 0 && p.id === this.targetId
            );
            if (
                !target ||
                Math.sqrt((target.x - this.x) ** 2 + (target.y - this.y) ** 2) > this.aggroRange
            ) {
                if (
                    closestPlayer &&
                    Math.sqrt(closestDistSq) <= this.aggroRange
                ) {
                    this.targetId = closestPlayer.id;
                    target = closestPlayer;
                } else {
                    this.behavior = "idle";
                    this.targetId = null;
                    return;
                }
            }

            const vx = target.x - this.x;
            const vy = target.y - this.y;
            this.moveNormalized(vx, vy, dt);
            this.angle = Math.atan2(vy, vx);
        }
    }
}

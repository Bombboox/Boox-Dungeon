export const GLYPH_STATS = Object.freeze({
    DAMAGE: "damage",
    SPEED: "speed",
    HEALTH: "health",
});

export const GLYPH_STAT_KEYS = new Set(Object.values(GLYPH_STATS));

export const WEAPON_TYPES = Object.freeze({
    TRAINING_BLADE: Object.freeze({
        key: "TRAINING_BLADE",
        name: "Training Blade",
        weaponClass: "blade",
        attackKind: "melee",
        damage: 20,
        cooldownMs: 900,
    }),
    PRACTICE_THROWER: Object.freeze({
        key: "PRACTICE_THROWER",
        name: "Practice Thrower",
        weaponClass: "thrower",
        attackKind: "throw",
        damage: 16,
        cooldownMs: 350,
    }),
});

export const GLYPH_TYPES = Object.freeze({
    LESSER_DAMAGE: Object.freeze({
        key: "LESSER_DAMAGE",
        name: "Lesser Damage Glyph",
        stat: GLYPH_STATS.DAMAGE,
        percentBoost: 0.1,
    }),
    LESSER_SPEED: Object.freeze({
        key: "LESSER_SPEED",
        name: "Lesser Speed Glyph",
        stat: GLYPH_STATS.SPEED,
        percentBoost: 0.1,
    }),
    LESSER_HEALTH: Object.freeze({
        key: "LESSER_HEALTH",
        name: "Lesser Health Glyph",
        stat: GLYPH_STATS.HEALTH,
        percentBoost: 0.1,
    }),
});

function createWeaponItem(type, id) {
    return {
        id,
        type: "weapon",
        name: type.name,
        weaponClass: type.weaponClass,
        attackKind: type.attackKind,
        damage: type.damage,
        cooldownMs: type.cooldownMs,
    };
}

function createGlyphItem(type, id) {
    return {
        id,
        type: "glyph",
        name: type.name,
        stat: type.stat,
        percentBoost: type.percentBoost,
    };
}

export function createStarterItems(createId) {
    if (typeof createId !== "function") return [];
    return [
        createWeaponItem(WEAPON_TYPES.TRAINING_BLADE, createId()),
        createWeaponItem(WEAPON_TYPES.PRACTICE_THROWER, createId()),
        createGlyphItem(GLYPH_TYPES.LESSER_DAMAGE, createId()),
        createGlyphItem(GLYPH_TYPES.LESSER_SPEED, createId()),
        createGlyphItem(GLYPH_TYPES.LESSER_HEALTH, createId()),
    ];
}

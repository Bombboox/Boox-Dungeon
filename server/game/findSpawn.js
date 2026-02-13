import fs from "fs";
import path from "path";
const LEVEL_SCALE = 4;

export function loadLdtkJsonSync(ldtkPath) {
  const raw = fs.readFileSync(ldtkPath, "utf8");
  return JSON.parse(raw);
}

export function findPlayerSpawn(project, levelIdOrIdentifier) {
  const level = project.levels.find(
    (l) => l.identifier === levelIdOrIdentifier || l.iid === levelIdOrIdentifier
  );
  if (!level) throw new Error(`Level not found: ${levelIdOrIdentifier}`);

  const entitiesLayer = (level.layerInstances || []).find(li => li.__identifier === "Entities");
  if (!entitiesLayer) throw new Error(`Entities layer not found in level ${level.identifier}`);

  const spawn = (entitiesLayer.entityInstances || []).find(e => e.__identifier === "PlayerSpawn");
  if (!spawn) throw new Error(`PlayerSpawn not found in level ${level.identifier}`);

  const xLocal = spawn.px[0] + (spawn.width ?? 0) / 2;
  const yLocal = spawn.px[1] + (spawn.height ?? 0) / 2;

  const worldX = (level.worldX ?? 0) + xLocal;
  const worldY = (level.worldY ?? 0) + yLocal;

  return {
    x: worldX * LEVEL_SCALE,
    y: worldY * LEVEL_SCALE,
  };
}

function findLevel(project, levelIdOrIdentifier) {
  return project.levels.find(
    (l) => l.identifier === levelIdOrIdentifier || l.iid === levelIdOrIdentifier
  );
}

function getEntityFieldValue(entity, fieldId, fallback = null) {
  const field = (entity?.fieldInstances || []).find((f) => f.__identifier === fieldId);
  if (!field) return fallback;
  return field.__value ?? fallback;
}

export function findEnemySpawns(project, levelIdOrIdentifier) {
  const level = findLevel(project, levelIdOrIdentifier);
  if (!level) throw new Error(`Level not found: ${levelIdOrIdentifier}`);

  const entitiesLayer = (level.layerInstances || []).find((li) => li.__identifier === "Entities");
  if (!entitiesLayer) throw new Error(`Entities layer not found in level ${level.identifier}`);

  const enemyInstances = (entitiesLayer.entityInstances || []).filter(
    (entity) => entity.__identifier === "EnemySpawn"
  );

  return enemyInstances.map((spawn) => {
    const xLocal = spawn.px[0] + (spawn.width ?? 0) / 2;
    const yLocal = spawn.px[1] + (spawn.height ?? 0) / 2;
    const worldX = (level.worldX ?? 0) + xLocal;
    const worldY = (level.worldY ?? 0) + yLocal;
    const rawName = getEntityFieldValue(spawn, "Name", "Enemy");
    const rawLevel = Number(getEntityFieldValue(spawn, "Level", 1));

    return {
      x: worldX * LEVEL_SCALE,
      y: worldY * LEVEL_SCALE,
      name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Enemy",
      level: Math.max(1, Number.isFinite(rawLevel) ? Math.floor(rawLevel) : 1),
    };
  });
}

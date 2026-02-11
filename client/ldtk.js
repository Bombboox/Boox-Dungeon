export const LEVEL_SCALE = 4;

export async function loadLdtkProject(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load LDtk JSON: ${res.status} ${res.statusText}`);
    return await res.json();
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
}

function dirname(path) {
    const i = path.lastIndexOf("/");
    return i === -1 ? "" : path.slice(0, i + 1);
}

export async function compileLdtkLevel(project, levelIdOrIdentifier, projectUrl) {
    const level =
      project.levels.find(l => l.identifier === levelIdOrIdentifier || l.iid === levelIdOrIdentifier);

    if (!level) throw new Error(`Level not found: ${levelIdOrIdentifier}`);

    // Grab layer instances by name
    const tilesLayer = level.layerInstances?.find(li => li.__identifier === "BackgroundTiles");
    const entitiesLayer = level.layerInstances?.find(li => li.__identifier === "Entities");

    if (!tilesLayer) throw new Error(`Tiles layer not found in level ${level.identifier}`);

    const gridSize = tilesLayer.__gridSize * LEVEL_SCALE;        // 32 in your file, scaled
    const levelPxW = level.pxWid * LEVEL_SCALE;                  // 864, scaled
    const levelPxH = level.pxHei * LEVEL_SCALE;                  // 256, scaled

    // Tileset
    const tilesetRel = tilesLayer.__tilesetRelPath; // "test grass.png"
    if (!tilesetRel) throw new Error("Tiles layer has no tileset relPath");

    const base = dirname(projectUrl);
    const tilesetUrl = base + tilesetRel; // assumes png sits next to JSON file
    const tilesetImg = await loadImage(tilesetUrl);

    // Render tiles from gridTiles
    // Each tile: { px:[x,y], src:[sx,sy], f, t, d, a }
    const tiles = (tilesLayer.gridTiles || []).map(t => ({
      x: t.px[0] * LEVEL_SCALE,
      y: t.px[1] * LEVEL_SCALE,
      sx: t.src[0],
      sy: t.src[1],
      size: gridSize,
      flip: t.f || 0,  // we’ll ignore flips for now (can add later)
      alpha: t.a ?? 1,
    }));

    // Extract spawn points (PlayerSpawn entities)
    const spawns = [];
    for (const ent of (entitiesLayer?.entityInstances || [])) {
      if (ent.__identifier === "PlayerSpawn") {
        const worldX = ((level.worldX ?? 0) + ent.px[0]) * LEVEL_SCALE;
        const worldY = ((level.worldY ?? 0) + ent.px[1]) * LEVEL_SCALE;

        spawns.push({
          type: "player",
          x: worldX,
          y: worldY,
        });
      }
    }

    const background = level.__bgColor;

    return {
      identifier: level.identifier,
      worldX: (level.worldX ?? 0) * LEVEL_SCALE,
      worldY: (level.worldY ?? 0) * LEVEL_SCALE,
      pxWid: levelPxW,
      pxHei: levelPxH,
      gridSize,
      background,

      tileset: {
        url: tilesetUrl,
        image: tilesetImg,
        tileSize: gridSize,
      },

      // Draw these (their positions are in level-local px)
      tiles, // local px positions

      // Spawns in WORLD coords (level.worldX + px)
      spawns,
    };
}

export function drawCompiledLevel(ctx, compiled, camera) {
    const img = compiled.tileset.image;
    const tileSize = compiled.tileset.tileSize;

    function worldToScreen(wx, wy) {
      return {
        x: Math.round((wx - camera.x) + camera.w / 2),
        y: Math.round((wy - camera.y) + camera.h / 2),
      };
    }
    
    for (const t of compiled.tiles) {
      const wx = compiled.worldX + t.x;
      const wy = compiled.worldY + t.y;

      const p = worldToScreen(wx, wy);

      if (t.alpha !== 1) {
        ctx.save();
        ctx.globalAlpha = t.alpha;
        ctx.drawImage(
          img,
          t.sx, t.sy, tileSize / LEVEL_SCALE, tileSize / LEVEL_SCALE, // src size, so this draws the original tile, not scaled up patch
          p.x, p.y, tileSize, tileSize // dest size: scaled up
        );
        ctx.restore();
      } else {
        ctx.drawImage(
          img,
          t.sx, t.sy, tileSize / LEVEL_SCALE, tileSize / LEVEL_SCALE,
          p.x, p.y, tileSize, tileSize
        );
      }
    }
}
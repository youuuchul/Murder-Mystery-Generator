import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(rootDir, envFile);
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const ASSET_BUCKET = process.env.SUPABASE_ASSETS_BUCKET?.trim() || "game-assets";
const APPLY = process.argv.includes("--apply");
const VARIANT_NAMES = ["thumb", "display", "large"];
const VARIANT_SUFFIX_RE = /\.(thumb|display|large)\.webp$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

const DEFAULT_CONFIGS = {
  thumb: { maxWidth: 480, maxHeight: 480, quality: 74 },
  display: { maxWidth: 1280, maxHeight: 1280, quality: 78 },
  large: { maxWidth: 2048, maxHeight: 2048, quality: 82 },
};

const SCOPE_CONFIGS = {
  covers: {
    thumb: { maxWidth: 560, maxHeight: 360, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 800, quality: 78 },
    large: { maxWidth: 1600, maxHeight: 1000, quality: 82 },
  },
  players: {
    thumb: { maxWidth: 320, maxHeight: 420, quality: 74 },
    display: { maxWidth: 720, maxHeight: 960, quality: 78 },
    large: { maxWidth: 1280, maxHeight: 1700, quality: 82 },
  },
  clues: {
    thumb: { maxWidth: 360, maxHeight: 480, quality: 74 },
    display: { maxWidth: 960, maxHeight: 1280, quality: 78 },
    large: { maxWidth: 1800, maxHeight: 2400, quality: 84 },
  },
  locations: {
    thumb: { maxWidth: 480, maxHeight: 360, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 960, quality: 78 },
    large: { maxWidth: 1600, maxHeight: 1200, quality: 82 },
  },
  rounds: {
    thumb: { maxWidth: 480, maxHeight: 300, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 800, quality: 78 },
    large: { maxWidth: 1920, maxHeight: 1200, quality: 82 },
  },
  story: {
    thumb: { maxWidth: 480, maxHeight: 480, quality: 74 },
    display: { maxWidth: 1280, maxHeight: 1280, quality: 78 },
    large: { maxWidth: 2048, maxHeight: 2048, quality: 82 },
  },
};

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Missing Supabase env. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  return { supabaseUrl, supabaseSecretKey };
}

function variantFilename(filename, variant) {
  const ext = path.extname(filename);
  const stem = ext ? filename.slice(0, -ext.length) : filename;
  return `${stem.replace(/\.(thumb|display|large)$/i, "")}.${variant}.webp`;
}

function getVariantConfig(scope, variant) {
  return SCOPE_CONFIGS[scope]?.[variant] || DEFAULT_CONFIGS[variant];
}

async function listAllObjects(supabase, prefix) {
  const queue = [prefix];
  const objects = [];

  while (queue.length > 0) {
    const currentPrefix = queue.shift();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(ASSET_BUCKET).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Failed to list ${currentPrefix}: ${error.message}`);
      }

      const entries = data || [];
      for (const entry of entries) {
        const objectPath = `${currentPrefix}/${entry.name}`;
        if (entry.id) {
          objects.push({ path: objectPath, name: entry.name, size: entry.metadata?.size || 0 });
        } else {
          queue.push(objectPath);
        }
      }

      if (entries.length < 100) {
        break;
      }

      offset += entries.length;
    }
  }

  return objects;
}

async function generateVariant(buffer, scope, filename, variant) {
  const metadata = await sharp(buffer, { failOn: "none" }).metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;
  const config = getVariantConfig(scope, variant);
  const resized = originalWidth > config.maxWidth || originalHeight > config.maxHeight;
  const output = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: config.maxWidth,
      height: config.maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality, effort: 4 })
    .toBuffer();

  if (output.length >= buffer.length && !resized) {
    return null;
  }

  if (output.length > buffer.length) {
    return null;
  }

  return {
    path: path.posix.join(path.posix.dirname(filename), variantFilename(path.posix.basename(filename), variant)),
    buffer: output,
  };
}

async function main() {
  const { supabaseUrl, supabaseSecretKey } = getEnv();
  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const gamePrefixes = await supabase.storage.from(ASSET_BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (gamePrefixes.error) {
    throw new Error(`Failed to list bucket root: ${gamePrefixes.error.message}`);
  }

  const objects = [];
  for (const entry of gamePrefixes.data || []) {
    if (!entry.id) {
      objects.push(...await listAllObjects(supabase, entry.name));
    }
  }

  const sourceObjects = objects.filter((object) => {
    const segments = object.path.split("/");
    const filename = segments[segments.length - 1] || "";
    return IMAGE_EXT_RE.test(filename) && !VARIANT_SUFFIX_RE.test(filename);
  });

  let scanned = 0;
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let planned = 0;

  for (const object of sourceObjects) {
    scanned += 1;
    const segments = object.path.split("/");
    const scope = segments[1] || "";
    const { data, error } = await supabase.storage.from(ASSET_BUCKET).download(object.path);

    if (error || !data) {
      failed += 1;
      console.error(`download failed: ${object.path} ${error?.message || ""}`);
      continue;
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    for (const variant of VARIANT_NAMES) {
      try {
        const generated = await generateVariant(buffer, scope, object.path, variant);
        if (!generated) {
          skipped += 1;
          continue;
        }

        if (!APPLY) {
          planned += 1;
          console.log(`would upload ${generated.path} (${Math.round(generated.buffer.length / 1024)}KB)`);
          continue;
        }

        const { error: uploadError } = await supabase.storage
          .from(ASSET_BUCKET)
          .upload(generated.path, generated.buffer, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: false,
          });

        if (uploadError) {
          if (uploadError.message.toLowerCase().includes("already exists")) {
            skipped += 1;
            continue;
          }

          throw uploadError;
        }

        uploaded += 1;
        console.log(`uploaded ${generated.path} (${Math.round(generated.buffer.length / 1024)}KB)`);
      } catch (error) {
        failed += 1;
        console.error(`variant failed: ${object.path} ${variant}`, error);
      }
    }
  }

  console.log(JSON.stringify({ bucket: ASSET_BUCKET, mode: APPLY ? "apply" : "dry-run", scanned, planned, uploaded, skipped, failed }, null, 2));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

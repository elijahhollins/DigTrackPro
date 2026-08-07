#!/usr/bin/env node
/**
 * Incremental mirror of Supabase Storage buckets into Cloudflare R2.
 *
 * Runs in CI only -- it needs the service_role key, which must never reach the browser bundle.
 *
 * Photos and job prints reach gigabytes, so this syncs incrementally: a manifest in R2 maps
 * each object path to its id/updated_at/size, and only new or changed objects are transferred.
 * Set FULL_VERIFY=true (weekly) to ignore the manifest and re-upload everything.
 *
 * Two Supabase Storage API behaviors this has to work around:
 *   1. `.list()` returns at most 100 entries by default -- it must be paged.
 *   2. `.list()` returns folder prefixes as rows with `id: null` -- they are not files and must
 *      be recursed into rather than downloaded.
 */

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
  R2_PREFIX = 'storage',
  FULL_VERIFY = 'false',
} = process.env;

for (const [key, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  R2_ENDPOINT,
  R2_BUCKET,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// `inbound-ticket-photos` is created from the browser at runtime (services/inboundTicketService.ts)
// rather than by a migration, so it may legitimately not exist yet. Missing buckets are skipped
// with a warning, not treated as a failure.
const BUCKETS = ['job-photos', 'job-prints', 'Ticket_Images', 'inbound-ticket-photos'];

const PAGE_SIZE = 100;
const STAGING = 'storage-staging';
const MANIFEST_KEY = `${R2_PREFIX}/manifest.json`;
const fullVerify = FULL_VERIFY === 'true';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const aws = (args) =>
  execFileSync('aws', [...args, '--endpoint-url', R2_ENDPOINT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

/** Recursively list every file in a bucket, paging through each directory level. */
async function listAll(bucket, prefix = '') {
  const files = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // A folder prefix, not an object. Recurse.
        files.push(...(await listAll(bucket, path)));
      } else {
        files.push({
          path,
          id: entry.id,
          updated_at: entry.updated_at ?? null,
          size: entry.metadata?.size ?? null,
        });
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return files;
}

function loadManifest() {
  if (fullVerify) {
    console.log('FULL_VERIFY is set - ignoring the manifest and re-uploading everything.');
    return {};
  }
  try {
    aws(['s3', 'cp', `s3://${R2_BUCKET}/${MANIFEST_KEY}`, 'manifest.json']);
    return JSON.parse(readFileSync('manifest.json', 'utf8'));
  } catch {
    console.log('No existing manifest found - treating this as a first full backup.');
    return {};
  }
}

function isUnchanged(previous, current) {
  return (
    previous &&
    previous.id === current.id &&
    previous.updated_at === current.updated_at &&
    previous.size === current.size
  );
}

async function main() {
  const previousManifest = loadManifest();
  const manifest = {};
  let transferred = 0;
  let skipped = 0;
  let failed = 0;

  rmSync(STAGING, { recursive: true, force: true });

  for (const bucket of BUCKETS) {
    let files;
    try {
      files = await listAll(bucket);
    } catch (error) {
      // A bucket that does not exist is expected for `inbound-ticket-photos`. Anything else is
      // worth surfacing, but not worth losing the other buckets' backups over.
      console.warn(`Skipping bucket "${bucket}": ${error?.message || error}`);
      continue;
    }

    console.log(`${bucket}: ${files.length} objects`);

    for (const file of files) {
      const key = `${bucket}/${file.path}`;
      manifest[key] = { id: file.id, updated_at: file.updated_at, size: file.size };

      if (isUnchanged(previousManifest[key], file)) {
        skipped += 1;
        continue;
      }

      const { data, error } = await supabase.storage.from(bucket).download(file.path);
      if (error) {
        console.warn(`  failed to download ${key}: ${error.message}`);
        // Keep the previous manifest entry so the next run retries this object rather than
        // recording it as successfully backed up.
        if (previousManifest[key]) manifest[key] = previousManifest[key];
        else delete manifest[key];
        failed += 1;
        continue;
      }

      const target = join(STAGING, key);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(await data.arrayBuffer()));
      transferred += 1;
    }
  }

  if (existsSync(STAGING)) {
    console.log(`Uploading ${transferred} changed objects to R2...`);
    aws(['s3', 'cp', STAGING, `s3://${R2_BUCKET}/${R2_PREFIX}/`, '--recursive']);
    rmSync(STAGING, { recursive: true, force: true });
  }

  writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
  aws(['s3', 'cp', 'manifest.json', `s3://${R2_BUCKET}/${MANIFEST_KEY}`]);

  console.log(
    `Storage backup complete: ${transferred} transferred, ${skipped} unchanged, ${failed} failed.`
  );

  // Surface partial failures as a workflow failure -- a backup that silently drops objects is
  // worse than one that fails loudly, because it looks like it worked.
  if (failed > 0) {
    console.error(`::error::${failed} object(s) could not be backed up.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Storage backup failed:', error);
  process.exit(1);
});

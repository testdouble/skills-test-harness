#!/usr/bin/env bun
/**
 * Compiles Skillwalker executables into ./build and places the DuckDB native
 * files beside them.
 *
 * DuckDB ships as a native addon (duckdb.node) that dynamically links libduckdb,
 * and @duckdb/node-bindings reaches that addon through a bare specifier —
 * `@duckdb/node-bindings-<platform>-<arch>/duckdb.node`. A Bun-compiled
 * executable resolves a bare specifier against the current working directory
 * rather than against its own location, so that require only succeeds when the
 * binary happens to run next to a node_modules tree holding the addon.
 *
 * The bundled copy of that specifier is swapped for a shim that loads the addon
 * from the executable's own directory instead. duckdb.node in turn records its
 * libduckdb dependency as an @rpath entry with an rpath of @loader_path, so
 * keeping both native files side by side in ./build is also what lets the
 * dynamic linker find the library.
 */
import { cp, mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dir, '..')
const BUILD_DIR = path.join(ROOT, 'build')

// Shipped inside the bindings package but not loadable artifacts
const BINDINGS_METADATA_FILES = new Set(['LICENSE', 'README.md', 'package.json'])

const COMPILE_TARGETS = [
  { entrypoint: 'packages/cli/index.ts', outfile: 'skillwalker' },
  { entrypoint: 'packages/web/src/server/index.ts', outfile: 'skillwalker-web' },
]

// Handed to `sbx exec` as real filesystem paths, so they cannot be embedded in
// the executable the way the web client assets are. resolveRelativePath looks
// for them next to the executable once compiled — see @testdouble/bun-helpers.
const RUNTIME_ASSETS = ['packages/claude-integration/sandbox-run.sh', 'packages/claude-integration/sandbox-extract.sh']

const DUCKDB_SIDECAR_SHIM = `
const { dirname, join } = require('node:path')

// Loaded from the executable's own directory rather than through node
// resolution — see scripts/build.ts for why.
const addon = { exports: {} }
process.dlopen(addon, join(dirname(process.execPath), 'duckdb.node'))
module.exports = addon.exports
`

// Every platform branch in @duckdb/node-bindings maps to the same shim: the
// sidecar next to the executable is already the addon built for this target.
const duckdbSidecarPlugin = {
  name: 'duckdb-sidecar',
  setup(build: Bun.PluginBuilder) {
    build.onResolve({ filter: /^@duckdb\/node-bindings-[^/]+\/duckdb\.node$/ }, () => ({
      path: 'duckdb-sidecar',
      namespace: 'duckdb-sidecar',
    }))
    build.onLoad({ filter: /./, namespace: 'duckdb-sidecar' }, () => ({
      contents: DUCKDB_SIDECAR_SHIM,
      loader: 'js' as const,
    }))
  },
}

function tryResolve(specifier: string, from: string): string | null {
  try {
    return Bun.resolveSync(specifier, from)
  } catch {
    return null
  }
}

/**
 * Walks the same resolution chain the runtime uses, so the addon copied into
 * ./build is the one Skillwalker would otherwise have loaded from node_modules.
 */
function resolveDuckdbNativeDir(): string {
  const nodeApi = Bun.resolveSync('@duckdb/node-api', path.join(ROOT, 'packages/data'))
  const bindings = Bun.resolveSync('@duckdb/node-bindings', path.dirname(nodeApi))
  const platformArch = `${process.platform}-${process.arch}`

  // musl-based Linux ships under its own package name
  const candidates = [`@duckdb/node-bindings-${platformArch}`, `@duckdb/node-bindings-${platformArch}-musl`]
  for (const candidate of candidates) {
    const addon = tryResolve(`${candidate}/duckdb.node`, path.dirname(bindings))
    if (addon) return path.dirname(addon)
  }

  throw new Error(`No DuckDB native bindings installed for ${platformArch}. Tried: ${candidates.join(', ')}`)
}

/** Copies the native files, skipping any that are already in place unchanged. */
async function copyDuckdbNativeFiles(nativeDir: string): Promise<void> {
  const artifacts = (await readdir(nativeDir)).filter((name) => !BINDINGS_METADATA_FILES.has(name))

  for (const artifact of artifacts) {
    const source = path.join(nativeDir, artifact)
    const destination = path.join(BUILD_DIR, artifact)

    if (Bun.file(destination).size === Bun.file(source).size) {
      console.log(`  current  build/${artifact}`)
      continue
    }

    await cp(source, destination)
    console.log(`  copied   build/${artifact}`)
  }
}

await mkdir(BUILD_DIR, { recursive: true })

for (const target of COMPILE_TARGETS) {
  const result = await Bun.build({
    entrypoints: [path.join(ROOT, target.entrypoint)],
    target: 'bun',
    compile: { outfile: path.join(BUILD_DIR, target.outfile) },
    plugins: [duckdbSidecarPlugin],
  })

  if (!result.success) {
    for (const log of result.logs) console.error(String(log))
    throw new Error(`Failed to compile ${target.outfile} from ${target.entrypoint}`)
  }

  console.log(`  compiled build/${target.outfile}`)
}

await copyDuckdbNativeFiles(resolveDuckdbNativeDir())

for (const asset of RUNTIME_ASSETS) {
  const name = path.basename(asset)
  await cp(path.join(ROOT, asset), path.join(BUILD_DIR, name))
  console.log(`  copied   build/${name}`)
}

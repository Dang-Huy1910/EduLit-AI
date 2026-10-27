import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts'];

function isRelative(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

/**
 * Node warns MODULE_TYPELESS_PACKAGE_JSON when a .ts file in a package
 * without "type" is reparsed as ESM. These tests are ESM, but frontend
 * package.json stays typeless so Next and CommonJS configs keep working.
 * Declaring the format here skips that detection.
 */
function typescriptModule(filePath) {
  return {
    url: pathToFileURL(filePath).href,
    shortCircuit: true,
    format: filePath.endsWith('.cts') ? 'commonjs-typescript' : 'module-typescript',
  };
}

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL && isRelative(specifier)) {
    const filePath = fileURLToPath(new URL(specifier, context.parentURL));
    if (TYPESCRIPT_EXTENSIONS.some((extension) => filePath.endsWith(extension)) && existsSync(filePath)) {
      return typescriptModule(filePath);
    }
    for (const extension of TYPESCRIPT_EXTENSIONS) {
      if (existsSync(filePath + extension)) return typescriptModule(filePath + extension);
    }
  }
  return nextResolve(specifier, context);
}


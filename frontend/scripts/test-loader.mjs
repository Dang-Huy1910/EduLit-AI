import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (context.parentURL && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      const resolved = new URL(specifier, context.parentURL);
      const filePath = fileURLToPath(resolved);
      if (existsSync(filePath + '.ts')) {
        return nextResolve(pathToFileURL(filePath + '.ts').href, context);
      }
      if (existsSync(filePath + '.tsx')) {
        return nextResolve(pathToFileURL(filePath + '.tsx').href, context);
      }
    }
    throw err;
  }
}


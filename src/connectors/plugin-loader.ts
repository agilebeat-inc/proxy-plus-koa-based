import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

export async function listPlugins(): Promise<string[]> {
  const pluginsDir = path.join(__dirname, 'plugins');
  try {
    const files = await fs.promises.readdir(pluginsDir);
    // Filter out non-JS/TS files and drop the extension
    return files
      .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
      .map(f => path.basename(f, path.extname(f)));
  } catch (error) {
    console.error('Failed to list plugins:', error);
    return [];
  }
}

export async function loadPlugin(pluginName: string) {
  try {
    const plugin = await import(`./plugins/${pluginName}`);
    return plugin;
  } catch (error: unknown) {
    logger.error({ "message": `Failed to load plugin "${pluginName}. List of available plugins: ${await listPlugins()}, error: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

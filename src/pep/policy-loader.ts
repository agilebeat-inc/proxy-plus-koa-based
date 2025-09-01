import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

export async function listPolicys(): Promise<string[]> {
  const policiesDir = path.join(__dirname, 'policies');
  try {
    const files = await fs.promises.readdir(policiesDir);
    // Filter out non-JS/TS files and drop the extension
    return files
      .filter(f => f.endsWith('.js') || f.endsWith('.ts'))
      .map(f => path.basename(f, path.extname(f)));
  } catch (error: any) {
    logger.error('Failed to list policies:', error);
    return [];
  }
}

export async function loadPolicy(policyName: string) {
  try {
    const plugin = await import(`./policies/${policyName}`);
    return plugin;
  } catch (error) {
    logger.error(JSON.stringify({ "message": `Failed to load policy '${policyName}'. List of available policies: ${await listPolicys()}` }));
    return null;
  }
}

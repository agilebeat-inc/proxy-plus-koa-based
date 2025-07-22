
export async function loadPlugin(pluginName: string) {
  try {
    const plugin = await import(`../plugins/${pluginName}`);
    return plugin;
  } catch (error) {
    console.error(`Failed to load plugin "${pluginName}":`, error);
    return null;
  }
}

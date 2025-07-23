import logger from './logger';

/**
 * Returns the value of the given environment variable, or undefined if not set.
 * @param envVarName The name of the environment variable.
 */
export function getEnvVar(envVarName: string, defaultVal: string): string {
    const value = process.env[envVarName];
    if (!value) {
        logger.warn(`[ENV Settings] ${envVarName} not set, using default value instead: ${defaultVal}`);
        return defaultVal;
    }
    logger.info(`[ENV Settings] ${envVarName} is set to: ${value}`);
    return value;
}
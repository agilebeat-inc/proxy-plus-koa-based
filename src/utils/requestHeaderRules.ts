import type { OutgoingHttpHeaders } from 'http';
import type { HeaderRuleCondition, RequestHeaderRule } from '../types/RequestHeaderRule';

function headerValueAsString(value: OutgoingHttpHeaders[string]): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return undefined;
}

function matchesCondition(headers: OutgoingHttpHeaders, condition: HeaderRuleCondition): boolean {
  if (condition.condition !== 'header') {
    return false;
  }

  const headerKey = condition.headerName.toLowerCase();
  const currentValue = headerValueAsString(headers[headerKey]);

  if (typeof condition.exists === 'boolean') {
    return condition.exists ? currentValue !== undefined : currentValue === undefined;
  }
  if (typeof condition.equals === 'string') {
    return currentValue === condition.equals;
  }
  if (typeof condition.includes === 'string') {
    return currentValue?.includes(condition.includes) ?? false;
  }
  if (typeof condition.matches === 'string') {
    try {
      const regex = new RegExp(condition.matches, condition.flags);
      return regex.test(currentValue ?? '');
    } catch {
      return false;
    }
  }

  return currentValue !== undefined;
}

export function applyRequestHeaderRules(
  headers: OutgoingHttpHeaders,
  rules?: RequestHeaderRule[]
): OutgoingHttpHeaders {
  if (!rules || rules.length === 0) {
    return headers;
  }

  const updated: OutgoingHttpHeaders = { ...headers };

  for (const rule of rules) {
    if (rule.when && !matchesCondition(updated, rule.when)) {
      continue;
    }

    const headerKey = rule.headerName.toLowerCase();

    if (rule.operation === 'create') {
      if (typeof updated[headerKey] === 'undefined') {
        updated[headerKey] = rule.value;
      }
      continue;
    }

    if (rule.operation === 'update') {
      updated[headerKey] = rule.value;
      continue;
    }

    if (rule.operation === 'patch') {
      const currentValue = headerValueAsString(updated[headerKey]);
      if (typeof currentValue === 'undefined') {
        continue;
      }
      try {
        const regex = new RegExp(rule.pattern, rule.flags);
        updated[headerKey] = currentValue.replace(regex, rule.replacement);
      } catch {
        continue;
      }
      continue;
    }

    if (rule.operation === 'delete') {
      delete updated[headerKey];
    }
  }

  return updated;
}


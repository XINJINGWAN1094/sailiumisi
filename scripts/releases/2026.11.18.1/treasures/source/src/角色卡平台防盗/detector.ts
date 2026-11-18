import type { EvidenceRule, TargetSignature } from './config';

type WindowSnapshot = {
  label: string;
  href: string;
  origin: string;
  hostname: string;
  title: string;
  bodyId: string;
  bodyClass: string;
  meta: string[];
  resourceUrls: string[];
  bridgeLikeGlobals: string[];
};

export type RuntimeSnapshot = {
  collectedAt: string;
  userAgent: string;
  platform: string;
  referrer: string;
  windows: WindowSnapshot[];
};

export type DetectionResult = {
  blocked: boolean;
  signatureId?: string;
  matchedRuleIds: string[];
};

function safelyRead<T>(reader: () => T, fallback: T): T {
  try {
    return reader();
  } catch {
    return fallback;
  }
}

function stripUrlSecrets(value: string) {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/u, 1)[0];
  }
}

function getReachableWindows() {
  const result: Array<{ label: string; value: Window }> = [{ label: 'self', value: window }];
  const add = (label: string, value: Window) => {
    if (!result.some(item => item.value === value)) {
      result.push({ label, value });
    }
  };

  safelyRead(() => add('parent', window.parent), undefined);
  safelyRead(() => add('top', window.top ?? window), undefined);
  return result;
}

function collectBridgeLikeGlobals(target: Window) {
  const namePattern = /(^__|android|bridge|native|webview|flutter|reactnative|webkit|app|capabilities|dialog)/i;
  return safelyRead(
    () =>
      Object.getOwnPropertyNames(target)
        .filter(name => namePattern.test(name))
        .filter(name => {
          const value = safelyRead(() => (target as unknown as Record<string, unknown>)[name], undefined);
          return typeof value === 'object' || typeof value === 'function';
        })
        .sort(),
    [],
  );
}

function collectWindowSnapshot(label: string, target: Window): WindowSnapshot {
  const document = safelyRead(() => target.document, undefined as Document | undefined);
  const meta = document
    ? Array.from(document.querySelectorAll('meta[name], meta[property]'))
        .map(element => {
          const name = element.getAttribute('name') ?? element.getAttribute('property') ?? '';
          return `${name}=${element.getAttribute('content') ?? ''}`;
        })
        .filter(value => value.length <= 300)
        .slice(0, 80)
    : [];
  const resourceUrls = document
    ? Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[href]'))
        .map(element => stripUrlSecrets('src' in element ? element.src : element.href))
        .filter(Boolean)
        .slice(0, 160)
    : [];

  return {
    label,
    href: stripUrlSecrets(safelyRead(() => target.location.href, '')),
    origin: safelyRead(() => target.location.origin, ''),
    hostname: safelyRead(() => target.location.hostname, ''),
    title: document?.title ?? '',
    bodyId: document?.body?.id ?? '',
    bodyClass: document?.body?.className ?? '',
    meta,
    resourceUrls,
    bridgeLikeGlobals: collectBridgeLikeGlobals(target),
  };
}

export function collectRuntimeSnapshot(): RuntimeSnapshot {
  return {
    collectedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    referrer: stripUrlSecrets(document.referrer),
    windows: getReachableWindows().map(item => collectWindowSnapshot(item.label, item.value)),
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('en-US');
}

function includesMarker(values: string[], marker: string) {
  const normalizedMarker = normalize(marker);
  return normalizedMarker.length > 0 && values.some(value => normalize(value).includes(normalizedMarker));
}

function hasGlobalPath(target: Window, path: string) {
  const segments = path
    .trim()
    .replace(/^window\./iu, '')
    .split('.')
    .filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  return safelyRead(() => {
    let value: unknown = target;
    for (const segment of segments) {
      if ((typeof value !== 'object' && typeof value !== 'function') || value === null || !(segment in value)) {
        return false;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    return true;
  }, false);
}

function matchRule(rule: EvidenceRule, snapshot: RuntimeSnapshot) {
  switch (rule.source) {
    case 'user_agent':
      return includesMarker([snapshot.userAgent], rule.contains);
    case 'location':
      return includesMarker(
        snapshot.windows.flatMap(item => [item.href, item.origin, item.hostname]),
        rule.contains,
      );
    case 'referrer':
      return includesMarker([snapshot.referrer], rule.contains);
    case 'global_path':
      return (
        includesMarker(
          snapshot.windows.flatMap(item => item.bridgeLikeGlobals),
          rule.contains,
        ) || getReachableWindows().some(item => hasGlobalPath(item.value, rule.contains))
      );
    case 'document_title':
      return includesMarker(
        snapshot.windows.map(item => item.title),
        rule.contains,
      );
    case 'dom_selector':
      return getReachableWindows().some(item =>
        safelyRead(() => item.value.document.querySelector(rule.contains) !== null, false),
      );
    case 'meta_content':
      return includesMarker(
        snapshot.windows.flatMap(item => item.meta),
        rule.contains,
      );
    case 'resource_url':
      return includesMarker(
        snapshot.windows.flatMap(item => item.resourceUrls),
        rule.contains,
      );
  }
}

function evaluateSignature(signature: TargetSignature, snapshot: RuntimeSnapshot): DetectionResult {
  const allMatches = signature.all.filter(rule => matchRule(rule, snapshot));
  if (allMatches.length !== signature.all.length || signature.all.length === 0) {
    return { blocked: false, matchedRuleIds: allMatches.map(rule => rule.id) };
  }

  const anyRules = signature.any ?? [];
  const anyMatches = anyRules.filter(rule => matchRule(rule, snapshot));
  const requiredAnyMatches = signature.minAnyMatches ?? (anyRules.length > 0 ? 1 : 0);
  const matchedRuleIds = [...allMatches, ...anyMatches].map(rule => rule.id);
  const matchedEvidenceFamilies = new Set([...allMatches, ...anyMatches].map(rule => rule.source));

  // 通用组合默认保留两类证据；已确认的专属特征按配置放宽，不再强制等待另一类证据。
  const requiredFamilies = Math.max(1, signature.minEvidenceFamilies ?? 2);
  return anyMatches.length >= requiredAnyMatches && matchedEvidenceFamilies.size >= requiredFamilies
    ? { blocked: true, signatureId: signature.id, matchedRuleIds }
    : { blocked: false, matchedRuleIds };
}

export function detectBlockedRuntime(
  signatures: TargetSignature[],
  snapshot = collectRuntimeSnapshot(),
): DetectionResult {
  for (const signature of signatures) {
    const result = evaluateSignature(signature, snapshot);
    if (result.blocked) {
      return result;
    }
  }
  return { blocked: false, matchedRuleIds: [] };
}

import { TARGET_SIGNATURES } from './config';
import { collectRuntimeSnapshot, detectBlockedRuntime } from './detector';

export function isSupportedRuntime(): boolean {
  return !detectBlockedRuntime(TARGET_SIGNATURES, collectRuntimeSnapshot()).blocked;
}

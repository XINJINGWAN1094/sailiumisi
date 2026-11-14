export type EvidenceSource =
  | 'user_agent'
  | 'location'
  | 'referrer'
  | 'global_path'
  | 'document_title'
  | 'dom_selector'
  | 'meta_content'
  | 'resource_url';

export type EvidenceRule = {
  /** 只用于日志；不要写出目标平台的真实名称。 */
  id: string;
  source: EvidenceSource;
  /**
   * 除 global_path 外，均为大小写不敏感的纯文本包含匹配，不按正则表达式解释；
   * global_path 填写要检查的 window 属性路径。
   */
  contains: string;
};

export type TargetSignature = {
  id: string;
  /** 每条都必须命中。适合包名、专属域名、独有 JS Bridge 等稳定证据。 */
  all: EvidenceRule[];
  /** 可选的辅助证据；命中数必须达到 minAnyMatches。 */
  any?: EvidenceRule[];
  minAnyMatches?: number;
  /** 默认 2 类证据；已确认的平台专属特征可显式降为 1，允许单独命中。 */
  minEvidenceFamilies?: number;
};

/**
 * 目标平台指纹。
 *
 * 安全原则：
 * 1. 不允许用 Android、WebView、移动端、缺少 TavernHelper 等宽泛特征封锁。
 * 2. 各组之间为 OR。专属标记可单独触发；标题、UA、SQLite 等较弱线索仍按组合识别。
 * 3. 2026-11-14 用户明确要求放宽命中；保留原组并增加备用组，避免所有规则依赖同一标记。
 * 4. 新版依据是 PiuPiu 酱 2.8.0 APK 静态检查和用户在 Android 12 / Chrome 114 的两次运行时取样。
 */
export const TARGET_SIGNATURES: TargetSignature[] = [
  {
    id: 'unsupported-piupiu-chat-app',
    all: [{ id: 'piupiu-script-frame', source: 'global_path', contains: '__PIUPIU_TH_MODULE_READY__' }],
    any: [
      { id: 'piupiu-user-agent', source: 'user_agent', contains: 'PiuPiu' },
      { id: 'piupiu-document-title', source: 'document_title', contains: 'piupiu-chat' },
      { id: 'piupiu-capabilities', source: 'global_path', contains: 'PiuPiuCapabilities' },
      { id: 'piupiu-app-root', source: 'dom_selector', contains: 'jeep-sqlite[wasmpath="/assets"]' },
      {
        id: 'piupiu-helper-storage',
        source: 'resource_url',
        contains: '/assets/tavernHelperScriptStorage-legacy-',
      },
    ],
    minAnyMatches: 1,
  },
  {
    id: 'unsupported-piupiu-script-marker',
    all: [{ id: 'piupiu-script-frame', source: 'global_path', contains: '__PIUPIU_TH_MODULE_READY__' }],
    minEvidenceFamilies: 1,
  },
  {
    id: 'unsupported-piupiu-capabilities',
    all: [{ id: 'piupiu-capabilities', source: 'global_path', contains: 'PiuPiuCapabilities' }],
    minEvidenceFamilies: 1,
  },
  {
    id: 'unsupported-piupiu-modal',
    all: [{ id: 'piupiu-modal-layer', source: 'dom_selector', contains: '#piupiu-modal-layer' }],
    minEvidenceFamilies: 1,
  },
  {
    id: 'unsupported-piupiu-native-protection',
    all: [{ id: 'piupiu-native-bridge', source: 'global_path', contains: 'AndroidDownloader' }],
    any: [
      { id: 'piupiu-protected-state', source: 'global_path', contains: 'AndroidDownloader.getProtectedFrontendState' },
      {
        id: 'piupiu-protected-event',
        source: 'global_path',
        contains: 'AndroidDownloader.reportProtectedFrontendEvent',
      },
      {
        id: 'piupiu-protected-device',
        source: 'global_path',
        contains: 'AndroidDownloader.getProtectedFrontendDeviceId',
      },
    ],
    minAnyMatches: 1,
    minEvidenceFamilies: 1,
  },
  {
    id: 'unsupported-piupiu-app-shell',
    all: [{ id: 'piupiu-app-root', source: 'dom_selector', contains: 'jeep-sqlite[wasmpath="/assets"]' }],
    any: [
      { id: 'piupiu-document-title', source: 'document_title', contains: 'piupiu-chat' },
      { id: 'piupiu-new-title', source: 'document_title', contains: 'PiuPiu酱' },
      { id: 'piupiu-user-agent', source: 'user_agent', contains: 'PiuPiu' },
    ],
    minAnyMatches: 1,
  },
];

export const ENABLE_DIAGNOSTIC_BUTTON = false;

export const BLOCK_MESSAGE = '此角色卡不支持当前运行环境。请使用受支持的酒馆类前端游玩。';

import { lstatSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isIP } from "node:net";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { decodeHTML } from "entities";

const binaryExtensions = new Set([
  ".7z", ".avif", ".bmp", ".gif", ".gz", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".tar", ".tgz", ".webp", ".zip",
]);
const approvedGeneratedFiles = new Set(["dist/alx-home-widgets.js", "package-lock.json"]);
const generatedExtensionPattern = /\.(?:har|log|map|trace)$/i;
const generatedDirectoryPattern = /^(?:artifacts|playwright-report|test-results)\//;
const privateIpPattern = /\b(?:10(?:\.\d{1,3}){3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/;
const ipv6CandidatePattern = /[0-9a-f:]+/gi;
const webUrlPattern = /(?<![A-Za-z0-9+.-])(?:(?:ftp|https?|wss?):[\\/]*|\/\/)(?=(?:[A-Za-z0-9]|\[[0-9a-f:]))[^ \f\v<>"'`]+/gi;
const assignmentValuePattern = /(?:^|[^A-Za-z0-9_$])(?:["']?([A-Za-z_$][A-Za-z0-9_$-]*)["']?)\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s"',;)}\]]+))/gm;
const privateHostnamePattern = /\b(?:[a-z0-9-]+\.)+(?:home\.arpa|internal|lan|local|localdomain)\b/i;
const estateHostnamePattern = /\b(?:authentik|dockerhost|hassio|homeassistant|litellm|openbao|openobserve|pihole|proxmox|windmill)\.[a-z0-9.-]+\.[a-z]{2,}\b/i;
const localPathPattern = /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/)/;
const windowsLocalPathPattern = new RegExp("[A-Za-z]:" + "\\\\" + "Users" + "\\\\" + "[A-Za-z0-9._-]+" + "\\\\");
const credentialShapePattern = /(?:\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]+\b|\bAKIA[0-9A-Z]{16}\b|-----BEGIN [A-Z ]+PRIVATE KEY-----)/;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i;
const basicAuthPattern = /\bAuthorization\s*:\s*Basic\s+([A-Za-z0-9+/]+={0,2})/gi;
const cliUserPattern = /(?:^|\s)(?:-u(?:\s+|=)?|--user(?:\s+|=))(?:(?:"([^"]*)")|(?:'([^']*)')|([^\s]+))/gim;
const credentialUrlPattern = /(?<![A-Za-z0-9+.-])(?:(?:ftp|https?|wss?):[\\/]*|[a-z][a-z0-9+.-]{1,31}:\/\/|\/\/)(?=[^ \f\v<>"'`]+@)[^ \f\v<>"'`]+/gi;
const homeAssistantCredentialShapePattern = /\b[A-Za-z0-9_-]{120,}\b/;
const entityCandidatePattern = /(?<![a-z0-9_-])([a-z][a-z0-9_]*)\.([a-z0-9_]+)\b/g;
const exampleEntityPattern = /^[a-z0-9_]+\.example_[a-z0-9_]+$/;
const homeAssistantEntityDomains = new Set([
  "ai_task", "air_quality", "alarm_control_panel", "alert", "assist_satellite", "automation", "binary_sensor", "button",
  "calendar", "camera", "climate", "conversation", "counter", "cover", "date", "datetime", "device_tracker", "event", "fan",
  "geo_location", "group", "humidifier", "image", "image_processing", "infrared", "input_boolean", "input_button", "input_datetime",
  "input_number", "input_select", "input_text", "lawn_mower", "light", "lock", "media_player", "notify", "number", "person", "plant",
  "proximity", "radio_frequency", "remote", "scene", "schedule", "script", "select", "sensor", "siren", "stt", "sun", "switch",
  "text", "time", "timer", "todo", "tts", "update", "utility_meter", "vacuum", "valve", "wake_word", "water_heater", "weather", "zone",
]);
const authSubjectKeyPattern = /^(?:auth[_-]?subject|owner[_-]?id|sub|subject|user[_-]?id)$/i;
const assignmentKeyPattern = /["']?([A-Za-z_$][A-Za-z0-9_$.-]*)["']?\s*[:=]\s*/g;
const publicValuePrefixPattern = /^("[^"\r\n]*"|'[^'\r\n]*'|\$\{\{[^}\r\n]+\}\}|\$\{[A-Z][A-Z0-9_]*\}|<[^>\r\n]+>|(?:example|placeholder|redacted)(?:[-_][a-z0-9_-]+)?)/i;
const harmlessValueSuffixPattern = /^\s*[}\])]*\s*$/;
const xmlSensitiveName = "(?:api[_-]?key|auth[_-]?subject|client[_-]?secret|owner[_-]?id|password|passwd|secret|sub|subject|token|user[_-]?id)";
const xmlSensitivePattern = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?)(${xmlSensitiveName})(?:\\s+(?:[^<>"']+|"[^"]*"|'[^']*')*)?\\s*>([^<]+)<\\/\\1\\2\\s*>`, "gi");
const xmlSensitiveStartPattern = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${xmlSensitiveName}\\b`, "gi");
const encodedTextPattern = /[A-Za-z0-9_+/-]{16,}={0,2}/g;
const githubRuntimeReferencePattern = /^\$\{\{\s*(?:env|github|inputs|job|matrix|needs|runner|secrets|steps|strategy|vars)\.[A-Za-z_][A-Za-z0-9_.-]*\s*\}\}$/;
const integrityDigestInTextPattern = /\bsha(?:256|384|512)-[A-Za-z0-9_+/=-]+/gi;
const maxDecodedDepth = 3;
const maxEncodedCandidates = 64;
const minDecodedBytes = 8;
const maxDecodedBytes = 4096;
const maxEncodedCharacters = 5464;
const maxPrivatePolicyBytes = 4096;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const utf16LeDecoder = new TextDecoder("utf-16le", { fatal: true });
const utf16BeDecoder = new TextDecoder("utf-16be", { fatal: true });
const sensitiveKeyWords = new Set(["apikey", "clientsecret", "password", "passwd", "privatekey", "secret", "token"]);
const benignMetadataSuffixes = new Set(["endpoint", "file", "name", "path", "policy", "type", "url"]);

const normalizedValue = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const containsPrivateTerm = (content, term) => new RegExp(`(?<![A-Za-z0-9])${regexEscape(term)}(?![A-Za-z0-9])`, "i").test(content);
const malformedPercentEscapePattern = new RegExp("%" + "(?![0-9a-f]{2})[0-9a-z]{2}", "i");
const malformedNumericReferencePattern = new RegExp("&" + "#(?!(?:x[0-9a-f]+|[0-9]+))", "i");
const numericHexReferencePattern = new RegExp("&" + "#x([0-9a-f]+);?", "gi");
const numericDecimalReferencePattern = new RegExp("&" + "#([0-9]+);?", "g");
const backslashEscapePattern = /(\\+)(?:x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8}))/g;
const backslashEscapePrefixPattern = /(\\+)([xuU])/g;
const cssEscapePattern = new RegExp("(\\\\+)" + "([0-9a-f]{2,6})([ \\t\\r\\n\\f]?)", "gi");
const cssSimpleEscapePattern = /(\\+)([^\r\n\f0-9a-fA-FxXuU])/g;
const cssContinuationPattern = /(\\+)(?:\r\n|[\r\n\f])[ \t]*/g;

const isNonPublicIpv6 = (candidate) => {
  const address = candidate.toLowerCase();
  if (isIP(address) !== 6) return false;
  if (address === [":", ":1"].join("")) return true;
  const firstHextet = Number.parseInt(address.split(":", 1)[0], 16);
  return (firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80;
};

const normalizedUrlCandidate = (candidate) => candidate
  .replace(/[\t\r\n]/g, "")
  .replace(/:(?:\$\{[A-Z][A-Z0-9_]*\}|[A-Z][A-Z0-9_]*)(?=[/?#]|$)/g, ":1");

const parsedUrlHostname = (candidate) => new URL(
  normalizedUrlCandidate(candidate),
  "https://example.invalid/",
).hostname.replace(/^\[|\]$/g, "");

const isHostBearingKey = (key) => {
  const normalized = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return ["address", "endpoint", "host", "hostname", "ip", "server"].includes(normalized)
    || ["_address", "_host", "_hostname", "_ip"].some((suffix) => normalized.endsWith(suffix));
};

const hostAssignmentMatches = (content) => [...content.matchAll(assignmentValuePattern)]
  .filter((match) => isHostBearingKey(match[1]))
  .map((match) => ({ value: match[2] ?? match[3] ?? match[4] }));

const containsMalformedOrOversizedUrl = (content) => [...content.matchAll(webUrlPattern)].some((match) => {
  if (match[0].length > 2048) return true;
  try {
    new URL(normalizedUrlCandidate(match[0]), "https://example.invalid/");
    return false;
  } catch {
    return true;
  }
});

const containsPrivateIpv4Assignment = (content) => hostAssignmentMatches(content).some((match) => {
  if (match.value.length > 512) return false;
  try {
    const hostname = parsedUrlHostname(`http://${match.value}`);
    return isIP(hostname) === 4 && privateIpPattern.test(hostname);
  } catch {
    return false;
  }
});

const containsPrivateAssignedHostname = (content) => hostAssignmentMatches(content).some((match) => {
  if (match.value.length > 512) return false;
  try {
    const hostname = parsedUrlHostname(`http://${match.value}`);
    return privateHostnamePattern.test(hostname) || estateHostnamePattern.test(hostname);
  } catch {
    return false;
  }
});

const containsMalformedHostAssignment = (content) => hostAssignmentMatches(content).some((match) => {
  if (match.value.length > 512) return true;
  if (!/^(?:0x[0-9a-f]+|[0-9][0-9a-fx.]*|[a-z0-9-]+(?:[.\u3002\uff0e\uff61][a-z0-9-]+)+)$/i.test(match.value)) return false;
  try {
    parsedUrlHostname(`http://${match.value}`);
    return false;
  } catch {
    return true;
  }
});

const containsPrivateUrlHost = (content) => [...content.matchAll(webUrlPattern)].some((match) => {
  if (match[0].length > 2048) return true;
  try {
    const hostname = parsedUrlHostname(match[0]);
    return privateIpPattern.test(hostname) || isNonPublicIpv6(hostname);
  } catch {
    return false;
  }
});

const containsPrivateUrlHostname = (content) => [...content.matchAll(webUrlPattern)].some((match) => {
  if (match[0].length > 2048) return true;
  try {
    const hostname = parsedUrlHostname(match[0]);
    return privateHostnamePattern.test(hostname) || estateHostnamePattern.test(hostname);
  } catch {
    return false;
  }
});

const containsPrivateIp = (content) => privateIpPattern.test(content)
  || containsPrivateIpv4Assignment(content)
  || containsPrivateUrlHost(content)
  || [...content.matchAll(ipv6CandidatePattern)].some((match) => {
    const candidates = [match[0]];
    let withoutTrailingColon = match[0];
    while (withoutTrailingColon.endsWith(":") && candidates.length <= 3) {
      withoutTrailingColon = withoutTrailingColon.slice(0, -1);
      candidates.push(withoutTrailingColon);
    }
    return candidates.some(isNonPublicIpv6);
  });

const isPublicReference = (value) => {
  const normalized = normalizedValue(value);
  return githubRuntimeReferencePattern.test(normalized)
    || /^\$\{[A-Z][A-Z0-9_]*\}$/.test(normalized)
    || /^\$[A-Z][A-Z0-9_]*$/.test(normalized)
    || /^<[^>]+>$/.test(normalized)
    || /^(?:example|placeholder|redacted)(?:[-_][a-z0-9_-]+)?$/i.test(normalized);
};

const isSensitiveAssignmentKey = (key) => {
  const compact = key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  const segmented = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const hasSensitiveCompound = segmented.some((word, index) => (
    ((word === "api" || word === "private") && segmented[index + 1] === "key")
    || (word === "client" && segmented[index + 1] === "secret")
  ));
  if (benignMetadataSuffixes.has(segmented.at(-1))) return false;
  return segmented.some((word) => sensitiveKeyWords.has(word))
    || hasSensitiveCompound
    || [...sensitiveKeyWords].some((word) => compact === word || compact.endsWith(word));
};

const decodedCredentialComponent = (raw) => {
  let value = raw;
  for (let depth = 0; depth <= maxDecodedDepth; depth += 1) {
    if (isPublicReference(value)) return true;
    let decoded;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      return false;
    }
    if (decoded === value) return false;
    value = decoded;
  }
  return false;
};

const userInfoIsPublic = (userinfo) => {
  const separator = userinfo.indexOf(":");
  if (separator < 0) return decodedCredentialComponent(userinfo);
  return decodedCredentialComponent(userinfo.slice(0, separator))
    && decodedCredentialComponent(userinfo.slice(separator + 1));
};

const credentialTransportFailures = (file, content) => {
  const failures = [];
  for (const match of content.matchAll(credentialUrlPattern)) {
    if (match[0].length > 2048) {
      failures.push(`${file}: URI userinfo credential`);
      continue;
    }
    try {
      const url = new URL(normalizedUrlCandidate(match[0]), "https://example.invalid/");
      if ((url.username || url.password) && !userInfoIsPublic(`${url.username}:${url.password}`)) {
        failures.push(`${file}: URI userinfo credential`);
      }
    } catch {
      failures.push(`${file}: malformed URI userinfo credential`);
    }
  }
  for (const match of content.matchAll(basicAuthPattern)) {
    const decoded = decodePrintableBase64(match[1], 1);
    if (typeof decoded !== "string" || !userInfoIsPublic(decoded)) failures.push(`${file}: Basic credential`);
  }
  for (const match of content.matchAll(cliUserPattern)) {
    if (!userInfoIsPublic(match[1] ?? match[2] ?? match[3])) failures.push(`${file}: CLI user credential`);
  }
  return failures;
};

const sensitiveFailures = (file, key, rawValue) => {
  const value = normalizedValue(typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue));
  if (!value || isPublicReference(value)) return [];
  const failures = [];
  if (isSensitiveAssignmentKey(key)) failures.push(`${file}: generic secret assignment`);
  if (authSubjectKeyPattern.test(key)) failures.push(`${file}: authentication subject`);
  return failures;
};

const sensitiveAssignmentFailures = (file, line) => {
  const failures = [];
  for (const match of line.matchAll(assignmentKeyPattern)) {
    const key = match[1];
    if (!isSensitiveAssignmentKey(key) && !authSubjectKeyPattern.test(key)) continue;
    const remaining = line.slice(match.index + match[0].length).trim();
    const valueMatch = remaining.match(publicValuePrefixPattern);
    const publicValue = valueMatch?.[0];
    const suffix = publicValue ? remaining.slice(publicValue.length) : remaining;
    if (publicValue && isPublicReference(publicValue) && harmlessValueSuffixPattern.test(suffix)) continue;
    if (isSensitiveAssignmentKey(key)) failures.push(`${file}: generic secret assignment`);
    if (authSubjectKeyPattern.test(key)) failures.push(`${file}: authentication subject`);
  }
  return failures;
};

const structuredSensitiveFailures = (file, value, allowedEntities, privateTerms, depth, normalizationDepth) => {
  const failures = [];
  const visit = (item) => {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    if (typeof item === "string") {
      failures.push(...privacyFailuresForText(`${file} [decoded JSON string]`, item, allowedEntities, privateTerms, depth, false, normalizationDepth));
      return;
    }
    if (item === null || typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      failures.push(...sensitiveFailures(file, key, child));
      visit(child);
    }
  };
  visit(value);
  return failures;
};

const decodePrintableBase64 = (candidate, minimumBytes = minDecodedBytes) => {
  if (candidate.length % 4 === 1) return undefined;
  const normalized = candidate.replaceAll("-", "+").replaceAll("_", "/");
  const unpadded = normalized.replace(/=+$/, "");
  const padded = `${unpadded}${"=".repeat((4 - (unpadded.length % 4)) % 4)}`;
  const decoded = Buffer.from(padded, "base64");
  if (decoded.length < minimumBytes) return undefined;
  if (decoded.length > maxDecodedBytes) return null;
  if (decoded.toString("base64").replace(/=+$/, "") !== unpadded) return undefined;
  const printable = (text) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
  try {
    const text = utf8Decoder.decode(decoded);
    if (printable(text)) return text;
  } catch {
    // Try an explicitly recognizable UTF-16 form below.
  }
  if (decoded.length % 2 !== 0) return undefined;
  const evenNulls = decoded.filter((byte, index) => index % 2 === 0 && byte === 0).length;
  const oddNulls = decoded.filter((byte, index) => index % 2 === 1 && byte === 0).length;
  const pairs = decoded.length / 2;
  const decoder = decoded.subarray(0, 2).equals(Buffer.from([0xff, 0xfe])) || oddNulls >= pairs / 2
    ? utf16LeDecoder
    : decoded.subarray(0, 2).equals(Buffer.from([0xfe, 0xff])) || evenNulls >= pairs / 2
      ? utf16BeDecoder
      : undefined;
  if (!decoder) return undefined;
  try {
    const text = decoder.decode(decoded);
    return printable(text) ? text : undefined;
  } catch {
    return undefined;
  }
};

const isUnapprovedGeneratedArtifact = (file) => {
  if (approvedGeneratedFiles.has(file)) return false;
  return file.startsWith("dist/") || generatedDirectoryPattern.test(file) || generatedExtensionPattern.test(file);
};

const validCodePoint = (value) => value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff);
const decodedCodePoint = (raw, digits, radix) => {
  if (digits.length > maxEncodedCharacters) return raw;
  let value;
  try {
    value = Number(radix === 16 ? BigInt(`0x${digits}`) : BigInt(digits));
  } catch {
    return raw;
  }
  return validCodePoint(value) ? String.fromCodePoint(value) : raw;
};

const decodeBackslashEscapes = (content) => content.replace(backslashEscapePattern, (raw, slashes, hex, bracedUnicode, unicode, longUnicode) => {
  const digits = hex ?? bracedUnicode ?? unicode ?? longUnicode;
  const pairedPrefix = "\\".repeat(Math.floor(slashes.length / 2));
  if (slashes.length % 2 === 0) return `${pairedPrefix}${raw.slice(slashes.length)}`;
  return `${pairedPrefix}${decodedCodePoint(raw, digits, 16)}`;
});

const decodeCssEscapes = (content) => {
  const hexadecimal = content.replace(cssEscapePattern, (raw, slashes, digits, terminator, offset) => {
  const previous = offset === 0 ? "" : content[offset - 1];
  const plausibleCssContext = offset === 0
    || digits.length === 6
    || terminator.length > 0
    || /[A-Za-z0-9_:'"({,;=-]/.test(previous);
  if (!plausibleCssContext) return raw;
  const pairedPrefix = "\\".repeat(Math.floor(slashes.length / 2));
  if (slashes.length % 2 === 0) return `${pairedPrefix}${raw.slice(slashes.length)}`;
  return `${pairedPrefix}${decodedCodePoint(raw, digits, 16)}`;
  });
  const continuations = hexadecimal.replace(cssContinuationPattern, (raw, slashes) => {
    const pairedPrefix = "\\".repeat(Math.floor(slashes.length / 2));
    return slashes.length % 2 === 0 ? `${pairedPrefix}${raw.slice(slashes.length)}` : pairedPrefix;
  });
  return continuations.replace(cssSimpleEscapePattern, (raw, slashes, escaped) => {
    const pairedPrefix = "\\".repeat(Math.floor(slashes.length / 2));
    return `${pairedPrefix}${escaped}`;
  });
};

const decodeTextualEscapes = (content) => decodeHTML(decodeCssEscapes(decodeBackslashEscapes(content)))
  .replace(numericHexReferencePattern, (raw, hex) => decodedCodePoint(raw, hex, 16))
  .replace(numericDecimalReferencePattern, (raw, decimal) => decodedCodePoint(raw, decimal, 10))
  .replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });

const hasInvalidTextualEncoding = (content) => {
  if (malformedPercentEscapePattern.test(content)
    || malformedNumericReferencePattern.test(content)) return true;
  for (const match of content.matchAll(backslashEscapePrefixPattern)) {
    const remaining = content.slice(match.index + match[1].length + 1);
    const digits = match[2] === "x"
      ? remaining.match(/^([0-9a-f]{2})/i)?.[1]
      : match[2] === "u"
        ? remaining.match(/^\{([0-9a-f]{1,6})\}/i)?.[1] ?? remaining.match(/^([0-9a-f]{4})/i)?.[1]
        : remaining.match(/^([0-9a-f]{8})/i)?.[1];
    if (!digits || !validCodePoint(Number.parseInt(digits, 16))) return true;
  }
  for (const match of content.matchAll(cssEscapePattern)) {
    const previous = match.index === 0 ? "" : content[match.index - 1];
    const plausibleCssContext = match.index === 0
      || match[2].length === 6
      || match[3].length > 0
      || /[A-Za-z0-9_:'"({,;=-]/.test(previous);
    if (plausibleCssContext && !validCodePoint(Number.parseInt(match[2], 16))) return true;
  }
  for (const [pattern, radix] of [[numericHexReferencePattern, 16], [numericDecimalReferencePattern, 10]]) {
    for (const match of content.matchAll(pattern)) {
      if (match[1].length > maxEncodedCharacters || decodedCodePoint(match[0], match[1], radix) === match[0]) return true;
    }
  }
  for (const match of content.matchAll(/(?:%[0-9a-f]{2})+/gi)) {
    try {
      decodeURIComponent(match[0]);
    } catch {
      return true;
    }
  }
  return false;
};

const encodedPrivateTermVariants = (privateTerms) => {
  const encoded = new Set();
  for (const term of privateTerms) {
    let layer = new Set([term, term.toLocaleLowerCase("en"), term.toLocaleUpperCase("en")]);
    for (let depth = 0; depth <= maxDecodedDepth; depth += 1) {
      const next = new Set();
      for (const value of layer) {
        const bytes = Buffer.from(value, "utf8");
        for (const candidate of [bytes.toString("base64"), bytes.toString("base64url")]) {
          encoded.add(candidate);
          encoded.add(candidate.replace(/=+$/, ""));
          next.add(candidate);
          next.add(candidate.replace(/=+$/, ""));
        }
      }
      layer = next;
    }
  }
  return encoded;
};

const whitespaceWrappedEncodedCandidates = (content) => [...content.matchAll(/[A-Za-z0-9_+/-]+(?:[ \t\r\n\f]+[A-Za-z0-9_+/-]+)+={0,2}/g)]
  .map((match) => match[0].replace(/[ \t\r\n\f]+/g, ""));

const containsEncodedPrivatePolicyTerm = (content, privateTerms) => {
  if (privateTerms.size === 0) return false;
  const terms = [...privateTerms];
  const queue = [
    ...[...content.matchAll(/[A-Za-z0-9_+/-]{4,}={0,2}/g)].map((match) => ({ candidate: match[0], depth: 0 })),
    ...whitespaceWrappedEncodedCandidates(content).map((candidate) => ({ candidate, depth: 0 })),
  ];
  const seen = new Set();
  let inspected = 0;
  while (queue.length > 0) {
    const { candidate, depth } = queue.shift();
    if (seen.has(candidate) || candidate.length > maxEncodedCharacters) continue;
    seen.add(candidate);
    const decoded = decodePrintableBase64(candidate, 3);
    if (typeof decoded !== "string") continue;
    inspected += 1;
    if (inspected > maxEncodedCandidates) return true;
    if (terms.some((term) => containsPrivateTerm(decoded, term))) return true;
    if (depth >= maxDecodedDepth) continue;
    for (const match of decoded.matchAll(/[A-Za-z0-9_+/-]{4,}={0,2}/g)) {
      queue.push({ candidate: match[0], depth: depth + 1 });
    }
    for (const wrapped of whitespaceWrappedEncodedCandidates(decoded)) {
      queue.push({ candidate: wrapped, depth: depth + 1 });
    }
  }
  return false;
};

const privacyFailuresForText = (file, content, allowedEntities, privateTerms, depth = 0, parseStructured = true, normalizationDepth = 0) => {
  const failures = [];
  const contentWithoutIntegrityDigests = content.replace(integrityDigestInTextPattern, "");

  if (containsPrivateIp(content)) failures.push(`${file}: private IP address`);
  if (privateHostnamePattern.test(content) || estateHostnamePattern.test(content) || containsPrivateAssignedHostname(content) || containsPrivateUrlHostname(content)) failures.push(`${file}: private hostname`);
  if (containsMalformedOrOversizedUrl(content)) failures.push(`${file}: malformed or oversized URL`);
  if (containsMalformedHostAssignment(content)) failures.push(`${file}: malformed host assignment`);
  if (localPathPattern.test(content) || windowsLocalPathPattern.test(content)) failures.push(`${file}: local filesystem path`);
  if (credentialShapePattern.test(content)) failures.push(`${file}: credential-shaped content`);
  if (jwtPattern.test(content)) failures.push(`${file}: JWT-shaped content`);
  if (bearerPattern.test(content)) failures.push(`${file}: bearer credential`);
  failures.push(...credentialTransportFailures(file, content));
  if (homeAssistantCredentialShapePattern.test(contentWithoutIntegrityDigests)) failures.push(`${file}: Home Assistant token-shaped content`);
  if (hasInvalidTextualEncoding(content)) failures.push(`${file}: invalid textual encoding`);
  for (const term of privateTerms) {
    if (term && containsPrivateTerm(content, term)) {
      failures.push(`${file}: private policy term`);
    }
  }
  const contentWithoutWhitespace = content.replace(/\s+/g, "");
  for (const encodedTerm of encodedPrivateTermVariants(privateTerms)) {
    if (encodedTerm && (content.includes(encodedTerm) || contentWithoutWhitespace.includes(encodedTerm))) {
      failures.push(`${file}: encoded private policy term`);
    }
  }
  if (containsEncodedPrivatePolicyTerm(content, privateTerms)) failures.push(`${file}: encoded private policy term`);

  if (parseStructured) {
    try {
      failures.push(...structuredSensitiveFailures(file, JSON.parse(content), allowedEntities, privateTerms, depth, normalizationDepth));
    } catch {
      // Non-JSON text is covered by the line and XML parsers below.
    }
  }

  for (const line of content.split(/\r?\n/)) {
    failures.push(...sensitiveAssignmentFailures(file, line));
  }
  const sensitiveXmlElements = [...content.matchAll(xmlSensitivePattern)];
  for (const match of sensitiveXmlElements) {
    failures.push(...sensitiveFailures(file, match[2], match[3]));
  }
  if ([...content.matchAll(xmlSensitiveStartPattern)].length !== sensitiveXmlElements.length) failures.push(`${file}: malformed sensitive XML element`);

  for (const match of content.matchAll(entityCandidatePattern)) {
    const entity = match[0];
    if (!homeAssistantEntityDomains.has(match[1])) continue;
    if (!exampleEntityPattern.test(entity)) failures.push(`${file}: entity id is not unmistakably fictional: ${entity}`);
    else if (!allowedEntities.has(entity)) failures.push(`${file}: unapproved example entity id ${entity}`);
  }

  let inspected = 0;
  const encodedCandidates = [
    ...[...content.matchAll(encodedTextPattern)].map((match) => match[0]),
    ...whitespaceWrappedEncodedCandidates(content),
  ];
  for (const rawCandidate of encodedCandidates) {
    const candidates = new Set([rawCandidate, ...rawCandidate.split("/")]);
    const integrityPayload = rawCandidate.match(/^sha(?:256|384|512)-(.+)$/i)?.[1];
    if (integrityPayload) candidates.add(integrityPayload);
    for (const candidate of candidates) {
      if (candidate.length < 16) continue;
      if (candidate.length > maxEncodedCharacters) {
        failures.push(`${file}: encoded text candidate exceeds ${maxDecodedBytes} decoded bytes`);
        continue;
      }
      const decoded = decodePrintableBase64(candidate);
      if (decoded === null) {
        failures.push(`${file}: encoded text candidate exceeds ${maxDecodedBytes} decoded bytes`);
        continue;
      }
      if (decoded === undefined || decoded === candidate) continue;
      if (inspected >= maxEncodedCandidates) {
        failures.push(`${file}: encoded text candidate limit exceeded`);
        return failures;
      }
      inspected += 1;
      if (depth >= maxDecodedDepth) {
        failures.push(`${file}: encoded text nesting exceeds ${maxDecodedDepth} layers`);
        continue;
      }
      failures.push(...privacyFailuresForText(`${file} [decoded base64 layer ${depth + 1}]`, decoded, allowedEntities, privateTerms, depth + 1));
    }
  }

  const decodedText = decodeTextualEscapes(content);
  if (decodedText !== content) {
    if (normalizationDepth >= maxDecodedDepth) failures.push(`${file}: textual encoding nesting exceeds ${maxDecodedDepth} layers`);
    else failures.push(...privacyFailuresForText(`${file} [decoded textual escapes layer ${normalizationDepth + 1}]`, decodedText, allowedEntities, privateTerms, depth, false, normalizationDepth + 1));
  }

  return failures;
};

export const privacyFailuresForFile = (file, bytes, allowedEntities = new Set(), privateTerms = new Set()) => {
  const normalizedFile = file.replaceAll("\\", "/");
  const extension = extname(normalizedFile).toLowerCase();
  const failures = [];

  failures.push(...privacyFailuresForText(`${normalizedFile} [path]`, normalizedFile, allowedEntities, privateTerms));

  if (binaryExtensions.has(extension)) failures.push(`${normalizedFile}: unapproved binary artifact`);
  if (isUnapprovedGeneratedArtifact(normalizedFile)) failures.push(`${normalizedFile}: unapproved generated artifact`);

  let content;
  try {
    content = utf8Decoder.decode(bytes);
  } catch {
    failures.push(`${normalizedFile}: unapproved binary or non-UTF-8 content`);
    return failures;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) {
    failures.push(`${normalizedFile}: unapproved binary control bytes`);
    return failures;
  }

  failures.push(...privacyFailuresForText(normalizedFile, content, allowedEntities, privateTerms));

  return [...new Set(failures)];
};

export const scanRepository = ({ requirePrivatePolicy = false } = {}) => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
    .split("\0").filter(Boolean);
  const allowedEntities = new Set(JSON.parse(readFileSync("examples/public-entities.json", "utf8")));
  const encodedPrivateTerms = process.env.ALX_PRIVACY_TERMS_B64;
  if (requirePrivatePolicy && !encodedPrivateTerms) {
    return { files, failures: ["private privacy policy is required but unavailable"] };
  }
  let privateTerms = new Set();
  if (encodedPrivateTerms) {
    try {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedPrivateTerms) || encodedPrivateTerms.length % 4 !== 0) throw new Error();
      const decodedPolicy = Buffer.from(encodedPrivateTerms, "base64");
      if (decodedPolicy.length > maxPrivatePolicyBytes
        || decodedPolicy.toString("base64") !== encodedPrivateTerms) throw new Error();
      const textPolicy = utf8Decoder.decode(decodedPolicy);
      if (/[^\t\n\r\x20-\x7e]/.test(textPolicy)) throw new Error();
      privateTerms = new Set(textPolicy.split(/\r?\n/).map((term) => term.trim()).filter(Boolean));
      if (privateTerms.size === 0 || [...privateTerms].some((term) => term.length < 3)) throw new Error();
    } catch {
      return { files, failures: ["private privacy policy is invalid"] };
    }
  }
  const failures = [];

  for (const file of files) {
    try {
      const status = lstatSync(file);
      if (!status.isFile()) {
        failures.push(`${file}: unapproved non-regular repository entry`);
        continue;
      }
      failures.push(...privacyFailuresForFile(file, readFileSync(file), allowedEntities, privateTerms));
    } catch (error) {
      failures.push(`${file}: could not inspect file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { files, failures: [...new Set(failures)] };
};

const main = () => {
  const { files, failures } = scanRepository({ requirePrivatePolicy: process.argv.includes("--require-private-policy") });
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(`privacy guard passed (${files.length} tracked and untracked files)`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

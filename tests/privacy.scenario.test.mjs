import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { privacyFailuresForFile } from "../tools/privacy-guard.mjs";
import { inspectPng } from "../tools/release-artifact-privacy.mjs";

const bytes = (value) => Buffer.from(value, "utf8");
const encode = (value, encoding = "base64") => Buffer.from(value, "utf8").toString(encoding);
const PUBLIC_FIXTURE_LABELS = new Set([
  "Default", "Explicit", "Heat", "Out", "Rain", "Rain est.", "Target", "Zone A", "Zone B",
]);

describe("public repository privacy", () => {
  it("scenario: disclosure artifacts fail closed across text formats and credential shapes", () => {
    const localPath = ["", "Users", "private-user", "project", "source.ts"].join("/");
    const privateHost = ["homeassistant", "private", "internal"].join(".");
    const privateIp = [192, 168, 1, 5].join(".");
    const linkLocalIpv4 = [169, 254, 42, 1].join(".");
    const sharedIpv4 = [100, 100, 100, 100].join(".");
    const privateIpv6 = ["fd12", "3456", "", "1"].join(":");
    const linkLocalIpv6 = ["fe80", "", "1"].join(":");
    const loopbackIpv6 = ["", "", "1"].join(":");
    const jwt = ["eyJ" + "a".repeat(16), "b".repeat(20), "c".repeat(20)].join(".");
    const bearer = ["Bearer", jwt].join(" ");
    const basicCredential = encode(["example-user", "actual-private-pass"].join(":"));
    const longCredentialFixture = "h".repeat(160);
    const assignmentKeyFixture = ["HOME_ASSISTANT", "TOKEN"].join("_");
    const xmlCredentialFixture = ["<client_", "secret>actual-private-value</client_", "secret>"].join("");
    const xmlAttributedCredentialFixture = ["<client_", "secret type=\"text\">actual-private-value</client_", "secret>"].join("");
    const xmlNamespacedCredentialFixture = ["<ns:", "password>actual-private-value</ns:", "password>"].join("");
    const subjectKeyFixture = ["auth", "subject"].join("_");
    const privateEntity = ["climate", "private_zone"].join(".");
    const nestedEncodedEntity = encode(encode(privateEntity), "base64url");
    const integrityEncodedEntity = `sha512-${encode(privateEntity)}`;
    const urlEncodedEntity = `https://example.com/${encode(privateEntity, "base64url")}`;
    const utf16EncodedEntity = Buffer.from(privateEntity, "utf16le").toString("base64");
    const lineWrappedEntity = `${encode(privateEntity).slice(0, 12)}\n${encode(privateEntity).slice(12)}`;
    const spaceWrappedEntity = encode(privateEntity).match(/.{1,4}/g).join(" ");
    const overNestedText = encode(encode(encode(encode("ordinary public sentence"))));
    const tooManyEncodedCandidates = Array.from({ length: 65 }, () => encode("ordinary public sentence")).join("\n");
    const fixtures = [
      ["fixture.map", JSON.stringify({ sources: [localPath] }), ["unapproved generated artifact", "local filesystem path"]],
      ["fixture.env", `${assignmentKeyFixture}=${longCredentialFixture}`, ["generic secret assignment", "Home Assistant token-shaped content"]],
      ["fixture.txt", `Authorization: ${bearer}`, ["JWT-shaped content", "bearer credential"]],
      ["basic-auth.txt", [["Authorization", "Basic"].join(": "), basicCredential].join(" "), ["Basic credential"]],
      ["curl-command.sh", [["curl", "-u"].join(" "), ["example-user", "actual-private-pass"].join(":"), "https://example.com"].join(" "), ["CLI user credential"]],
      ["curl-attached-command.sh", [["curl", "-u"].join(" ").trim(), ["example-user", "actual-private-pass"].join(":"), " https://example.com"].join(""), ["CLI user credential"]],
      ["database-url.env", [["DATABASE", "URL"].join("_"), ["postgres://", "example-user", ":", "actual-private-value", "@example.com/db"].join("")].join("="), ["URI userinfo credential"]],
      ["percent-database-url.env", [["DATABASE", "URL"].join("_"), ["postgres://", "example-user", ":", "actual%252dprivate%252dvalue", "@example.com/db"].join("")].join("="), ["URI userinfo credential"]],
      ["protocol-relative-userinfo.html", ["//", "example-user", ":", "actual-private-pass", "@example.com/path"].join(""), ["URI userinfo credential"]],
      ["no-slash-userinfo.html", ["http:", "example-user", ":", "actual-private-pass", "@example.com/path"].join(""), ["URI userinfo credential"]],
      ["shell-userinfo-prefix.sh", [["curl", "-u"].join(" "), ["$EXAMPLE_USER", "actual-private-pass"].join(":"), " https://example.com"].join(""), ["CLI user credential"]],
      ["secret-access-key.env", [["AWS", "SECRET", "ACCESS", "KEY"].join("_"), "k".repeat(40)].join("="), ["generic secret assignment"]],
      ["token-value.env", [["API", "TOKEN", "VALUE"].join("_"), "actual-private-value"].join("="), ["generic secret assignment"]],
      ["api-key-value.env", [["API", "KEY", "VALUE"].join("_"), "actual-private-value"].join("="), ["generic secret assignment"]],
      ["secret-key-base.yml", [["SECRET", "KEY", "BASE"].join("_"), "actual-private-value"].join(": "), ["generic secret assignment"]],
      ["fixture.xml", `<config><endpoint>https://${privateHost}</endpoint><ip>${privateIp}</ip>${xmlCredentialFixture}</config>`, ["private hostname", "private IP address", "generic secret assignment"]],
      ...[0x3002, 0xff0e, 0xff61].map((codePoint) => [
        "idna-private-host.yml",
        `endpoint: https://${["homeassistant", "private", "internal"].join(String.fromCodePoint(codePoint))}/`,
        ["private hostname"],
      ]),
      ["attributed.xml", xmlAttributedCredentialFixture, ["generic secret assignment"]],
      ["namespaced.xml", xmlNamespacedCredentialFixture, ["generic secret assignment"]],
      ["malformed-sensitive.xml", ["<to", "ken encoding=\"plain\">actual-private-value"].join(""), ["malformed sensitive XML element"]],
      ["ipv4-link-local.yml", `endpoint: http://${linkLocalIpv4}/`, ["private IP address"]],
      ["ipv4-shared.yml", `endpoint: http://${sharedIpv4}/`, ["private IP address"]],
      ["ipv4-decimal-url.yml", `endpoint: ${["http://", "3232235777", "/"].join("")}`, ["private IP address"]],
      ["ipv4-hex-url.yml", `endpoint: ${["http://", "0xC0A80101", "/"].join("")}`, ["private IP address"]],
      ["ipv4-octal-url.yml", `endpoint: ${["http://", "0300", ".", "0250", ".", "0001", ".", "0001/"].join("")}`, ["private IP address"]],
      ["ipv4-short-url.yml", `endpoint: ${["http://", 192, ".", 168, ".", 1, "/"].join("")}`, ["private IP address"]],
      ["ipv4-link-local-short-url.yml", `endpoint: ${["http://", 169, ".", 254, ".", 1, "/"].join("")}`, ["private IP address"]],
      ["ipv4-protocol-relative.html", `href=${["//", "3232235777", "/path"].join("")}`, ["private IP address"]],
      ["ipv4-no-slash.html", `href=${["http:", "3232235777", "/path"].join("")}`, ["private IP address"]],
      ["ipv4-websocket.yml", `endpoint: ${["ws://", "3232235777", "/api/websocket"].join("")}`, ["private IP address"]],
      ["ipv4-ftp.yml", `endpoint: ${["ftp://", "0xC0A80101", "/path"].join("")}`, ["private IP address"]],
      ["idna-protocol-relative.html", `href=${["//homeassistant", String.fromCodePoint(0x3002), "private", String.fromCodePoint(0x3002), "internal/path"].join("")}`, ["private hostname"]],
      ["idna-websocket.yml", `endpoint: ${["wss://homeassistant", String.fromCodePoint(0xff0e), "private", String.fromCodePoint(0xff0e), "internal/api"].join("")}`, ["private hostname"]],
      ...[
        ["host", 0x3002],
        ["server", 0xff0e],
        ["hostname", 0xff61],
      ].map(([key, codePoint]) => [
        "idna-private-host-assignment.yml",
        `${key}: ${["homeassistant", "private", "internal"].join(String.fromCodePoint(codePoint))}`,
        ["private hostname"],
      ]),
      ...["\t", "\r", "\n"].map((control) => [
        "ipv4-url-preprocessing.html",
        `href=${["http://", "3232", control, "235777/path"].join("")}`,
        ["private IP address"],
      ]),
      ["ipv4-decimal-host.yml", `host: ${["3232", "235777"].join("")}`, ["private IP address"]],
      ["ipv4-hex-address.env", `address=${["0xC0", "A80101"].join("")}`, ["private IP address"]],
      ["ipv4-octal-host.yml", `host: ${["0300", ".", "0250", ".", "0001", ".", "0001"].join("")}`, ["private IP address"]],
      ["ipv4-short-host.yml", `endpoint_host: ${[192, 168, 1].join(".")}`, ["private IP address"]],
      ["ipv4-decimal-server.yml", `server: ${["3232", "235777"].join("")}`, ["private IP address"]],
      ["ipv4-hex-ip.yml", `ip: ${["0xC0", "A80101"].join("")}`, ["private IP address"]],
      ["ipv4-octal-endpoint.yml", `endpoint: ${["0300", ".", "0250", ".", "0001", ".", "0001"].join("")}`, ["private IP address"]],
      ["ipv4-short-bind-host.yml", `bind_host: ${[192, 168, 1].join(".")}`, ["private IP address"]],
      ["ipv4-camel-bind-host.mjs", `{bindHost:${["3232", "235777"].join("")}}`, ["private IP address"]],
      ["ipv4-camel-server-address.mjs", `{serverAddress:'${["0xC0", "A80101"].join("")}'}`, ["private IP address"]],
      ["idna-camel-hostname.mjs", `{homeAssistantHostname:'${["homeassistant", "private", "internal"].join(String.fromCodePoint(0x3002))}'}`, ["private hostname"]],
      ["ipv4-semicolon-host.env", `host=${["3232", "235777"].join("")};`, ["private IP address"]],
      ["ipv4-closing-paren-host.env", `bind_host=${["0xC0", "A80101"].join("")})`, ["private IP address"]],
      ["ipv4-commented-server.yml", `server: ${["0300", ".", "0250", ".", "0001", ".", "0001"].join("")}; # comment`, ["private IP address"]],
      ["malformed-host.yml", `host: ${[999, 999, 999, 999].join(".")}`, ["malformed host assignment"]],
      ["oversized-host.yml", `host: ${["3232", "235777", "-".repeat(600)].join("")}`, ["malformed host assignment"]],
      ["malformed-url.html", ["href=http://", "[broken"].join(""), ["malformed or oversized URL"]],
      ["oversized-url.html", ["href=http://example.com/", "x".repeat(2050)].join(""), ["malformed or oversized URL"]],
      ["ipv6-ula.yml", `endpoint: http://[${privateIpv6}]/`, ["private IP address"]],
      ["ipv6-link-local.yml", `endpoint: http://[${linkLocalIpv6}]/`, ["private IP address"]],
      ["ipv6-loopback.yml", `endpoint: http://[${loopbackIpv6}]/`, ["private IP address"]],
      ["ipv6-ula-sentence.md", `The endpoint was ${privateIpv6}.`, ["private IP address"]],
      ["ipv6-loopback-sentence.md", `The endpoint was ${loopbackIpv6}.`, ["private IP address"]],
      ["ipv6-ula-colon.md", `Endpoint ${privateIpv6}: unavailable`, ["private IP address"]],
      ["fixture", `${subjectKeyFixture}: oidc-user-123`, ["authentication subject"]],
      ["compact.json", JSON.stringify({ nested: { [["client_", "secret"].join("")]: "actual-private-value" } }), ["generic secret assignment"]],
      ["literal.yml", ["to", "ken: ${{ \"literal\" }}"].join(""), ["generic secret assignment"]],
      ["encoded.txt", nestedEncodedEntity, ["decoded base64 layer 2", `entity id is not unmistakably fictional: ${privateEntity}`]],
      ["integrity-lookalike.txt", integrityEncodedEntity, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["url-encoded.txt", urlEncodedEntity, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["javascript.mjs", ['const api', 'Key', ' = "actual-private-value";'].join(""), ["generic secret assignment"]],
      ["javascript-object.mjs", ['const config={api', 'Key', ':"actual-private-value"}'].join(""), ["generic secret assignment"]],
      ["shell.env", ['export API_', 'KEY', '="actual-private-value"'].join(""), ["generic secret assignment"]],
      ["inline.yml", ['config: { client_', 'secret', ': "actual-private-value" }'].join(""), ["generic secret assignment"]],
      ["entity-url.txt", `https://example.com/api/states/${privateEntity}`, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["utf16-encoded.txt", utf16EncodedEntity, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["line-wrapped.txt", lineWrappedEntity, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["space-wrapped.txt", spaceWrappedEntity, [`entity id is not unmistakably fictional: ${privateEntity}`]],
      ["over-nested.txt", overNestedText, ["encoded text nesting exceeds 3 layers"]],
      ["too-many-encoded.txt", tooManyEncodedCandidates, ["encoded text candidate limit exceeded"]],
    ];

    for (const [file, content, expected] of fixtures) {
      const failures = privacyFailuresForFile(file, bytes(content)).join("\n");
      for (const message of expected) expect(failures, file).toContain(message);
    }
    for (const [key, value] of [
      [["token", "url"].join("_"), "https://example.com/oauth/token"],
      [["token", "endpoint"].join("_"), "https://example.com/oauth/token"],
      [["token", "type"].join("_"), "Bearer"],
      [["password", "policy"].join("_"), "minimum-12-characters"],
      [["private", "key", "path"].join("_"), "/etc/ssl/example.pem"],
      [["secret", "name"].join("_"), "production-database"],
      ["endpoint", "http://example.com:${PORT}/api"],
      ["endpoint", "http://example.com:PORT/api"],
      ["command", [["curl", "-u"].join(" "), "\"", "$EXAMPLE_USER", ":", "$EXAMPLE_PASSWORD", "\" https://example.com"].join("")],
      ["endpoint", ["postgres://", "$EXAMPLE_USER", ":", "$EXAMPLE_PASSWORD", "@example.com/db"].join("")],
      [["build", "id"].join("_"), ["3232", "235777"].join("")],
      [["device", "id"].join("_"), ["0xC0", "A80101"].join("")],
    ]) {
      expect(privacyFailuresForFile("public-metadata.yml", bytes(`${key}: ${value}`)), key).toEqual([]);
    }
    expect(privacyFailuresForFile("capture.png", Buffer.from([0, 255])).join("\n")).toContain("unapproved binary artifact");

    const runtimeKeyFixture = ["GH", "TOKEN"].join("_");
    const runtimeExpression = "$" + "{{ github.token }}";
    const publicDocumentation = `${runtimeKeyFixture}: ${runtimeExpression}\nBearer tokens are documented at https://developers.home-assistant.io/`;
    expect(privacyFailuresForFile("docs/public-reference.md", bytes(publicDocumentation))).toEqual([]);
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression}actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression},actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression};actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: example,actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`- ${runtimeKeyFixture}: ${runtimeExpression},actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`? ${runtimeKeyFixture}: ${runtimeExpression};actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.sh", bytes(`declare -x ${runtimeKeyFixture}=\${GH_TOKEN},actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.sh", bytes(`readonly ${runtimeKeyFixture}=\${GH_TOKEN};actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression} # actual-private-value`)).join("\n")).toContain("generic secret assignment");
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression} // actual-private-value`)).join("\n")).toContain("generic secret assignment");
    const literalExpression = "$" + "{{ \"actual-private-value\" }}";
    expect(privacyFailuresForFile("suffix.yml", bytes(`${runtimeKeyFixture}: ${runtimeExpression}${literalExpression}`)).join("\n")).toContain("generic secret assignment");
    const lockIntegrity = `sha512-${Buffer.alloc(96, 0xa5).toString("base64")}`;
    expect(privacyFailuresForFile("package-lock.json", bytes(JSON.stringify({ integrity: lockIntegrity })))).toEqual([]);
    expect(privacyFailuresForFile("fixture.txt", bytes("North Annex"), new Set(), new Set(["north annex"]))).toContain("fixture.txt: private policy term");
    expect(privacyFailuresForFile("fixture.txt", bytes(encode("Loft")), new Set(), new Set(["Loft"]))).toContain("fixture.txt: encoded private policy term");
    expect(privacyFailuresForFile("fixture.txt", bytes(encode("lOfT")), new Set(), new Set(["Loft"]))).toContain("fixture.txt: encoded private policy term");
    const privateRoomPolicy = new Set(["Loft"]);
    for (const encodedRoom of ['{"label":"\\u004coft"}', 'label: "\\x4coft"', 'label: "\\u{4c}oft"', 'label: "&#76;oft"', 'label: "&#x4c;oft"', 'label: "%4coft"']) {
      expect(privacyFailuresForFile("escaped.txt", bytes(encodedRoom), new Set(), privateRoomPolicy).join("\n"), encodedRoom).toContain("private policy term");
    }
    for (const malformed of [["\\", "xG1"].join(""), ["%", "ZZ"].join(""), ["&", "#xZZ;"].join("")]) {
      expect(privacyFailuresForFile("malformed.txt", bytes(malformed)).join("\n"), malformed).toContain("invalid textual encoding");
    }
    const overNestedEncoding = ["\\", "u005c", "u005c", "u005c", "u0053tudy"].join("");
    expect(privacyFailuresForFile("over-nested.txt", bytes(overNestedEncoding), new Set(), new Set([["Stu", "dy"].join("")])).join("\n")).toContain("textual encoding nesting exceeds 3 layers");
    const mixedEscapePolicy = new Set([["Stu", "dy"].join("")]);
    for (const mixedEscape of [
      `${"\\".repeat(3)}u0053tudy`,
      ["\\", "U00000053tudy"].join(""),
      ["&", "#00000083;tudy"].join(""),
      ["&", "#x0000053;tudy"].join(""),
    ]) {
      expect(privacyFailuresForFile("mixed-escape.txt", bytes(mixedEscape), new Set(), mixedEscapePolicy).join("\n"), mixedEscape).toContain("private policy term");
    }
    const escapedEntityJson = ['{"entity":"climate', "\\", 'u002eprivate_zone"}'].join("");
    expect(privacyFailuresForFile("escaped.json", bytes(escapedEntityJson)).join("\n")).toContain(`entity id is not unmistakably fictional: ${privateEntity}`);
    expect(privacyFailuresForFile("escaped.txt", bytes(["climate", "%2E", "private_zone"].join(""))).join("\n")).toContain(`entity id is not unmistakably fictional: ${privateEntity}`);
    for (const encodedEntity of [
      ["weather", "&period;", "home"].join(""),
      ["script", "&period;", "private", "&lowbar;", "away", "&lowbar;", "start"].join(""),
      ["weather", "\\", "2e home"].join(""),
    ]) {
      expect(privacyFailuresForFile("browser-escaped.md", bytes(encodedEntity)).join("\n"), encodedEntity).toContain("entity id is not unmistakably fictional");
    }
    for (const cssEntity of [
      ["weather", "\\", ".home"].join(""),
      ["script", "\\", ".private_away_start"].join(""),
      ["weather.", "\\", "\nhome"].join(""),
    ]) {
      expect(privacyFailuresForFile("browser-escaped.css", bytes(cssEntity)).join("\n"), cssEntity).toContain("entity id is not unmistakably fictional");
    }
    const cssContinuedPrivateTerm = ["Stu", "\\", "\ndy"].join("");
    expect(privacyFailuresForFile("browser-escaped.css", bytes(cssContinuedPrivateTerm), new Set(), new Set([["Stu", "dy"].join("")])).join("\n")).toContain("private policy term");
    const embeddedCssEntity = ["const styles = css`weather", "\\", ".home {}`;"].join("");
    expect(privacyFailuresForFile("src/card.ts", bytes(embeddedCssEntity)).join("\n")).toContain("entity id is not unmistakably fictional");
    const jsonCssEntity = JSON.stringify({ css: ["weather", "\\", ".home { }"].join("") });
    expect(privacyFailuresForFile("theme.json", bytes(jsonCssEntity)).join("\n")).toContain("entity id is not unmistakably fictional");
    const embeddedCssContinuation = ["const styles = css`content:\"Stu", "\\", "\ndy\";`;"].join("");
    expect(privacyFailuresForFile("src/card.ts", bytes(embeddedCssContinuation), new Set(), new Set([["Stu", "dy"].join("")])).join("\n")).toContain("private policy term");
    const yamlContinuedEntity = ["entity: \"weather.", "\\", "\n  home\""].join("");
    expect(privacyFailuresForFile("probe.yaml", bytes(yamlContinuedEntity)).join("\n")).toContain("entity id is not unmistakably fictional");
    const yamlContinuedPrivateTerm = ["label: \"Stu", "\\", "\n  dy\""].join("");
    expect(privacyFailuresForFile("probe.yml", bytes(yamlContinuedPrivateTerm), new Set(), new Set([["Stu", "dy"].join("")])).join("\n")).toContain("private policy term");
    for (const domain of ["calendar", "todo", "update", "text", "event"]) {
      const omittedDomainEntity = [domain, "private_zone"].join(".");
      expect(privacyFailuresForFile("omitted-domain.yml", bytes(omittedDomainEntity)).join("\n"), omittedDomainEntity).toContain(`entity id is not unmistakably fictional: ${omittedDomainEntity}`);
    }
    const encodedPrivateEntity = encode(privateEntity);
    for (const width of [1, 2, 3, 5, 6, 7]) {
      const parts = encodedPrivateEntity.match(new RegExp(`.{1,${width}}`, "g"));
      for (const whitespace of ["\n", " ", "\t"]) {
        const wrapped = parts.join(whitespace);
        expect(privacyFailuresForFile("arbitrary-wrap.txt", bytes(wrapped)).join("\n"), `${width}:${JSON.stringify(whitespace)}`).toContain(`entity id is not unmistakably fictional: ${privateEntity}`);
      }
    }
    const privateLabelFixture = ["Stu", "dy"].join("");
    expect(privacyFailuresForFile(`docs/${privateLabelFixture}-notes.md`, bytes("public text"), new Set(), new Set([privateLabelFixture])).join("\n")).toContain("private policy term");
  });

  it("scenario: visual evidence rejects hidden bytes after the PNG image stream", () => {
    const crcTable = Array.from({ length: 256 }, (_, value) => {
      let crc = value;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      return crc >>> 0;
    });
    const crc32 = (content) => {
      let crc = 0xffffffff;
      for (const byte of content) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
      const typeBytes = Buffer.from(type, "ascii");
      const result = Buffer.alloc(12 + data.length);
      result.writeUInt32BE(data.length, 0);
      typeBytes.copy(result, 4);
      data.copy(result, 8);
      result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
      return result;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1170, 0);
    header.writeUInt32BE(2532, 4);
    header.set([8, 2, 0, 0, 0], 8);
    const image = Buffer.alloc((1170 * 3 + 1) * 2532);
    const hidden = Buffer.from(["weather", "home"].join("."));
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(image)),
      chunk("IDAT", hidden),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    expect(() => inspectPng("hidden.png", png)).toThrow("IDAT is not a valid bounded zlib image stream");
  });

  it("scenario: public fixtures use only explicit fictional entities and labels", () => {
    const entities = JSON.parse(readFileSync("examples/public-entities.json", "utf8"));
    expect(entities).not.toHaveLength(0);
    expect(entities.every((entity) => /^[a-z0-9_]+\.example_[a-z0-9_]+$/.test(entity))).toBe(true);

    const fixtureSources = [
      readFileSync("examples/cards.yaml", "utf8"),
      readFileSync("preview/preview.mjs", "utf8"),
      readFileSync("tests/history.scenario.test.ts", "utf8"),
    ].join("\n");
    const fixtureLabels = [...fixtureSources.matchAll(/\blabel:\s*(?:["']([^"']+)["']|([^,}\n]+))/g)]
      .map((match) => (match[1] ?? match[2]).trim());
    expect(fixtureLabels).toContain("Zone A");
    expect(fixtureLabels).toContain("Zone B");
    expect(fixtureLabels.filter((label) => !PUBLIC_FIXTURE_LABELS.has(label))).toEqual([]);
  });
});

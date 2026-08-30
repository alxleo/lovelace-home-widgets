# LLM-assisted Home Assistant workflow

The recurring successful pattern is not “let an LLM edit YAML.” It is a narrow
contract with inspectable inputs, reversible writes, and a rendered journey.

## Useful evidence

- [ha-mcp](https://github.com/homeassistant-ai/ha-mcp) demonstrates typed Home
  Assistant tools, dashboard backups, and rendered screenshot support.
- [HA NOVA](https://github.com/markusleben/ha-nova/blob/008c2a968933140802b319a54b21a32ff9803191/docs/reference/safety.md)
  demonstrates preview-bound confirmation, readback, and recent-step reverts.
- [homeassistant-claude-kit](https://github.com/dcb/homeassistant-claude-kit/tree/c0d05e21bf6e6faac0e95da303c900d91d2ce130)
  shows useful climate information architecture, but replacing Lovelace with a
  second React panel adds an unnecessary deployment and authentication surface.
- [Puppet](https://github.com/balloob/home-assistant-addons/tree/8cafe6e2fe1f240918001b7ab58e8263b477ed04/puppet)
  is useful evidence that a real HA frontend can be rendered headlessly. Its
  prototype server and token handling require a separately reviewed deployment;
  it is not a default dependency of these cards.

## Working contract

1. Read exact entity/config state and the pinned implementation contract.
2. Draft against fictional fixtures and render at the target mobile viewport.
3. Keep actions inert until the backend owns authorization, rollback, expiry,
   and physical readback.
4. Save the current dashboard before a write, bind approval to the exact diff,
   then read back the stored result.
5. Verify through the same identity, route, device class, and navigation used by
   the person accepting the change. An HTTP response or synthetic screenshot is
   supporting evidence only.
6. Retain compact receipts: source revision, release checksum, before/after
   hashes, viewport, scenario, and artifact URL. Do not retain chat transcripts
   or screenshot binaries as source documentation.

## Preview harness boundary

This repository’s Playwright harness is deterministic and credential-free. It
can catch layout overflow, missing labels, stale scroll anchoring, wrong action
payloads, and unclear failure states before touching a home. It cannot prove
SSO linking, recorder retention, real entity semantics, action authorization,
receiver state, or schedule restoration. Those remain deployment acceptance
gates in the consuming repository.

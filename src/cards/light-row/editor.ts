import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { fireConfigChanged, type HomeAssistant } from "../../shared/home-assistant";
import { parseLightRowConfig } from "./model";

@customElement("alx-light-row-card-editor")
export class LightRowEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: Record<string, unknown>;
  setConfig(value: Record<string, unknown>): void { this.config = { ...value, ...parseLightRowConfig(value) }; }
  protected render() {
    return html`<ha-form .hass=${this.hass} .data=${this.config} .schema=${[
      { name: "entity", required: true, selector: { entity: { domain: "light" } } },
      { name: "name", selector: { text: {} } },
      { name: "group", selector: { boolean: {} } },
      ...(this.config?.group ? [{ name: "scene_entity", selector: { entity: { domain: "select" } } }] : []),
    ]} .computeLabel=${(item: { name: string }) => ({ entity: "Light", name: "Display name", group: "Room / group row", scene_entity: "Room scene selector" })[item.name as "entity"]} @value-changed=${(inputEvent: CustomEvent<{ value: Record<string, unknown> }>) => {
      const next = { ...this.config, ...inputEvent.detail.value };
      if (!next.group) delete next.scene_entity;
      this.config = next; fireConfigChanged(this, next);
    }}></ha-form>`;
  }
}

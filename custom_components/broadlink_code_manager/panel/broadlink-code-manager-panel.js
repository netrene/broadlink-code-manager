/*
 * Broadlink Code Manager – sidebar panel (zero-build, vanilla web component).
 *
 * Reads the learned-code inventory via the `broadlink_code_manager/*` WebSocket
 * API and performs all mutations through the official `remote.*` services.
 */

const SEND = "remote.send_command";

class BroadlinkCodeManagerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._inventory = null;
    this._error = null;
    this._loading = false;
    this._filter = "";
    this._includeRaw = true;
    this._rendered = false;
  }

  set hass(hass) {
    const first = this._hass === null;
    this._hass = hass;
    if (first) {
      this._renderShell();
      this._reload();
    }
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this._hass && !this._rendered) {
      this._renderShell();
      this._reload();
    }
  }

  /* ----------------------------- data ----------------------------- */

  async _reload() {
    if (!this._hass) return;
    this._loading = true;
    this._error = null;
    this._renderBody();
    try {
      const res = await this._hass.connection.sendMessagePromise({
        type: "broadlink_code_manager/list",
      });
      this._inventory = res.remotes || [];
    } catch (err) {
      this._error = (err && err.message) || String(err);
      this._inventory = null;
    }
    this._loading = false;
    this._renderBody();
  }

  _toast(message) {
    this.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message },
        bubbles: true,
        composed: true,
      })
    );
  }

  async _callRemote(service, entityId, data) {
    const [, name] = service.split(".");
    return this._hass.callService(
      "remote",
      name,
      data,
      { entity_id: entityId }
    );
  }

  async _send(entityId, device, command) {
    try {
      await this._callRemote(SEND, entityId, { device, command });
      this._toast(`Gesendet: ${device} · ${command}`);
    } catch (err) {
      this._toast(`Fehler beim Senden: ${(err && err.message) || err}`);
    }
  }

  async _delete(entityId, device, command) {
    if (
      !window.confirm(
        `Befehl wirklich löschen?\n\n${device} · ${command}\n(${entityId})`
      )
    ) {
      return;
    }
    try {
      await this._callRemote("remote.delete_command", entityId, {
        device,
        command,
      });
      this._toast(`Gelöscht: ${device} · ${command}`);
      await this._reload();
    } catch (err) {
      this._toast(`Fehler beim Löschen: ${(err && err.message) || err}`);
    }
  }

  async _deleteDevice(entityId, device) {
    const remote = (this._inventory || []).find(
      (r) => r.entity_id === entityId
    );
    const dev = remote && remote.devices.find((d) => d.device === device);
    const commands = dev ? dev.commands.map((c) => c.command) : [];
    if (!commands.length) return;
    if (
      !window.confirm(
        `Gerät „${device}" komplett löschen?\n\n` +
          `${commands.length} Befehl(e) werden entfernt:\n` +
          `${commands.join(", ")}\n\n(${entityId})`
      )
    ) {
      return;
    }
    try {
      // remote.delete_command accepts a list of commands; removing all of a
      // device's commands makes Broadlink drop the (now empty) device.
      await this._callRemote("remote.delete_command", entityId, {
        device,
        command: commands,
      });
      this._toast(`Gerät gelöscht: ${device}`);
      await this._reload();
    } catch (err) {
      this._toast(`Fehler beim Löschen: ${(err && err.message) || err}`);
    }
  }

  _copyYaml(entityId, device, command) {
    const yaml =
      `action: remote.send_command\n` +
      `target:\n` +
      `  entity_id: ${entityId}\n` +
      `data:\n` +
      `  device: ${device}\n` +
      `  command: ${command}\n`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(yaml)
        .then(() => this._toast("YAML in die Zwischenablage kopiert"))
        .catch(() => this._toast("Kopieren fehlgeschlagen"));
    } else {
      this._toast("Zwischenablage nicht verfügbar");
    }
  }

  /* ----------------------------- learn ----------------------------- */

  _openLearn(entityId, device) {
    const existing = this.shadowRoot.querySelector(".modal-backdrop");
    if (existing) existing.remove();

    const remote = (this._inventory || []).find(
      (r) => r.entity_id === entityId
    );
    const existingDevices = remote ? remote.devices.map((d) => d.device) : [];
    const options = existingDevices
      .map((d) => `<option value="${escapeAttr(d)}"></option>`)
      .join("");

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <h2>Befehl anlernen</h2>
        <label>Remote</label>
        <input class="l-remote" value="${escapeAttr(entityId)}" readonly />
        <label>Gerät</label>
        <input class="l-device" value="${escapeAttr(device || "")}" list="bcm-devices"
          placeholder="z. B. hantech_klima" ${device ? "readonly" : ""} />
        <datalist id="bcm-devices">${options}</datalist>
        <div class="device-hint"></div>
        <label>Befehlsname</label>
        <input class="l-command" placeholder="z. B. power" />
        <div class="learn-status"></div>
        <div class="modal-actions">
          <button class="btn cancel">Abbrechen</button>
          <button class="btn primary start">Anlernen starten</button>
        </div>
      </div>`;

    backdrop.addEventListener("click", (ev) => {
      if (ev.target === backdrop) backdrop.remove();
    });
    backdrop.querySelector(".cancel").addEventListener("click", () =>
      backdrop.remove()
    );
    backdrop
      .querySelector(".start")
      .addEventListener("click", () => this._startLearn(backdrop));

    // Only offer the existence hint when the device name is editable (new).
    if (!device) {
      const deviceInput = backdrop.querySelector(".l-device");
      const hint = backdrop.querySelector(".device-hint");
      const updateHint = () => {
        const value = deviceInput.value.trim();
        if (!value) {
          hint.textContent = "";
          hint.className = "device-hint";
        } else if (existingDevices.includes(value)) {
          hint.textContent = "Bestehendes Gerät – Befehl wird ergänzt.";
          hint.className = "device-hint info";
        } else {
          hint.textContent = "Neues Gerät wird angelegt.";
          hint.className = "device-hint";
        }
      };
      deviceInput.addEventListener("input", updateHint);
    }

    this.shadowRoot.appendChild(backdrop);
    backdrop.querySelector(".l-command").focus();
  }

  async _startLearn(backdrop) {
    const entityId = backdrop.querySelector(".l-remote").value.trim();
    const device = backdrop.querySelector(".l-device").value.trim();
    const command = backdrop.querySelector(".l-command").value.trim();
    const statusEl = backdrop.querySelector(".learn-status");
    const startBtn = backdrop.querySelector(".start");

    if (!device || !command) {
      statusEl.textContent = "Gerät und Befehlsname sind erforderlich.";
      statusEl.className = "learn-status error";
      return;
    }

    startBtn.disabled = true;
    statusEl.className = "learn-status active";
    statusEl.textContent =
      "Jetzt die Taste auf der physischen Fernbedienung drücken (auf den Broadlink richten)…";

    try {
      await this._callRemote("remote.learn_command", entityId, {
        device,
        command,
      });
    } catch (err) {
      statusEl.className = "learn-status error";
      statusEl.textContent = `Fehler: ${(err && err.message) || err}`;
      startBtn.disabled = false;
      return;
    }

    // Poll the inventory until the new command shows up (learn is async).
    const deadline = Date.now() + 30000;
    let found = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await this._hass.connection.sendMessagePromise({
          type: "broadlink_code_manager/list",
        });
        const remote = (res.remotes || []).find(
          (r) => r.entity_id === entityId
        );
        const dev = remote && remote.devices.find((d) => d.device === device);
        if (dev && dev.commands.some((c) => c.command === command)) {
          found = true;
          break;
        }
      } catch (err) {
        /* keep polling */
      }
    }

    if (found) {
      this._toast(`Angelernt: ${device} · ${command}`);
      backdrop.remove();
      await this._reload();
    } else {
      statusEl.className = "learn-status error";
      statusEl.textContent =
        "Kein neuer Code erkannt (Timeout). Erneut versuchen und die Taste gedrückt halten.";
      startBtn.disabled = false;
      await this._reload();
    }
  }

  /* ----------------------------- export ----------------------------- */

  async _export(entityId, device) {
    try {
      const res = await this._hass.connection.sendMessagePromise({
        type: "broadlink_code_manager/export",
        entity_id: entityId,
        device: device || undefined,
        include_raw: this._includeRaw,
      });
      const blob = new Blob([JSON.stringify(res, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      const scope = device ? `${device}` : entityId.replace("remote.", "");
      a.href = url;
      a.download = `broadlink-codes-${scope}-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._toast("Export erstellt");
    } catch (err) {
      this._toast(`Export fehlgeschlagen: ${(err && err.message) || err}`);
    }
  }

  /* ----------------------------- render ----------------------------- */

  _renderShell() {
    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="page">
        <div class="toolbar">
          <div class="title">
            <ha-icon icon="mdi:remote"></ha-icon>
            <span>Broadlink Codes</span>
          </div>
          <input class="search" type="search" placeholder="Befehle suchen…" />
          <label class="raw-toggle">
            <input type="checkbox" class="raw-cb" checked />
            Export inkl. Codes
          </label>
          <button class="btn refresh">Aktualisieren</button>
        </div>
        <div class="body"></div>
      </div>`;

    const search = this.shadowRoot.querySelector(".search");
    search.addEventListener("input", () => {
      this._filter = search.value.toLowerCase();
      this._applyFilter();
    });
    this.shadowRoot
      .querySelector(".refresh")
      .addEventListener("click", () => this._reload());
    const rawCb = this.shadowRoot.querySelector(".raw-cb");
    rawCb.addEventListener("change", () => {
      this._includeRaw = rawCb.checked;
    });
  }

  _applyFilter() {
    const f = this._filter;
    this.shadowRoot.querySelectorAll(".cmd-row").forEach((row) => {
      const hay = row.dataset.search || "";
      row.style.display = !f || hay.includes(f) ? "" : "none";
    });
    // Hide device blocks with no visible rows.
    this.shadowRoot.querySelectorAll(".device-block").forEach((block) => {
      const anyVisible = Array.from(
        block.querySelectorAll(".cmd-row")
      ).some((r) => r.style.display !== "none");
      block.style.display = anyVisible ? "" : "none";
    });
  }

  _renderBody() {
    if (!this._rendered) return;
    const body = this.shadowRoot.querySelector(".body");
    if (!body) return;

    if (this._loading && !this._inventory) {
      body.innerHTML = `<div class="notice">Lade Codes…</div>`;
      return;
    }
    if (this._error) {
      body.innerHTML = `<div class="notice error">Fehler: ${escapeHtml(
        this._error
      )}</div>`;
      return;
    }
    if (!this._inventory || this._inventory.length === 0) {
      body.innerHTML = `<div class="notice">Keine Broadlink-Remotes gefunden. Ist die Broadlink-Integration eingerichtet und ein Remote angelernt?</div>`;
      return;
    }

    body.innerHTML = this._inventory
      .map((remote) => this._renderRemote(remote))
      .join("");

    body.querySelectorAll("[data-action]").forEach((el) => {
      el.addEventListener("click", () => {
        const { action, entity, device, command } = el.dataset;
        if (action === "send") this._send(entity, device, command);
        else if (action === "delete") this._delete(entity, device, command);
        else if (action === "delete-device") this._deleteDevice(entity, device);
        else if (action === "copy") this._copyYaml(entity, device, command);
        else if (action === "learn") this._openLearn(entity, device);
        else if (action === "export") this._export(entity, device || null);
      });
    });

    this._applyFilter();
  }

  _renderRemote(remote) {
    const header = `
      <div class="remote-head">
        <div class="remote-name">
          <ha-icon icon="mdi:access-point"></ha-icon>
          <span>${escapeHtml(remote.name)}</span>
          <code>${escapeHtml(remote.entity_id)}</code>
          ${
            remote.available
              ? ""
              : `<span class="pill warn">offline</span>`
          }
        </div>
        <div class="remote-actions">
          <button class="btn small" data-action="learn" data-entity="${escapeAttr(
            remote.entity_id
          )}" data-device="">+ Befehl anlernen</button>
          <button class="btn small" data-action="export" data-entity="${escapeAttr(
            remote.entity_id
          )}" data-device="">Export</button>
        </div>
      </div>`;

    if (remote.error === "storage_not_found") {
      return `<section class="remote">${header}
        <div class="notice error">Code-Speicher für dieses Remote nicht auflösbar (MAC unbekannt).</div>
      </section>`;
    }

    if (!remote.devices.length) {
      return `<section class="remote">${header}
        <div class="notice">Noch keine Befehle angelernt.</div>
      </section>`;
    }

    const devices = remote.devices
      .map((dev) => this._renderDevice(remote, dev))
      .join("");
    return `<section class="remote">${header}${devices}</section>`;
  }

  _renderDevice(remote, dev) {
    const rows = dev.commands
      .map((cmd) => {
        const search = `${dev.device} ${cmd.command}`.toLowerCase();
        return `
        <div class="cmd-row" data-search="${escapeAttr(search)}">
          <span class="cmd-name">${escapeHtml(cmd.command)}</span>
          <span class="cmd-actions">
            <button class="btn small primary" data-action="send" data-entity="${escapeAttr(
              remote.entity_id
            )}" data-device="${escapeAttr(dev.device)}" data-command="${escapeAttr(
          cmd.command
        )}">Senden</button>
            <button class="btn small" data-action="copy" data-entity="${escapeAttr(
              remote.entity_id
            )}" data-device="${escapeAttr(dev.device)}" data-command="${escapeAttr(
          cmd.command
        )}">YAML</button>
            <button class="btn small danger" data-action="delete" data-entity="${escapeAttr(
              remote.entity_id
            )}" data-device="${escapeAttr(dev.device)}" data-command="${escapeAttr(
          cmd.command
        )}">Löschen</button>
          </span>
        </div>`;
      })
      .join("");

    return `
      <div class="device-block">
        <div class="device-head">
          <div class="device-name">
            <ha-icon icon="mdi:folder-outline"></ha-icon>
            <span>${escapeHtml(dev.device)}</span>
            <span class="pill">${dev.commands.length}</span>
          </div>
          <div class="device-actions">
            <button class="btn small" data-action="learn" data-entity="${escapeAttr(
              remote.entity_id
            )}" data-device="${escapeAttr(dev.device)}">+ Anlernen</button>
            <button class="btn small danger" data-action="delete-device" data-entity="${escapeAttr(
              remote.entity_id
            )}" data-device="${escapeAttr(dev.device)}">Gerät löschen</button>
          </div>
        </div>
        ${rows}
      </div>`;
  }
}

/* ----------------------------- helpers ----------------------------- */

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).split('"').join("&quot;");
}

const STYLES = `
  :host { display: block; height: 100%; background: var(--primary-background-color); color: var(--primary-text-color); }
  .page { max-width: 1100px; margin: 0 auto; padding: 16px; box-sizing: border-box; }
  .toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    padding: 12px 0; background: var(--primary-background-color); }
  .title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; margin-right: auto; }
  .search { flex: 1 1 200px; min-width: 160px; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--divider-color); background: var(--card-background-color); color: inherit; }
  .raw-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--secondary-text-color); }
  .btn { cursor: pointer; border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); border-radius: 8px; padding: 8px 12px; font-size: 14px; }
  .btn:hover { background: var(--secondary-background-color); }
  .btn.small { padding: 4px 10px; font-size: 13px; }
  .btn.primary { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  .btn.danger { color: var(--error-color); border-color: var(--error-color); }
  .btn.danger:hover { background: var(--error-color); color: var(--text-primary-color, #fff); }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .remote { background: var(--card-background-color); border: 1px solid var(--divider-color);
    border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; }
  .remote-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding-bottom: 8px; border-bottom: 1px solid var(--divider-color); }
  .remote-name { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; }
  .remote-name code { font-size: 12px; font-weight: 400; color: var(--secondary-text-color); }
  .remote-actions, .device-actions { display: flex; gap: 8px; }
  .device-block { margin-top: 12px; }
  .device-head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 6px 0; }
  .device-name { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .pill { font-size: 12px; background: var(--secondary-background-color); border-radius: 10px; padding: 1px 8px;
    color: var(--secondary-text-color); }
  .pill.warn { background: var(--warning-color); color: #000; }
  .cmd-row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 6px 8px; border-radius: 8px; }
  .cmd-row:nth-child(even) { background: var(--secondary-background-color); }
  .cmd-name { font-family: var(--code-font-family, monospace); }
  .cmd-actions { display: flex; gap: 6px; }
  .notice { padding: 16px; color: var(--secondary-text-color); }
  .notice.error { color: var(--error-color); }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex;
    align-items: center; justify-content: center; z-index: 10; }
  .modal { background: var(--card-background-color); border-radius: 12px; padding: 20px; width: 380px;
    max-width: 92vw; box-shadow: 0 8px 30px rgba(0,0,0,0.4); }
  .modal h2 { margin: 0 0 12px; font-size: 18px; }
  .modal label { display: block; font-size: 13px; color: var(--secondary-text-color); margin: 10px 0 4px; }
  .modal input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
    border: 1px solid var(--divider-color); background: var(--primary-background-color); color: inherit; }
  .modal input[readonly] { opacity: 0.7; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .device-hint { margin-top: 6px; font-size: 12px; min-height: 15px; color: var(--secondary-text-color); }
  .device-hint.info { color: var(--primary-color); }
  .learn-status { margin-top: 12px; font-size: 13px; min-height: 18px; }
  .learn-status.active { color: var(--primary-color); }
  .learn-status.error { color: var(--error-color); }
`;

customElements.define("broadlink-code-manager-panel", BroadlinkCodeManagerPanel);

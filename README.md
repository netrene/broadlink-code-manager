# Broadlink Code Manager

[![release](https://img.shields.io/github/v/release/netrene/broadlink-code-manager?style=for-the-badge)](https://github.com/netrene/broadlink-code-manager/releases)
[![hacs](https://img.shields.io/badge/HACS-Custom-orange.svg?style=for-the-badge)](https://www.hacs.xyz/)

A Home Assistant custom integration that adds a **Broadlink Codes** panel to the
sidebar for managing the IR/RF commands you have learned through the built-in
[Broadlink](https://www.home-assistant.io/integrations/broadlink/) integration.

Learned commands are normally hidden inside `.storage/broadlink_remote_<mac>_codes`
and there is no dropdown in Developer Tools for the `device` / `command` names, so
they are easy to lose track of. This integration gives you a clean inventory plus
test / learn / delete / export actions — all through the **official `remote.*`
services**. It **only reads** `.storage`; it never writes to it directly.

> [!NOTE]
> This is an independent management UI. It does not replace the Broadlink
> integration — it complements it.

## Features

- **Inventory** of every Broadlink remote, grouped **remote → device → command**.
- **Send / test** a command (`remote.send_command`).
- **Delete** a single command, or **delete a whole device** (removes all of its
  commands at once), each with confirmation (`remote.delete_command`).
- **Copy YAML** — ready-to-paste `remote.send_command` snippet.
- **Learn** a new command (`remote.learn_command`) with on-screen instructions,
  auto-refreshing once the code is captured. The device field suggests existing
  device names and tells you whether you are adding to an existing device or
  creating a new one.
- **Export** a remote to JSON (optionally including the raw base64 codes, so the
  export is a real backup).
- **Search / filter** across all commands and a manual **Refresh**.

Multiple Broadlink remotes are supported.

## Requirements

- Home Assistant **2024.7.0** or newer.
- The core **Broadlink** integration set up with at least one remote, and at
  least one learned command.

## Installation

### HACS (custom repository)

1. HACS → **⋮** → **Custom repositories**.
2. Add `https://github.com/netrene/broadlink-code-manager` with category
   **Integration**.
3. Install **Broadlink Code Manager**, then restart Home Assistant.
4. **Settings → Devices & Services → Add Integration → Broadlink Code Manager**
   (no configuration needed).
5. Open **Broadlink Codes** in the sidebar (admin only).

### Manual

Copy `custom_components/broadlink_code_manager/` into your HA `config/custom_components/`
directory, restart, then add the integration as in step 4 above.

## How it works

- Broadlink `remote.*` entities are discovered from the entity registry.
- Each remote is mapped to its code-storage file via the device MAC (falling back
  to the Broadlink config entry unique id), i.e. `broadlink_remote_<mac>_codes`.
- Codes are loaded read-only via Home Assistant's storage helper for display and
  export. All changes go through `remote.send_command` / `remote.learn_command` /
  `remote.delete_command`.

## Roadmap

- Bulk delete of selected commands.
- Optional `button.*` entities per learned command.
- Command rename (learn-copy-delete assisted).

## Disclaimer

Experimental, community project. Not affiliated with Broadlink or Home Assistant.

## License

[MIT](LICENSE)

"""WebSocket API for the Broadlink Code Manager frontend panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .codes import async_get_inventory
from .const import WS_EXPORT, WS_LIST


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the WebSocket commands (idempotent per HA start)."""
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_export)


def _inventory_to_json(inventory, include_raw: bool) -> list[dict[str, Any]]:
    """Serialize the inventory; only include raw base64 codes when requested."""
    result: list[dict[str, Any]] = []
    for remote in inventory:
        devices = []
        for device, commands in sorted(remote.devices.items()):
            cmd_list = []
            for command, code in sorted(commands.items()):
                entry: dict[str, Any] = {"command": command}
                if include_raw:
                    entry["code"] = code
                cmd_list.append(entry)
            devices.append({"device": device, "commands": cmd_list})
        result.append(
            {
                "entity_id": remote.entity_id,
                "name": remote.name,
                "mac": remote.mac,
                "available": remote.available,
                "error": remote.error,
                "devices": devices,
            }
        )
    return result


@websocket_api.websocket_command({vol.Required("type"): WS_LIST})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return the full inventory of remotes, devices and command names."""
    inventory = await async_get_inventory(hass)
    connection.send_result(
        msg["id"], {"remotes": _inventory_to_json(inventory, include_raw=False)}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_EXPORT,
        vol.Optional("entity_id"): str,
        vol.Optional("device"): str,
        vol.Optional("include_raw", default=True): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_export(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return an export payload, optionally filtered by remote/device.

    Includes raw base64 codes by default so the export is a real backup.
    """
    inventory = await async_get_inventory(hass)

    entity_id = msg.get("entity_id")
    if entity_id:
        inventory = [r for r in inventory if r.entity_id == entity_id]

    device_filter = msg.get("device")
    if device_filter:
        for remote in inventory:
            remote.devices = {
                dev: cmds
                for dev, cmds in remote.devices.items()
                if dev == device_filter
            }

    connection.send_result(
        msg["id"],
        {"remotes": _inventory_to_json(inventory, include_raw=msg["include_raw"])},
    )

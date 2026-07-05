"""Discovery and read-only loading of Broadlink learned codes.

This module never writes to `.storage`. It only maps Broadlink `remote.*`
entities to their code-storage file and loads the learned commands for display
and export. All mutating actions (send / learn / delete) are performed by the
frontend through the official `remote.*` services.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.storage import Store

from .const import (
    BROADLINK_PLATFORM,
    CODES_STORAGE_KEY,
    CODES_STORAGE_VERSION,
)


@dataclass
class RemoteCodes:
    """Learned codes for a single Broadlink remote."""

    entity_id: str
    name: str
    mac: str | None
    available: bool
    # {device_name: {command_name: base64_code}}
    devices: dict[str, dict[str, str]] = field(default_factory=dict)
    error: str | None = None


def _normalize_mac(mac: str | None) -> str | None:
    """Return the hex-only, lowercase MAC used in the code storage filename."""
    if not mac:
        return None
    hex_chars = [c for c in mac.lower() if c in "0123456789abcdef"]
    if len(hex_chars) != 12:
        return None
    return "".join(hex_chars)


def _mac_for_entity(hass: HomeAssistant, entry: er.RegistryEntry) -> str | None:
    """Resolve the storage token for a Broadlink remote entity.

    Broadlink names its code store `broadlink_remote_<device.mac.hex()>_codes`
    and sets the remote entity's own `unique_id` to that exact same value
    (``device.unique_id`` == config-entry ``unique_id`` == ``mac.hex()``). So the
    entity's registry ``unique_id`` maps 1:1 to the storage file and is the most
    reliable source. Device-registry MAC and config-entry unique_id are only
    fallbacks for unusual setups.
    """
    # Primary: the entity's own unique_id is the storage token verbatim.
    if entry.unique_id:
        mac = _normalize_mac(entry.unique_id)
        if mac:
            return mac

    dev_reg = dr.async_get(hass)

    if entry.device_id:
        device = dev_reg.async_get(entry.device_id)
        if device:
            for conn_type, conn_value in device.connections:
                if conn_type == dr.CONNECTION_NETWORK_MAC:
                    mac = _normalize_mac(conn_value)
                    if mac:
                        return mac

    if entry.config_entry_id:
        config_entry = hass.config_entries.async_get_entry(entry.config_entry_id)
        if config_entry and config_entry.unique_id:
            mac = _normalize_mac(config_entry.unique_id)
            if mac:
                return mac

    return None


def _broadlink_remote_entries(hass: HomeAssistant) -> list[er.RegistryEntry]:
    """Return all registered Broadlink `remote.*` entities."""
    ent_reg = er.async_get(hass)
    return [
        entry
        for entry in ent_reg.entities.values()
        if entry.domain == "remote" and entry.platform == BROADLINK_PLATFORM
    ]


async def _load_remote_codes(hass: HomeAssistant, mac: str) -> dict[str, dict[str, str]]:
    """Read the learned codes for a MAC from `.storage` (fresh, no cache).

    A new ``Store`` instance is created per call so we always read from disk,
    picking up changes made by learn/delete since the last call.
    """
    store: Store[dict[str, dict[str, str]]] = Store(
        hass, CODES_STORAGE_VERSION, CODES_STORAGE_KEY.format(mac=mac)
    )
    data = await store.async_load()
    if not isinstance(data, dict):
        return {}
    # Defensive: keep only well-formed {device: {command: code}} entries.
    result: dict[str, dict[str, str]] = {}
    for device, commands in data.items():
        if isinstance(commands, dict):
            result[device] = {
                str(cmd): str(code) for cmd, code in commands.items()
            }
    return result


def _friendly_name(hass: HomeAssistant, entry: er.RegistryEntry) -> str:
    """Best-effort human name for a remote entity."""
    if entry.name:
        return entry.name
    if entry.original_name:
        return entry.original_name
    state = hass.states.get(entry.entity_id)
    if state and (name := state.attributes.get("friendly_name")):
        return str(name)
    return entry.entity_id


async def async_get_inventory(hass: HomeAssistant) -> list[RemoteCodes]:
    """Build the full inventory of remotes -> devices -> commands."""
    inventory: list[RemoteCodes] = []

    for entry in sorted(_broadlink_remote_entries(hass), key=lambda e: e.entity_id):
        state = hass.states.get(entry.entity_id)
        available = state is not None and state.state not in ("unavailable", "unknown")
        mac = _mac_for_entity(hass, entry)

        item = RemoteCodes(
            entity_id=entry.entity_id,
            name=_friendly_name(hass, entry),
            mac=mac,
            available=available,
        )

        if mac is None:
            item.error = "storage_not_found"
        else:
            item.devices = await _load_remote_codes(hass, mac)

        inventory.append(item)

    return inventory

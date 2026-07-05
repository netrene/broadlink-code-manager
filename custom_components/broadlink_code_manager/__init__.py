"""The Broadlink Code Manager integration.

Registers a read-only WebSocket API and an admin sidebar panel that lets you
inventory, test, learn, delete and export Broadlink IR/RF codes. All mutating
actions go through the official `remote.*` services; `.storage` is only read.
"""

from __future__ import annotations

import logging
import os

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import websocket_api
from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_MODULE_URL,
    PANEL_TITLE,
    PANEL_URL_PATH,
    PANEL_WEBCOMPONENT,
)

_LOGGER = logging.getLogger(__name__)

# Bump when panel.js changes so browsers reload it instead of using cache.
PANEL_VERSION = "0.1.0"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up the WebSocket API, static panel asset and sidebar panel."""
    # Register WebSocket commands once (survives entry reloads).
    if DOMAIN not in hass.data:
        websocket_api.async_register(hass)
        panel_js = os.path.join(
            os.path.dirname(__file__), "panel", "broadlink-code-manager-panel.js"
        )
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_MODULE_URL, panel_js, cache_headers=False)]
        )
        hass.data[DOMAIN] = True

    if PANEL_URL_PATH not in hass.data.get("frontend_panels", {}):
        await panel_custom.async_register_panel(
            hass,
            webcomponent_name=PANEL_WEBCOMPONENT,
            frontend_url_path=PANEL_URL_PATH,
            module_url=f"{PANEL_MODULE_URL}?v={PANEL_VERSION}",
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            require_admin=True,
            config={},
        )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar panel on unload."""
    if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return True

"""Constants for the Broadlink Code Manager integration."""

from __future__ import annotations

DOMAIN = "broadlink_code_manager"

# Sidebar / panel
PANEL_URL_PATH = "broadlink-code-manager"
PANEL_TITLE = "Broadlink Codes"
PANEL_ICON = "mdi:remote"
PANEL_WEBCOMPONENT = "broadlink-code-manager-panel"

# Static asset served to the frontend (cache-busted via query string on register).
PANEL_MODULE_URL = "/broadlink_code_manager/panel.js"

# The platform name of Broadlink `remote.*` entities in the entity registry.
BROADLINK_PLATFORM = "broadlink"

# Storage key template used by Home Assistant's Broadlink integration to persist
# learned codes: `.storage/broadlink_remote_<machex>_codes`.
CODES_STORAGE_KEY = "broadlink_remote_{mac}_codes"
CODES_STORAGE_VERSION = 1

# WebSocket command types.
WS_LIST = f"{DOMAIN}/list"
WS_EXPORT = f"{DOMAIN}/export"

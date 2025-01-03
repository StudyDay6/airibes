"""面板管理器."""
import logging
import os
import mimetypes
from typing import Final

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.components.frontend import (
    add_extra_js_url,
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig

from .const import (
    DOMAIN,
    PANEL_ICON,
    FRONTEND_SCRIPT_URL,
    APARTMENT_SCRIPT_URL,
    PANEL_CSS_URL,
    APARTMENT_CSS_URL,
    DEVICE_LIBRARY_SCRIPT_URL,
    DEVICE_LIBRARY_CSS_URL,
    DEVICE_IMPORT_SCRIPT_URL,
    DEVICE_IMPORT_CSS_URL,
)
_LOGGER = logging.getLogger(__name__)
STATIC_PATH: Final = os.path.join(os.path.dirname(__file__), "frontend")

class PanelManager:
    """管理自定义面板."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry):
        """初始化面板管理器."""
        self.hass = hass
        self.entry = entry

    async def async_setup(self) -> None:
        """设置面板."""
        await self._register_static_resources()
        await self._register_panels()

    async def async_unload(self) -> None:
        """卸载面板."""
        self._remove_panels()

    async def _register_static_resources(self) -> None:
        """注册静态资源."""
        # 确保.js文件的MIME类型正确
        mimetypes.add_type("application/javascript", ".js")
        
        # 创建images目录
        images_path = os.path.join(STATIC_PATH, "images")
        if not os.path.exists(images_path):
            os.makedirs(images_path)

        # 准备所有静态路径配置
        static_paths = [
            StaticPathConfig("/frontend_static", STATIC_PATH, True),
            StaticPathConfig("/frontend_static/images", images_path, True),
            StaticPathConfig(FRONTEND_SCRIPT_URL, os.path.join(STATIC_PATH, "my-panel.js"), True),
            StaticPathConfig(APARTMENT_SCRIPT_URL, os.path.join(STATIC_PATH, "apartment.js"), True),
            StaticPathConfig("/frontend_static/apartment-card.js", os.path.join(STATIC_PATH, "apartment-card.js"), True),
            StaticPathConfig("/frontend_static/preview-dialog.js", os.path.join(STATIC_PATH, "preview-dialog.js"), True),
            StaticPathConfig(PANEL_CSS_URL, os.path.join(STATIC_PATH, "my-panel.css"), True),
            StaticPathConfig(APARTMENT_CSS_URL, os.path.join(STATIC_PATH, "apartment.css"), True),
            StaticPathConfig(DEVICE_LIBRARY_CSS_URL, os.path.join(STATIC_PATH, "device-library.css"), True),
            StaticPathConfig(DEVICE_IMPORT_CSS_URL, os.path.join(STATIC_PATH, "device-import.css"), True),
            StaticPathConfig("/frontend_static/translations.js", os.path.join(STATIC_PATH, "translations.js"), True),
            StaticPathConfig("/frontend_static/constants.js", os.path.join(STATIC_PATH, "constants.js"), True),
            StaticPathConfig("/frontend_static/learning-dialog.js", os.path.join(STATIC_PATH, "learning-dialog.js"), True),
        ]

        # 使用新的异步方法一次性注册所有静态路径
        await self.hass.http.async_register_static_paths(static_paths)
        
        # 添加JavaScript文件到前端
        add_extra_js_url(self.hass, FRONTEND_SCRIPT_URL)
        add_extra_js_url(self.hass, APARTMENT_SCRIPT_URL)
        add_extra_js_url(self.hass, "/frontend_static/apartment-card.js")
        add_extra_js_url(self.hass, "/frontend_static/preview-dialog.js")
        add_extra_js_url(self.hass, "/frontend_static/learning-dialog.js")

    async def _register_panels(self) -> None:
        """注册面板."""
        panel_title = self.entry.data["panel_title"]
        
        # 先移除旧的面板
        frontend_panels = self.hass.data.get("frontend_panels", {})
        
        if DOMAIN in frontend_panels:
            async_remove_panel(self.hass, DOMAIN)
            
        apartment_panel = f"{DOMAIN}_apartment"
        if apartment_panel in frontend_panels:
            async_remove_panel(self.hass, apartment_panel)
            
        device_library_panel = f"{DOMAIN}_device_library"
        if device_library_panel in frontend_panels:
            async_remove_panel(self.hass, device_library_panel)
            
        device_import_panel = f"{DOMAIN}_device_import"
        if device_import_panel in frontend_panels:
            async_remove_panel(self.hass, device_import_panel)
        
        # 注册主面板
        async_register_built_in_panel(
            self.hass,
            component_name="custom",
            sidebar_title=panel_title,
            sidebar_icon=PANEL_ICON,
            frontend_url_path=DOMAIN,
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "cus-panel",
                    "embed_iframe": False,
                    "trust_external": False,
                    "js_url": FRONTEND_SCRIPT_URL,
                    "module_url": FRONTEND_SCRIPT_URL,
                }
            },
        )

        # 注册户型页面
        async_register_built_in_panel(
            self.hass,
            component_name="custom",
            sidebar_title="",
            frontend_url_path=f"{DOMAIN}_apartment",
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "apartment-view",
                    "embed_iframe": False,
                    "trust_external": False,
                    "js_url": APARTMENT_SCRIPT_URL,
                    "module_url": APARTMENT_SCRIPT_URL,
                }
            },
        )

        # 注册设备库面板
        async_register_built_in_panel(
            self.hass,
            component_name="custom",
            sidebar_title="",
            frontend_url_path=f"{DOMAIN}_device_library",
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "device-library",
                    "embed_iframe": False,
                    "trust_external": False,
                    "js_url": DEVICE_LIBRARY_SCRIPT_URL,
                    "module_url": DEVICE_LIBRARY_SCRIPT_URL,
                }
            },
        )

        # 注册设备导入面板
        async_register_built_in_panel(
            self.hass,
            component_name="custom",
            sidebar_title="",
            frontend_url_path=f"{DOMAIN}_device_import",
            require_admin=False,
            config={
                "_panel_custom": {
                    "name": "device-import",
                    "embed_iframe": False,
                    "trust_external": False,
                    "js_url": DEVICE_IMPORT_SCRIPT_URL,
                    "module_url": DEVICE_IMPORT_SCRIPT_URL,
                }
            },
        )

        # 注册户型卡片资源
        try:
            # 直接添加卡片资源
            add_extra_js_url(
                self.hass,
                "/frontend_static/apartment-card.js",
                es5=False
            )
                
        except Exception as e:
            _LOGGER.error("注册户型卡片资源失败: %s", str(e))

    def _remove_panels(self) -> None:
        """移除面板."""
        self.hass.components.frontend.async_remove_panel(DOMAIN)
        self.hass.components.frontend.async_remove_panel(f"{DOMAIN}_apartment")

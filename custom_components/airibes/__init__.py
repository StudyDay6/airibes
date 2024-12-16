"""Custom integration."""
import logging
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry

from .const import DOMAIN
from .panel_manager import PanelManager
from .storage_manager import StorageManager
from .mqtt_client import MqttClient
from .utils import TranslationManager

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up from a config entry."""
    # 初始化翻译管理器
    await TranslationManager.init(hass)
    
    domain_data = {
        "mqtt_client": None,
        "storage_manager": None,
        "panel_manager": None,
        "sensors": {},  # 存储雷达传感器实体
        "selects": {},  # 存储选择器实体
        "switches": {}, # 存储开关实体
        "room_sensors": {},  # 存储房间传感器实体
        "area_sensors": {},  # 添加区域传感器存储
    }
    
    hass.data[DOMAIN] = domain_data

    # 初始化存储管理器
    storage_manager = StorageManager(hass)
    domain_data["storage_manager"] = storage_manager
    storage_manager.register_websocket_commands()

    # 初始化面板管理器
    panel_manager = PanelManager(hass, entry)
    domain_data["panel_manager"] = panel_manager
    await panel_manager.async_setup()

    # 初始化 MQTT 客户端
    mqtt_client = MqttClient(hass)
    domain_data["mqtt_client"] = mqtt_client
    await mqtt_client.async_setup()

    # 设置平台
    await hass.config_entries.async_forward_entry_setups(
        entry, ["sensor", "select", "switch", "binary_sensor", "button"]
    )
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """卸载配置条目."""
    # 卸载平台
    unload_ok = await hass.config_entries.async_unload_platforms(
        entry, ["sensor", "select", "switch"]
    )
    
    if unload_ok and DOMAIN in hass.data:
        panel_manager = hass.data[DOMAIN].get("panel_manager")
        storage_manager = hass.data[DOMAIN].get("storage_manager")
        
        if panel_manager:
            await panel_manager.async_unload()
        
        # 清理存储的数据（如果用户确认）
        if storage_manager and entry.data.get("clear_data_on_unload", False):
            _LOGGER.info("清理存储数据")
            await storage_manager.async_clear_storage()  # 确保这是异步方法
            
        del hass.data[DOMAIN]
    
    return unload_ok

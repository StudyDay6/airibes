"""Platform for select integration."""

from homeassistant.components.select import SelectEntity
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.storage import Store
from homeassistant.helpers.entity_registry import async_get
from .utils import get_translation_key
import logging

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.radar_sensors"


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the select platform."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored_devices = await store.async_load() or {}

    # 初始化 selects 字典
    hass.data[DOMAIN].setdefault("selects", {})

    # 从存储中恢复选择实体
    selects = []
    for device_id, device_data in stored_devices.items():
        name = device_data.get("name", get_translation_key("entity.sensor.airibes.name"))
        select_entity_id = f"{DOMAIN}_radar_{device_id}_level"

        select = RadarLevelSelect(
            hass, name=name, entity_id=select_entity_id, device_id=device_id
        )
        selects.append(select)
        # # 保存实体引用
        # hass.data[DOMAIN]["selects"][device_id] = select

    if selects:
        async_add_entities(selects)

    # 保存创建选择实体的方法到 hass
    async def async_add_radar_select(device_id: str):
        """创建新的雷达灵敏度选择实体."""
        # 构造实体ID
        select_entity_id = f"{DOMAIN}_radar_{device_id}_level"

        # 获取实体注册表
        entity_registry = async_get(hass)

        # 检查实体是否已存在
        if entity_registry.async_get(f"select.{select_entity_id}"):
            _LOGGER.info(f"雷达灵敏度选择实体已存在: {select_entity_id}")
            return None

        # 创建新实体
        name = "Radar"
        select = RadarLevelSelect(
            hass, name=name, entity_id=select_entity_id, device_id=device_id
        )
        async_add_entities([select])
        _LOGGER.info(f"已创建新的雷达灵敏度选择实体: {select_entity_id}")
        return select

    # 将方法保存到 hass 数据中
    hass.data[DOMAIN]["async_add_radar_select"] = async_add_radar_select


class RadarLevelSelect(SelectEntity):
    """雷达灵敏度选择实体."""

    def __init__(self, hass, name: str, entity_id: str, device_id: str) -> None:
        """初始化选择实体.

        Args:
            name: 显示名称
            entity_id: 实体ID
            device_id: 设备ID
        """
        self._attr_name = f"{name} Sensitivity"
        self.entity_id = f"select.{entity_id}"
        self._attr_unique_id = f"radar_level_{device_id}"
        self._device_id = device_id

        # 设置可选项
        self._attr_options = [get_translation_key("entity.select.airibes.high"), get_translation_key("entity.select.airibes.medium"), get_translation_key("entity.select.airibes.low")]
        self._attr_current_option = get_translation_key("entity.select.airibes.medium")
        self.hass = hass

        # 设备信息
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=get_translation_key("entity.sensor.airibes.name"),
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    async def async_added_to_hass(self):
        """当实体被添加到 Home Assistant 时调用."""
        # 确保 selects 字典存在
        if "selects" not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]["selects"] = {}

        # 保存实体引用
        self.hass.data[DOMAIN]["selects"][self._device_id] = self

    async def async_will_remove_from_hass(self):
        """当实体从 Home Assistant 中移除时调用."""
        # 移除实体引用
        if (
            DOMAIN in self.hass.data
            and "selects" in self.hass.data[DOMAIN]
            and self._device_id in self.hass.data[DOMAIN]["selects"]
        ):
            del self.hass.data[DOMAIN]["selects"][self._device_id]

    async def async_select_option(self, option: str) -> None:
        """更新选择的选项."""
        if option not in self._attr_options:
            return

        self._attr_current_option = option

        # 转换选项为数值
        level_map = {get_translation_key("entity.select.airibes.low"): 0, get_translation_key("entity.select.airibes.medium"): 1, get_translation_key("entity.select.airibes.high"): 2}
        level_value = level_map.get(option, 1)

        try:
            # 发送灵敏度设置命令
            mqtt_client = self.hass.data[DOMAIN].get("mqtt_client")
            if mqtt_client:
                sub_data = {"params": [{"8": level_value}]}
                await mqtt_client._sender_profile_data(self._device_id, sub_data)

        except Exception as e:
            _LOGGER.error("设置雷达灵敏度失败: %s", str(e))

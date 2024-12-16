"""Platform for button integration."""
from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.storage import Store
from homeassistant.helpers.entity_registry import async_get
from .utils import get_translation_key
import logging
import asyncio

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.radar_sensors"

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the button platform."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored_devices = await store.async_load() or {}

    # 初始化 buttons 字典
    hass.data[DOMAIN].setdefault("buttons", {})

    # 从存储中恢复按钮实体
    buttons = []
    for device_id, device_data in stored_devices.items():
        name = device_data.get("name", get_translation_key("entity.sensor.airibes.name"))
        button_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        
        button = RadarLearnButton(
            hass,
            name=name,
            entity_id=button_entity_id,
            device_id=device_id
        )
        buttons.append(button)
        # 保存实体引用
        hass.data[DOMAIN]["buttons"][device_id] = button
    
    if buttons:
        async_add_entities(buttons)

    # 保存创建按钮实体的方法到 hass
    async def async_add_radar_button(device_id: str):
        """创建新的雷达自学习按钮实体."""
        entity_registry = async_get(hass)
        button_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        button_exists = entity_registry.async_get(f"button.{button_entity_id}")

        if not button_exists:
            name = get_translation_key("entity.sensor.airibes.name")
            button = RadarLearnButton(
                hass,
                name=name,
                entity_id=button_entity_id,
                device_id=device_id
            )
            
            async_add_entities([button])
            return button
        return None

    # 将方法保存到 hass 数据中
    hass.data[DOMAIN]["async_add_radar_button"] = async_add_radar_button

class RadarLearnButton(ButtonEntity):
    """雷达自学习按钮实体."""

    def __init__(self, hass: HomeAssistant, name: str, entity_id: str, device_id: str) -> None:
        """初始化按钮实体."""
        self._base_name = name
        self._attr_name = f"{name}{get_translation_key('entity.button.airibes.learn')}"
        self.entity_id = f"button.{entity_id}"
        self._attr_unique_id = f"radar_learn_{device_id}"
        self._device_id = device_id
        self.hass = hass
        self._is_learning = False
        self._countdown = 0
        self._attr_state = None
        self._attr_extra_state_attributes = {}

        # 设备信息
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=name,
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    @property
    def state(self) -> str:
        """返回实体状态."""
        if self._is_learning:
            return f"学习中... {self._countdown}s"
        return None
    
    @property
    def name(self) -> str:
        """返回实体名称."""
        if self._is_learning:
            return f"{self._base_name}自学习 学习中... {self._countdown}s"
        return f"{self._base_name}自学习"
    
    @property
    def should_poll(self) -> bool:
        """表示实体需要轮询."""
        return True

    async def async_press(self) -> None:
        """按钮按下时触发."""
        if self._is_learning:
            return  # 如果正在学习中，不响应新的按压

        try:
            self._is_learning = True
            self._countdown = 45  # 45秒倒计时
            self._attr_state = f"学习中... {self._countdown}s"
            
            # 立即更新状态和名称
            self.async_schedule_update_ha_state(True)
            
            # 发送自学习命令
            mqtt_client = self.hass.data[DOMAIN].get("mqtt_client")
            if mqtt_client:
                sub_data = {"msgId": 99, "siid": 5, "aiid": 2, "in": [{"6": 1}]}
                await mqtt_client._sender_method_data(self._device_id, sub_data)
                _LOGGER.info("雷达设备 %s 自学习命令已发送", self._device_id)

            # 倒计时循环
            while self._countdown > 0:
                if not self._is_learning:
                    break
                await asyncio.sleep(1)
                self._countdown -= 1
                # 更新状态和名称
                self.async_schedule_update_ha_state(True)

        except Exception as e:
            _LOGGER.error("发送自学习命令失败: %s", str(e))
            self._attr_extra_state_attributes["error"] = str(e)
            self.async_schedule_update_ha_state(True)

        finally:
            # 重置状态
            self._is_learning = False
            self._countdown = 0
            self._attr_state = None
            if "error" in self._attr_extra_state_attributes:
                del self._attr_extra_state_attributes["error"]
            self.async_schedule_update_ha_state(True)
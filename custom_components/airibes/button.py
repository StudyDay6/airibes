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
    # 从存储中恢复按钮实体
    buttons = []
    for device_id, device_data in stored_devices.items():
        name = get_translation_key("entity.button.airibes.state.has_people_learn")
        button_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        button = RadarLearnButton(
            hass,
            name=name,
            entity_id=button_entity_id,
            device_id=device_id,
            has_people=True
        )
        buttons.append(button)

        name1 = get_translation_key("entity.button.airibes.state.no_people_learn")
        button_entity_id1 = f"{DOMAIN}_radar_{device_id}_learn1"
        button1 = RadarLearnButton(
            hass,
            name=name1,
            entity_id=button_entity_id1,
            device_id=device_id,
            has_people=False
        )

        buttons.append(button1)
    if buttons:
        async_add_entities(buttons)

    # 保存创建按钮实体的方法到 hass
    async def async_add_radar_button(device_id: str):
        """创建新的雷达自学习按钮实体."""
        entity_registry = async_get(hass)
        button_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        button_exists = entity_registry.async_get(f"button.{button_entity_id}")
        button_entity_id1 = f"{DOMAIN}_radar_{device_id}_learn1"
        if not button_exists:
            name = get_translation_key("entity.button.airibes.state.has_people_learn")
            button = RadarLearnButton(
                hass,
                name=name,
                entity_id=button_entity_id,
                device_id=device_id,
                has_people=True
            )
            name1 = get_translation_key("entity.button.airibes.state.no_people_learn")
            button1 = RadarLearnButton(
                hass,
                name=name1,
                entity_id=button_entity_id1,
                device_id=device_id,
                has_people=False
            )
            async_add_entities([button, button1])
            return button
        return None

    # 将方法保存到 hass 数据中
    hass.data[DOMAIN]["async_add_radar_button"] = async_add_radar_button

class RadarLearnButton(ButtonEntity):
    """雷达自学习按钮实体."""

    def __init__(self, hass: HomeAssistant, name: str, entity_id: str, device_id: str, has_people: bool) -> None:
        """Initialize the button entity."""
        self._base_name = name
        self._attr_name = f"{name}"
        self.entity_id = f"button.{entity_id}"
        self._attr_unique_id = f"radar_learn_{device_id}" if has_people else f"radar_learn1_{device_id}"
        self._device_id = device_id
        self._has_people = has_people
        self.hass = hass
        self._is_learning = False
        self._countdown = 0
        self._attr_state = None
        self._attr_extra_state_attributes = {}

        # 设备信息
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=get_translation_key("entity.sensor.airibes.name"),
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    @property
    def name(self) -> str:
        """Returns the entity name."""
        return f"{self._base_name}"

    async def async_added_to_hass(self):
        """Called when the entity is added to Home Assistant."""
        if "buttons" not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]["buttons"] = {}
        key = f"{self._device_id}_learn_people" if self._has_people else f"{self._device_id}_learn_no_people"
        self.hass.data[DOMAIN]["buttons"][key] = self

    async def async_will_remove_from_hass(self):
        """Called when the entity is removed from Home Assistant."""

        # Remove entity reference
        key = f"{self._device_id}_learn_people" if self._has_people else f"{self._device_id}_learn_no_people"
        if (
            DOMAIN in self.hass.data
            and "buttons" in self.hass.data[DOMAIN]
            and key in self.hass.data[DOMAIN]["buttons"]
        ):
            del self.hass.data[DOMAIN]["buttons"][key]

    async def async_press(self) -> None:
        """按钮按下时触发."""
        device_state = self.hass.states.get(f"sensor.{DOMAIN}_radar_{self._device_id}")
        if device_state and device_state.state == get_translation_key("entity.sensor.airibes.state.online"):
            self.hass.bus.async_fire('airibes_btn_learn', {"has_people": self._has_people, "device_id": self._device_id})
        else:
            self.hass.components.persistent_notification.create(
                get_translation_key("entity.button.airibes.state.device_offline"),
                title=get_translation_key("entity.button.airibes.state.device_offline_title"),
                notification_id="radar_device_offline"
            )
"""Platform for switch integration."""
from homeassistant.components.switch import SwitchEntity
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
    """Set up the switch platform."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored_devices = await store.async_load() or {}

    # Initialize switches dictionary
    hass.data[DOMAIN].setdefault("switches", {})

    # Restore switch entities from storage
    switches = []
    for device_id, device_data in stored_devices.items():
        name = get_translation_key("entity.sensor.airibes.name")
        
        # AP switch
        switch_entity_id = f"{DOMAIN}_radar_{device_id}_ap"
        switch = RadarAPSwitch(
            hass,
            name=name,
            entity_id=switch_entity_id,
            device_id=device_id
        )
        switches.append(switch)

        # Self-learning switch
        learn_switch_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        learn_switch = RadarLearnSwitch(
            hass,
            name=name,
            entity_id=learn_switch_entity_id,
            device_id=device_id
        )
        switches.append(learn_switch)
    if switches:
        async_add_entities(switches)

    async def async_add_radar_switch(device_id: str):
        """Create new radar switch entities."""
        entity_registry = async_get(hass)
        switch_entity_id = f"{DOMAIN}_radar_{device_id}_ap"
        learn_switch_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
        ap_exists = entity_registry.async_get(f"switch.{switch_entity_id}")
        # learn_exists = entity_registry.async_get(f"switch.{learn_switch_entity_id}")

        if ap_exists:
            _LOGGER.info(f"AP={switch_entity_id}, Learn={learn_switch_entity_id}")
            return None

        name = "Radar"

        # Create AP switch
        switch = RadarAPSwitch(
            hass,
            name=name,
            entity_id=switch_entity_id,
            device_id=device_id
        )

        # Create the self-learning switch
        learn_switch = RadarLearnSwitch(
            hass,
            name=name,
            entity_id=learn_switch_entity_id,
            device_id=device_id
        )

        # Add two switch entities
        async_add_entities([switch, learn_switch])
        _LOGGER.info(f"已创建新的雷达开关实体: AP={switch_entity_id}, Learn={learn_switch_entity_id}")
        return switch

    # Save the method to the hass data
    hass.data[DOMAIN]["async_add_radar_switch"] = async_add_radar_switch

async def sender_ap_cmd(hass, device_id, is_on):
    """Send command to device."""
    ap_data = {"params": [{"16": int(is_on)}]}
    mqtt_client = hass.data[DOMAIN].get("mqtt_client")
    if mqtt_client:
        await mqtt_client._sender_profile_data(device_id, ap_data)

async def sender_learn_cmd(hass, device_id, is_on):
    """Send command to device."""
    ap_data = {"params": [{"70": int(is_on)}]}
    mqtt_client = hass.data[DOMAIN].get("mqtt_client")
    if mqtt_client:
        await mqtt_client._sender_profile_data(device_id, ap_data)

class RadarAPSwitch(SwitchEntity):
    """Radar AP Switch Entity."""

    def __init__(self, hass, name: str, entity_id: str, device_id: str) -> None:
        """Initialize the switch entity.
        
        Args:
            name: display name
            entity_id: Entity ID
            device_id: Device ID
        """
        self._attr_name = f"{name} AP Switch"
        self.entity_id = f"switch.{entity_id}"
        self._attr_unique_id = f"radar_ap_{device_id}"
        self._device_id = device_id
        self._is_on = False
        self.hass = hass

        # Device Information
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=get_translation_key("entity.sensor.airibes.name"),
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    @property
    def is_on(self) -> bool:
        """Returns the switch state."""
        return self._is_on

    @property
    def icon(self) -> str:
        """Returns the icon."""
        return "mdi:access-point" if self.is_on else "mdi:access-point-off"

    async def async_added_to_hass(self):
        """Called when the entity is added to Home Assistant."""
        if "switches" not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]["switches"] = {}

        # Save entity reference
        self.hass.data[DOMAIN]["switches"][self._device_id] = self

    async def async_will_remove_from_hass(self):
        """Called when the entity is removed from Home Assistant."""
        # Remove entity reference
        if (
            DOMAIN in self.hass.data 
            and "switches" in self.hass.data[DOMAIN] 
            and self._device_id in self.hass.data[DOMAIN]["switches"]
        ):
            del self.hass.data[DOMAIN]["switches"][self._device_id]

    async def async_turn_on(self, **kwargs) -> None:
        """Turn on the switch."""
        self._is_on = True
        await sender_ap_cmd(self.hass, self._device_id, True)


    async def async_turn_off(self, **kwargs) -> None:
        """Turn off the switch."""
        self._is_on = False
        await sender_ap_cmd(self.hass, self._device_id, False)

class RadarLearnSwitch(SwitchEntity):
    """Radar Self-Learning Switch Entity."""

    def __init__(self, hass, name: str, entity_id: str, device_id: str) -> None:
        """Initialize the switch entity.

        Args:
            name: display name
            entity_id: Entity ID
            device_id: Device ID
        """
        self._attr_name = f"{name}{get_translation_key("entity.switch.airibes.learn")}"
        self.entity_id = f"switch.{entity_id}"
        self._attr_unique_id = f"radar_learn_{device_id}"
        self._device_id = device_id
        self._is_on = False
        self.hass = hass

        # Device Information
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=name,
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    @property
    def is_on(self) -> bool:
        """Returns the switch state."""
        return self._is_on

    @property
    def icon(self) -> str:
        """Returns the icon."""
        return "mdi:book-open"

    async def async_added_to_hass(self):
        """Called when the entity is added to Home Assistant."""

        if "switches" not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]["switches"] = {}

        # Save entity reference
        self.hass.data[DOMAIN]["switches"][f"{self._device_id}_learn"] = self

    async def async_will_remove_from_hass(self):
        """Called when the entity is removed from Home Assistant."""

        # Remove entity reference
        if (
            DOMAIN in self.hass.data 
            and "switches" in self.hass.data[DOMAIN] 
            and f"{self._device_id}_learn" in self.hass.data[DOMAIN]["switches"]
        ):
            del self.hass.data[DOMAIN]["switches"][f"{self._device_id}_learn"]

    async def async_turn_on(self, **kwargs) -> None:
        """Turn on the switch."""
        self._is_on = True
        # Send self-learning command
        await sender_learn_cmd(self.hass, self._device_id, True)
        _LOGGER.info("雷达设备 %s 自学习命令已发送", self._device_id)

    async def async_turn_off(self, **kwargs) -> None:
        """Turn off the switch."""
        self._is_on = False
        # Send stop self-learning command
        await sender_learn_cmd(self.hass, self._device_id, False)
        _LOGGER.info("雷达设备 %s 自学习已停止", self._device_id)




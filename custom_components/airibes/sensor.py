"""Platform for sensor integration."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.storage import Store
from .utils import get_translation_key
from .const import DOMAIN,RADAR_STORAGE_KEY


STORAGE_VERSION = 1

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sensor platform."""
    store = Store(hass, STORAGE_VERSION, RADAR_STORAGE_KEY)
    stored_devices = await store.async_load() or {}
    sensors = []
    for device_id, device_data in stored_devices.items():
        name = f"Radar-{device_id[-4:]}"
        sensor_entity_id = f"{DOMAIN}_radar_{device_id}"
        sensor = RadarSensor(
            name=name,
            entity_id=sensor_entity_id,
            device_id=device_id,
            is_on=False
        )
        sensors.append(sensor)

    if sensors:
        async_add_entities(sensors)

    # 保存创建雷达传感器的方法到 hass
    async def async_add_radar_sensor(device_id: str):
        """Create a new radar sensor."""
        stored_devices = await store.async_load() or {}
        if device_id not in stored_devices:
            name = f"Radar-{device_id[-4:]}"
            entity_id = f"{DOMAIN}_radar_{device_id}"

            sensor = RadarSensor(
                name=name,
                entity_id=entity_id,
                device_id=device_id,
                is_on=True
            )
            stored_devices[device_id] = {
                "name": name,
                "device_id": device_id
            }
            await store.async_save(stored_devices)
            async_add_entities([sensor])
            return sensor
        return None

    hass.data[DOMAIN]["async_add_radar_sensor"] = async_add_radar_sensor

class RadarSensor(SensorEntity):
    """Representation of a Radar Sensor."""

    def __init__(self, name: str, entity_id: str, device_id: str, is_on: bool = False) -> None:
        """Initialize the sensor."""
        self._attr_name = name
        self.entity_id = f"sensor.{entity_id}"
        self._attr_unique_id = f"radar_sensor_{device_id}"
        self._device_id = device_id
        self._is_on = is_on
        self._attr_native_value = get_translation_key("entity.sensor.airibes.state.offline")
        self.hass = None

        # 设备信息
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, str(self._device_id))},
            name=get_translation_key("entity.sensor.airibes.name"),
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
        )

    async def async_added_to_hass(self) -> None:
        """Called when the entity is added to Home Assistant."""
        self.hass = self.platform.hass
        self.hass.data[DOMAIN]["sensors"][str(self._device_id)] = self
        await super().async_added_to_hass()

    async def async_will_remove_from_hass(self) -> None:
        """Called when the entity is removed from Home Assistant."""
        if self._device_id in self.hass.data[DOMAIN]["sensors"]:
            del self.hass.data[DOMAIN]["sensors"][str(self._device_id)]
        await super().async_will_remove_from_hass()

    @property
    def icon(self) -> str:
        """Return the icon of the sensor."""
        return "mdi:radar"

    @property
    def state(self) -> str:
        """Return the state of the sensor."""
        return self._attr_native_value

    @property
    def device_id(self) -> str:
        """Return the device ID."""
        return self._device_id

    @property
    def is_on(self) -> bool:
        """Return whether the device is online."""
        return self._is_on

    @property
    def available(self) -> bool:
        """Return True if entity is available."""
        return True

    def set_online_status(self, is_on: bool) -> None:
        """Set the device online status."""
        self._is_on = is_on
        self._attr_native_value = get_translation_key("entity.sensor.airibes.state.online") if is_on else get_translation_key("entity.sensor.airibes.state.offline")

    async def async_update(self) -> None:
        """Fetch new state data for the sensor."""
        self._attr_native_value = get_translation_key("entity.sensor.airibes.state.online") if self._is_on else get_translation_key("entity.sensor.airibes.state.offline")

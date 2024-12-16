"""Platform for sensor integration."""
from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import ConfigType, DiscoveryInfoType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.storage import Store
import logging
from .const import DOMAIN,RADAR_STORAGE_KEY

_LOGGER = logging.getLogger(__name__)

STORAGE_VERSION = 1

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the sensor platform."""
    store = Store(hass, STORAGE_VERSION, RADAR_STORAGE_KEY)
    stored_devices = await store.async_load() or {}
    _LOGGER.info('stored_devices: %s', stored_devices)
    # 从存储中恢复雷达传感器
    sensors = []
    for device_id, device_data in stored_devices.items():
        _LOGGER.info("恢复雷达传感器: %s", device_id)
        name = f"Radar-{device_id[-4:]}"
        sensor_entity_id = f"{DOMAIN}_radar_{device_id}"
        _LOGGER.info("雷达传感器实体name: %s -- %s", name, device_data)
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
        """创建新的雷达传感器."""
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
            _LOGGER.info('sensor: %s', sensor)
            stored_devices[device_id] = {
                "name": name,
                "device_id": device_id
            }
            await store.async_save(stored_devices)
            async_add_entities([sensor])
            _LOGGER.info('stored_devices: %s', stored_devices)
            return sensor
        return None

    # 将方法保存到 hass 数据中
    hass.data[DOMAIN]["async_add_radar_sensor"] = async_add_radar_sensor

class RadarSensor(SensorEntity):
    """Representation of a Radar Sensor."""

    def __init__(self, name: str, entity_id: str, device_id: str, is_on: bool = False) -> None:
        """Initialize the sensor.

        Args:
            name: 传感器显示名称
            entity_id: 实体标识符
            device_id: 设备ID
            is_on: 设备是否在线
        """
        self._attr_name = name
        self.entity_id = f"sensor.{entity_id}"
        self._attr_unique_id = f"radar_sensor_{device_id}"
        self._device_id = device_id
        self._is_on = is_on
        self._attr_native_value = "离线"
        self.hass = None

        # 设备信息
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, device_id)},
            name=name,
            manufacturer="H&T",
            model="Radar Sensor",
            sw_version="1.0",
            via_device=(DOMAIN, device_id)
        )

    async def async_added_to_hass(self) -> None:
        """当实体被添加到 Home Assistant 时调用."""
        self.hass = self.platform.hass
        # 将实体添加到 hass.data
        self.hass.data[DOMAIN]["sensors"][self._device_id] = self
        await super().async_added_to_hass()

    async def async_will_remove_from_hass(self) -> None:
        """当实体从 Home Assistant 中移除时调用."""
        # 从 hass.data 中移除实体
        if self._device_id in self.hass.data[DOMAIN]["sensors"]:
            del self.hass.data[DOMAIN]["sensors"][self._device_id]
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
        self._attr_native_value = "在线" if is_on else "离线"

    async def async_update(self) -> None:
        """Fetch new state data for the sensor."""
        self._attr_native_value = "在线" if self._is_on else "离线"

"""Binary sensor platform for airibes."""
import logging
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.const import STATE_ON, STATE_OFF
from homeassistant.helpers.storage import Store

from .const import DOMAIN, STORAGE_VERSION, APARTMENTS_STORAGE_KEY, APARTMENT_DATA_KEY

_LOGGER = logging.getLogger(__name__)

async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up binary sensors from a config entry."""
    
    # 保存创建实体的方法到 hass.data
    async def async_add_room_sensor(discovery_info: dict) -> RoomBinarySensor:
        """创建房间传感器."""
        sensor = RoomBinarySensor(
            hass, 
            discovery_info["room_id"],
            discovery_info["name"],
            discovery_info["apartment_id"]
        )
        async_add_entities([sensor])
        return sensor

    async def async_add_area_sensor(discovery_info: dict) -> AreaBinarySensor:
        """创建区域传感器."""
        sensor = AreaBinarySensor(
            hass, 
            discovery_info["area_id"], 
            discovery_info["name"],
            discovery_info["apartment_id"]
        )
        async_add_entities([sensor])
        return sensor

    # 保存创建方法到 hass.data
    hass.data[DOMAIN]["async_add_room_sensor"] = async_add_room_sensor
    hass.data[DOMAIN]["async_add_area_sensor"] = async_add_area_sensor

    # 从存储加载户型数据并创建实体
    try:
        _LOGGER.info("开始从存储加载户型数据并创建实体")
        # 获取户型列表
        apartments_store = Store(hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
        apartments_data = await apartments_store.async_load()
        
        if apartments_data and 'apartments' in apartments_data:
            for apartment in apartments_data['apartments']:
                apartment_id = apartment['id']
                _LOGGER.info(f"处理户型 {apartment_id} 的数据")
                
                # 加载户型数据
                store = Store(hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}")
                data = await store.async_load()
                
                if data:
                    # 创建房间实体
                    for room in data.get('rooms', []):
                        discovery_info = {
                            "room_id": room['id'],
                            "name": room.get('name', f"Room {room['id']}"),
                            "apartment_id": apartment_id
                        }
                        _LOGGER.info(f"创建房间实体: {discovery_info}")
                        await async_add_room_sensor(discovery_info)

                    # 创建区域实体
                    for area in data.get('areas', []):
                        if area.get('type') == 'monitor-area' or area.get('type') == 'interference-area':
                            discovery_info = {
                                "area_id": area['id'],
                                "name": area.get('name', f"Area {area['id']}"),
                                "apartment_id": apartment_id
                            }
                            _LOGGER.info(f"创建区域实体: {discovery_info}")
                            await async_add_area_sensor(discovery_info)

                    # 创建门的区域实体
                    for sticker in data.get('stickers', []):
                        if sticker['type'] == 'door':
                            discovery_info = {
                                "area_id": sticker['id'],
                                "name": f"Gate {sticker['id']}",
                                "apartment_id": apartment_id
                            }
                            _LOGGER.info(f"创建门区域实体: {discovery_info}")
                            await async_add_area_sensor(discovery_info)

        _LOGGER.info("完成从存储加载并创建实体")

    except Exception as e:
        _LOGGER.error(f"从存储加载并创建实体失败: {str(e)}")
        _LOGGER.exception("详细错误信息")


class RoomBinarySensor(BinarySensorEntity):
    """Binary sensor for room occupancy."""

    def __init__(self, hass: HomeAssistant, room_id: str, name: str, apartment_id: int) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._room_id = str(room_id)
        self._name = name
        self._apartment_id = apartment_id
        self._state = False
        self._attr_unique_id = f"occupancy_apartment_{apartment_id}_room_{room_id}"
        self._attr_device_class = "occupancy"
        self._attr_available = True
        self.entity_id = f"binary_sensor.{DOMAIN}_occupancy_apartment_{apartment_id}_room_{room_id}"

    async def async_added_to_hass(self) -> None:
        """当实体被添加到 Home Assistant 时调用."""
        if DOMAIN not in self.hass.data:
            self.hass.data[DOMAIN] = {}
        if 'room_sensors' not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]['room_sensors'] = {}

        # 使用户型ID和房间ID的组合作为键
        sensor_key = f"apartment_{self._apartment_id}_room_{self._room_id}"
        self.hass.data[DOMAIN]['room_sensors'][sensor_key] = self

    async def async_will_remove_from_hass(self) -> None:
        """当实体从 Home Assistant 中移除时调用."""
        sensor_key = f"apartment_{self._apartment_id}_room_{self._room_id}"
        if (DOMAIN in self.hass.data and 
            'room_sensors' in self.hass.data[DOMAIN] and 
            sensor_key in self.hass.data[DOMAIN]['room_sensors']):
            del self.hass.data[DOMAIN]['room_sensors'][sensor_key]
        _LOGGER.info("删除房间实体: %s", sensor_key)

    def set_state(self, state: bool) -> None:
        """设置房间状态."""
        self._state = state
        # 如果实体已经添加到 HA，则触发状态更新
        if self.hass and self.entity_id:
            self.hass.states.async_set(
                self.entity_id,
                STATE_ON if state else STATE_OFF,
                {
                    "friendly_name": self._name,
                    "device_class": "occupancy",
                    "icon": "mdi:home-account",
                }
            )
            _LOGGER.info(f"房间状态已更新: {self.entity_id} -> {STATE_ON if state else STATE_OFF}")

    @property
    def state(self) -> str:
        """Return the state of the binary sensor."""
        return STATE_ON if self._state else STATE_OFF

    @property
    def is_on(self) -> bool:
        """Return true if the binary sensor is on."""
        return self._state

    @property
    def extra_state_attributes(self) -> dict:
        """Return the state attributes."""
        return {
            "room_id": self._room_id
        }

    @property
    def name(self) -> str:
        """Return the name of the sensor."""
        return self._name

    @property
    def device_class(self):
        return "presence"

    @property
    def available(self):
        return self._attr_available

class AreaBinarySensor(BinarySensorEntity):
    """Binary sensor for area monitoring."""

    def __init__(self, hass: HomeAssistant, area_id: str, name: str, apartment_id: int) -> None:
        """Initialize the sensor."""
        self.hass = hass
        self._area_id = str(area_id)
        self._name = name
        self._apartment_id = apartment_id
        self._state = False
        self._event_count = 0
        self._last_event_time = None
        self._attr_unique_id = f"occupancy_apartment_{apartment_id}_area_{area_id}"
        self._attr_device_class = "occupancy"
        self._attr_available = True
        self.entity_id = f"binary_sensor.{DOMAIN}_occupancy_apartment_{apartment_id}_area_{area_id}"

    async def async_added_to_hass(self) -> None:
        """当实体被添加到 Home Assistant 时调用."""
        if DOMAIN not in self.hass.data:
            self.hass.data[DOMAIN] = {}
        if 'area_sensors' not in self.hass.data[DOMAIN]:
            self.hass.data[DOMAIN]['area_sensors'] = {}

        # 使用户型ID和区域ID的组合作为键
        sensor_key = f"apartment_{self._apartment_id}_area_{self._area_id}"
        self.hass.data[DOMAIN]['area_sensors'][sensor_key] = self

    async def async_will_remove_from_hass(self) -> None:
        """当实体从 Home Assistant 中移除时调用."""
        sensor_key = f"apartment_{self._apartment_id}_area_{self._area_id}"
        if (DOMAIN in self.hass.data and 
            'area_sensors' in self.hass.data[DOMAIN] and 
            sensor_key in self.hass.data[DOMAIN]['area_sensors']):
            del self.hass.data[DOMAIN]['area_sensors'][sensor_key]

    def set_state(self, state: bool) -> None:
        """设置区域状态."""
        self._state = state
        # 如果实体已经添加到 HA，则触发状态更新
        if self.hass and self.entity_id:
            self.hass.states.async_set(
                self.entity_id,
                STATE_ON if state else STATE_OFF,
                {
                    "friendly_name": self._name,
                    "device_class": "occupancy",
                    "icon": "mdi:home-account",
                }
            )
            _LOGGER.info(f"区域状态已更新: {self.entity_id} -> {STATE_ON if state else STATE_OFF}")

    @property
    def state(self) -> str:
        """Return the state of the binary sensor."""
        return STATE_ON if self._state else STATE_OFF

    @property
    def is_on(self) -> bool:
        """Return true if the binary sensor is on."""
        return self._state

    @property
    def extra_state_attributes(self) -> dict:
        """Return the state attributes."""
        return {
            "area_id": self._area_id,
            "event_count": self._event_count,
            "last_event_time": self._last_event_time
        }

    @property
    def name(self) -> str:
        """Return the name of the sensor."""
        return self._name

    @property
    def device_class(self):
        return "occupancy"

    @property
    def available(self):
        return self._attr_available
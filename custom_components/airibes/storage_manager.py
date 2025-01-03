"""Storage manager for apartment data."""
import os
import json
from homeassistant.helpers.entity_registry import async_get
from homeassistant.core import HomeAssistant, callback
from homeassistant.components.websocket_api import (
    async_register_command,
    websocket_command,
    async_response,
    ActiveConnection,
    ERR_UNKNOWN_ERROR
)
import voluptuous as vol
from homeassistant.helpers.storage import Store
import logging
from .const import (
    DOMAIN,
    STORAGE_VERSION,
    APARTMENTS_STORAGE_KEY,
    APARTMENT_DATA_KEY,
    RADAR_STORAGE_KEY,
    EVENT_APARTMENT_VIEW_VISIBLE,
    IMPORTED_DEVICES_KEY
)
import asyncio
from typing import List
import time
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED

_LOGGER = logging.getLogger(__name__)

class StorageManager:
    """管理户型数据的存储."""

    def __init__(self, hass: HomeAssistant):
        """初始化存储管理器."""
        self.hass = hass
        self._storage_dir = hass.config.path('airibes_storage')
        self.apartments_store = Store(hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
        self._store = Store(hass, STORAGE_VERSION, DOMAIN)  # 添加通用存储
        
        # 确保存储目录存在
        if not os.path.exists(self._storage_dir):
            os.makedirs(self._storage_dir)
        
        # 在 Home Assistant 启动完成后执行初始化操作
        hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STARTED,
            self._async_init_apartment_view
        )

    async def _async_init_apartment_view(self, _event):
        """在 Home Assistant 启动完成后初始化户型视图."""
        try:
            # 等待2秒确保所有组件都已加载完成
            await asyncio.sleep(2)
            
            # 发送户型视图可见性事件
            # await self.websocket_set_apartment_view_visible(
            #     self.hass,
            #     None,
            #     {
            #         'type': 'airibes/set_apartment_view_visible',
            #         'visible': True,
            #         'apartment_id': 1  # 直接使用户型一
            #     }
            # )
            self.hass.bus.async_fire(EVENT_APARTMENT_VIEW_VISIBLE, {
                "visible": True,
                "apartment_id": 1
            })
            _LOGGER.info("已初始化户型视图可见性: apartment_id=1")
            
        except Exception as e:
            _LOGGER.error("初始化户型视图可见性失败: %s", str(e))

    def register_websocket_commands(self):
        """注册 websocket 命令."""
        async_register_command(
            self.hass,
            self.websocket_get_apartments
        )
        async_register_command(
            self.hass,
            self.websocket_add_apartment
        )
        async_register_command(
            self.hass,
            self.websocket_save_apartment_data
        )
        async_register_command(
            self.hass,
            self.websocket_load_apartment_data
        )
        async_register_command(
            self.hass,
            self.websocket_clear_apartment_data
        )
        async_register_command(
            self.hass,
            self.websocket_get_stored_devices
        )
        async_register_command(
            self.hass,
            self.websocket_set_apartment_view_visible
        )
        async_register_command(
            self.hass,
            self.websocket_import_devices
        )
        async_register_command(
            self.hass,
            self.websocket_get_imported_devices
        )
        async_register_command(
            self.hass,
            self.websocket_delete_radar_device
        )
        async_register_command(
            self.hass,
            self.websocket_delete_imported_device
        )
        async_register_command(
            self.hass,
            self.websocket_send_reset_nobody_data
        )
        async_register_command(
            self.hass,
            self.websocket_learning_data
        )
    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/get_apartments'
    })
    @async_response
    async def websocket_get_apartments(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """获取户型列表."""
        try:
            store = Store(hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments = await store.async_load()
            
            # 如果没有户型数据,创建默认户型
            if not apartments:
                apartments = {
                    'apartments': [{
                        'id': 1,
                        'name': '户型一'
                    }]
                }
                await store.async_save(apartments)
            
            connection.send_result(msg['id'], apartments)
        except Exception as e:
            _LOGGER.error("获取户型列表失败: %s", str(e))
            connection.send_error(msg['id'], 'load_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/add_apartment',
        vol.Required('name'): str
    })
    @async_response
    async def websocket_add_apartment(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """添加新户型."""
        try:
            store = Store(hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments = await store.async_load()
            
            if not apartments:
                apartments = {'apartments': []}
            
            # 生成新的户型ID
            new_id = max([apt['id'] for apt in apartments['apartments']], default=0) + 1
            
            # 添加新户型
            new_apartment = {
                'id': new_id,
                'name': msg['name']
            }
            apartments['apartments'].append(new_apartment)
            
            # 保存户型列表
            await store.async_save(apartments)
            
            connection.send_result(msg['id'], {'id': new_id})
        except Exception as e:
            _LOGGER.error("添加户型失败: %s", str(e))
            connection.send_error(msg['id'], 'save_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/save_apartment_data',
        vol.Required('apartment_id'): int,
        vol.Required('data'): dict,
        vol.Optional('senderData'): dict,
    })
    @async_response
    async def websocket_save_apartment_data(
        hass: HomeAssistant, connection: ActiveConnection, msg: dict
    ) -> None:
        """保存户型数据."""
        _LOGGER.info("收到保存户型数据的请求: %s", msg)
        try:
            apartment_id = msg['apartment_id']
            data = msg.get("data", {})
            sender_data = msg.get("senderData", {})

            # 使用户型ID作为存储键
            storage_key = f"{APARTMENT_DATA_KEY}_{apartment_id}"
            store = Store(hass, STORAGE_VERSION, storage_key)
            
            # 异步保存数据
            await store.async_save(data)
            _LOGGER.info("保存户型 %s 数据成功: %s", apartment_id, json.dumps(data, indent=2))

            # 创建或更新实体
            await create_entities(hass, data, apartment_id)

            # 处理 senderData
            if sender_data:
                # 记录发送数据结构
                _LOGGER.info("房间数据结构: %s", json.dumps(sender_data, indent=2))

                # 保存到单独的存储
                sender_store = Store(hass, STORAGE_VERSION, f"{storage_key}_sender")
                await sender_store.async_save(sender_data)

                # 通过 MQTT 客户端发送数据
                mqtt_client = hass.data[DOMAIN].get('mqtt_client')
                if mqtt_client:
                    await mqtt_client.send_apartment_data(sender_data)

            connection.send_result(msg["id"])

        except Exception as e:
            _LOGGER.error("保存户型数据失败: %s", str(e))
            connection.send_error(msg["id"], "save_failed", f"保存户型数据失败: {str(e)}")

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/load_apartment_data',
        vol.Required('apartment_id'): int,
    })
    @async_response
    async def websocket_load_apartment_data(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """加载指定户型数据."""
        try:
            apartment_id = msg['apartment_id']
            storage_key = f"{APARTMENT_DATA_KEY}_{apartment_id}"
            store = Store(hass, STORAGE_VERSION, storage_key)
            
            data = await store.async_load()
            # 如果是户型一且没有数据，尝试加载旧数据
            if apartment_id == 1 and not data:
                old_storage_path = os.path.join(hass.config.path('custom_storage'), 'apartment_layout.json')
                if os.path.exists(old_storage_path):
                    try:
                        with open(old_storage_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        # 保存到新的存储位
                        await store.async_save(data)
                        _LOGGER.info("成功迁移旧数据到新存储格式")
                    except Exception as e:
                        _LOGGER.error("迁移旧数据失败: %s", str(e))
            
            # 如果没有数据,返回空数据结构
            if not data:
                data = {
                    'rooms': [],
                    'areas': [],
                    'stickers': [],
                    'devices': [],
                    'nextRoomId': 1,
                    'nextAreaId': 1,
                    'nextStickerId': 1,
                    'availableRoomIds': [],
                    'availableAreaIds': [],
                    'availableStickerIds': []
                }
            
            # _LOGGER.info("加载户型 %s 数据成功: %s", apartment_id, json.dumps(data, indent=2))
            connection.send_result(msg['id'], {'data': data})
        except Exception as e:
            _LOGGER.error("加载户型数据失败: %s", str(e))
            connection.send_error(msg['id'], 'load_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/clear_apartment_data',
        vol.Required('apartment_id'): int,
    })
    @callback
    def websocket_clear_apartment_data(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """清空指定户型数据."""
        storage_dir = hass.config.path('airibes_storage')
        storage_path = os.path.join(storage_dir, 'apartment_layout.json')
        
        try:
            if os.path.exists(storage_path):
                os.remove(storage_path)
            connection.send_result(msg['id'], {'success': True})
        except Exception as e:
            connection.send_error(msg['id'], 'clear_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/get_stored_devices'
    })
    @async_response
    async def websocket_get_stored_devices(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """获取存储的设备列表."""
        try:
            # 使用雷达设备存储键
            store = Store(hass, STORAGE_VERSION, RADAR_STORAGE_KEY)
            stored_devices = await store.async_load() or {}
            
            # 打印存储的设备数据到日志
            _LOGGER.info("获取到存储的雷达设备据: %s", stored_devices)
            
            connection.send_result(msg['id'], stored_devices)
        except Exception as e:
            _LOGGER.error("加载存储的设备数据失败: %s", str(e))
            connection.send_error(msg['id'], 'load_failed', str(e)) 

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/set_apartment_view_visible',
        vol.Required('visible'): bool,
        vol.Required('apartment_id'): int,
    })
    @async_response
    async def websocket_set_apartment_view_visible(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """设置户型视图可见性."""
        _LOGGER.info("收到户型视图可见性变化请求: %s", msg)
        try:
            visible = msg['visible']
            apartment_id = msg['apartment_id']
            # 发送事件
            # hass.bus.async_fire(EVENT_APARTMENT_VIEW_VISIBLE, {
            #     "visible": visible,
            #     "apartment_id": apartment_id
            # })
            
            mqtt_client = hass.data[DOMAIN].get('mqtt_client')
            mqtt_client.set_apartment_view_visible(apartment_id, visible)
            if not mqtt_client:
                raise Exception("MQTT客户端未初始化")

            # 获取所有雷达设备
            radar_store = Store(hass, STORAGE_VERSION, RADAR_STORAGE_KEY)
            stored_devices = await radar_store.async_load() or {}

            if visible:
                # 当visible为true时，加载户型数据
                apartment_store = Store(hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}")
                apartment_data = await apartment_store.async_load()
                
                if apartment_data:
                    rooms = apartment_data.get('rooms', [])
                    # 获取所有在房间中的设备ID
                    devices_in_rooms = set()
                    for room in rooms:
                        if room.get('devices'):
                            devices_in_rooms.update(device_id.upper() for device_id in room['devices'])
                    
                    # 遍历所有雷达设备
                    for device_id in stored_devices:
                        if device_id in devices_in_rooms:
                            # 如果设备在房间中，发送开启命令
                            await mqtt_client.send_start_cmd(device_id)
                            _LOGGER.info("已启动房间中的设备: %s", device_id)
                        else:
                            # 如果设备不在房间中，发送停止命令
                            await mqtt_client.send_stop_cmd(device_id)
                            _LOGGER.info("已停止非房间中的设备: %s", device_id)
            else:
                # 当visible为false时，停止所有雷达设备
                for device_id in stored_devices:
                    await mqtt_client.send_stop_cmd(device_id)
                    _LOGGER.info("已停止设备: %s", device_id)
            
            connection.send_result(msg['id'])
            
        except Exception as e:
            _LOGGER.error("设置户型视图可见性失败: %s", str(e))
            connection.send_error(msg['id'], 'set_visible_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required("type"): "airibes/import_devices",
        vol.Required("entities"): [str]
    })
    @async_response
    async def websocket_import_devices(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """导入设备."""
        try:
            entities = msg["entities"]
            
            # 获取存储管理器
            storage_manager = hass.data[DOMAIN]["storage_manager"]
            
            # 保存导入的设备
            await storage_manager.save_imported_devices(entities)
            
            connection.send_result(msg["id"], {"success": True})
            
        except Exception as e:
            connection.send_error(
                msg["id"], ERR_UNKNOWN_ERROR, str(e)
            )

    async def save_imported_devices(self, entities: List[str]) -> None:
        """保存导入的设备列表."""
        try:
            # 使用专门的存储键来存储导入的设备
            store = Store(self.hass, STORAGE_VERSION, IMPORTED_DEVICES_KEY)
            
            # 加载现有的导入设备数据
            imported_data = await store.async_load() or {}
            
            # 确保有 devices 列表
            if "devices" not in imported_data:
                imported_data["devices"] = []
            
            # 获取现有设备ID列表
            existing_device_ids = {device["entity_id"] for device in imported_data["devices"]}
            
            # 为每个新实体创建设备记录
            for entity_id in entities:
                if entity_id not in existing_device_ids:
                    # 获取实体的当前状态和属性
                    state = self.hass.states.get(entity_id)
                    if state:
                        device_data = {
                            "entity_id": entity_id,
                            "name": state.attributes.get("friendly_name", entity_id),
                            "type": entity_id.split('.')[0],  # light 或 climate
                            "room": state.attributes.get("room", "未分配"),
                            "import_time": int(time.time()),
                            "state": state.state,
                            "attributes": dict(state.attributes)
                        }
                        imported_data["devices"].append(device_data)
                        _LOGGER.info("添加新导入设备: %s", device_data)
            
            # 保存更新后的数据
            await store.async_save(imported_data)
            _LOGGER.info("成功保存导入的设备数据")
            
            # 发送事件通知前端更新
            self.hass.bus.async_fire(f"{DOMAIN}_devices_imported", {
                "devices": imported_data["devices"]
            })
            
        except Exception as e:
            _LOGGER.error("保存导入设备失败: %s", str(e))
            raise

    async def get_imported_devices(self) -> List[dict]:
        """获取已导入的设备列表."""
        try:
            store = Store(self.hass, STORAGE_VERSION, IMPORTED_DEVICES_KEY)
            data = await store.async_load()
            return data.get("devices", []) if data else []
        except Exception as e:
            _LOGGER.error("获取导入设备列表失败: %s", str(e))
            return []

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/get_imported_devices'
    })
    @async_response
    async def websocket_get_imported_devices(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """获取导入的设备列表."""
        try:
            # 获取存储管理器
            storage_manager = hass.data[DOMAIN]["storage_manager"]
            
            # 获取导入的设备列表
            imported_devices = await storage_manager.get_imported_devices()
            
            # 返回结果
            connection.send_result(msg['id'], {"devices": imported_devices})
            
        except Exception as e:
            _LOGGER.error("获取导入设备列表失败: %s", str(e))
            connection.send_error(msg['id'], 'load_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/delete_radar_device',
        vol.Required('device_id'): str
    })
    @async_response
    async def websocket_delete_radar_device(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """删除雷达设备."""
        try:
            device_id = msg['device_id']
            
            # 检查设备状态
            entity_id = f"sensor.{DOMAIN}_radar_{device_id.lower()}"
            entity_state = hass.states.get(entity_id)
            
            # 如果设备离线,返回错误
            if not entity_state or entity_state.state != "在线":
                _LOGGER.warning("设备 %s 离线,无法删除", device_id)
                connection.send_error(
                    msg['id'], 
                    'device_offline',
                    f"设备 {device_id} 离线,请确保设备在线后再删除"
                )
                return
            
            # 设备在线,发送解除绑定命令
            mqtt_client = hass.data[DOMAIN].get('mqtt_client')
            if mqtt_client:
                try:
                    await mqtt_client.sender_unbind_data(device_id)
                    # 发送成功后返回结果
                    connection.send_result(msg['id'], {"success": True})
                except Exception as e:
                    _LOGGER.error("发送解除绑定命令失败: %s", str(e))
                    connection.send_error(msg['id'], 'unbind_failed', str(e))
            else:
                connection.send_error(msg['id'], 'mqtt_client_not_found', "MQTT客户端未初始化")
            
        except Exception as e:
            _LOGGER.error("删除雷达设备失败: %s", str(e))
            connection.send_error(msg['id'], 'delete_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/delete_imported_device',
        vol.Required('entity_id'): str
    })
    @async_response
    async def websocket_delete_imported_device(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """删除导入的设备."""
        try:
            entity_id = msg['entity_id']
            
            # 从存储中删除设备
            store = Store(hass, STORAGE_VERSION, IMPORTED_DEVICES_KEY)
            imported_data = await store.async_load() or {}
            
            if "devices" in imported_data:
                # 过滤掉要删除的设备
                imported_data["devices"] = [
                    device for device in imported_data["devices"]
                    if device["entity_id"] != entity_id
                ]
                await store.async_save(imported_data)
                _LOGGER.info("已删除导入的设备: %s", entity_id)
            
            connection.send_result(msg['id'], {"success": True})
            
        except Exception as e:
            _LOGGER.error("删除导入设备失败: %s", str(e))
            connection.send_error(msg['id'], 'delete_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/send_reset_nobody_data',
        vol.Required('device_id'): str,
        vol.Optional('person_id', default=255): int  # 添加可选参数，默认值255
    })
    @async_response
    async def websocket_send_reset_nobody_data(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """发送重置无人命令."""
        try:
            device_id = msg['device_id']
            person_id = msg.get('person_id', 255)  # 获取person_id参数，默认255
            
            # 获取 MQTT 客户端
            mqtt_client = hass.data[DOMAIN].get('mqtt_client')
            if not mqtt_client:
                raise Exception("MQTT客户端未初始化")
            
            # 发送重置无人命令，带上person_id参数
            await mqtt_client.send_reset_nobody_data(device_id, person_id)
            
            _LOGGER.info("已送重置无人命令到设备: %s, person_id: %s", device_id, person_id)
            connection.send_result(msg['id'], {"success": True})
            
        except Exception as e:
            _LOGGER.error("发送重置无人命令失败: %s", str(e))
            connection.send_error(msg['id'], 'send_failed', str(e))

    @staticmethod
    @websocket_command({
        vol.Required('type'): 'airibes/learning_data',
        vol.Required('learn_type'): int,    # 1: 无人学习, 2: 单人学习
        vol.Required('action'): bool,       # True: 开始, False: 结束
        vol.Required('device_id'): str      # 设备ID
    })
    @async_response
    async def websocket_learning_data(hass: HomeAssistant, connection: ActiveConnection, msg: dict):
        """处理学习命令."""
        try:
            learn_type = msg['learn_type']  # 1 或 2
            action = msg['action']          # True 或 False
            device_id = msg['device_id']
            
            # 获取 MQTT 客户端
            mqtt_client = hass.data[DOMAIN].get('mqtt_client')
            if not mqtt_client:
                raise Exception("MQTT客户端未初始化")
            
            # 发送学习命令
            await mqtt_client.send_learning_command(device_id, learn_type, action)
            
            # 记录日志
            action_str = "开始" if action else "结束"
            learn_type_str = "无人" if learn_type == 1 else "单人"
            _LOGGER.info("发送%s%s学习命令到设备: %s", learn_type_str, action_str, device_id)
            
            connection.send_result(msg['id'], {"success": True})
            
        except Exception as e:
            _LOGGER.error("发送学习命令失败: %s", str(e))
            connection.send_error(msg['id'], 'send_failed', str(e))

    async def async_clear_storage(self) -> None:
        """异步清理存储数据."""
        try:
            storage_base_path = self.hass.config.path(".storage")
            
            # 定义需要删除的存储文件模式
            storage_patterns = [
                f"{DOMAIN}.*",  # 所有以 DOMAIN 开头的存储文件
                f"{APARTMENTS_STORAGE_KEY}.*",  # 户型列表存储
                f"{RADAR_STORAGE_KEY}.*",  # 雷达设备存储
                f"{IMPORTED_DEVICES_KEY}.*",  # 导入设备存储
                f"{APARTMENT_DATA_KEY}_*",  # 所有户型数据存储
                "apartment_layout.json",  # 旧版数据文件
                "airibes_*"  # 所有以 airibes_ 开头的文件
            ]
            
            import glob
            import os
            import shutil
            
            # 清理 .storage 目录
            for pattern in storage_patterns:
                storage_files = glob.glob(os.path.join(storage_base_path, pattern))
                for file_path in storage_files:
                    try:
                        os.remove(file_path)
                        _LOGGER.info("已删除存储文件: %s", file_path)
                    except Exception as e:
                        _LOGGER.warning("删除存储文件失败 %s: %s", file_path, str(e))
            
            # 清理自定义存储目录
            custom_storage_paths = [
                self._storage_dir,  # airibes_storage 目录
                self.hass.config.path('custom_storage'),  # 旧版存储目录
            ]
            
            for storage_path in custom_storage_paths:
                if os.path.exists(storage_path):
                    try:
                        shutil.rmtree(storage_path)
                        _LOGGER.info("已删除存储目录: %s", storage_path)
                    except Exception as e:
                        _LOGGER.warning("删除存储目录失败 %s: %s", storage_path, str(e))
            
            # 清空内存中的数据
            await self.apartments_store.async_save({})
            await self._store.async_save({})
            
            # 清空其他可能的存储
            stores = [
                Store(self.hass, STORAGE_VERSION, RADAR_STORAGE_KEY),
                Store(self.hass, STORAGE_VERSION, IMPORTED_DEVICES_KEY),
                Store(self.hass, STORAGE_VERSION, "apartment_layout"),  # 旧版存储键
            ]
            
            for store in stores:
                try:
                    await store.async_save({})
                except Exception as e:
                    _LOGGER.warning("清空存储失败: %s", str(e))
            
            _LOGGER.info("所有存储数据和文件已清理")
            
        except Exception as e:
            _LOGGER.error("清理存储数据失败: %s", str(e))

    def clear_storage(self) -> None:
        """同步方法 - 已弃用."""
        _LOGGER.warning("使用已弃用的同步 clear_storage 方法，请使用 async_clear_storage")
        self.hass.async_create_task(self.async_clear_storage())

async def create_entities(hass: HomeAssistant, data: dict, apartment_id: int) -> None:
    """创建或更新实体."""
    try:
        # 获取实体注册表
        entity_registry = async_get(hass)

        # 获取当前所有房间和区域ID（确保都是字符串类型）
        current_room_ids = {str(room['id']) for room in data.get('rooms', [])}
        current_area_ids = {str(area['id']) for area in data.get('areas', [])}
        current_door_ids = {str(sticker['id']) for sticker in data.get('stickers', []) 
                          if sticker['type'] == 'door'}

        # 获取已存在的实体
        existing_room_sensors = {
            f"apartment_{apartment_id}_room_{k}": v 
            for k, v in hass.data[DOMAIN].get('room_sensors', {}).items()
        }
        existing_area_sensors = {
            f"apartment_{apartment_id}_area_{k}": v 
            for k, v in hass.data[DOMAIN].get('area_sensors', {}).items()
        }

        _LOGGER.info("当前房间ID: %s", current_room_ids)
        _LOGGER.info("当前区域ID: %s", current_area_ids)
        _LOGGER.info("当前门ID: %s", current_door_ids)
        _LOGGER.info("已存在的房间实体: %s", existing_room_sensors)
        _LOGGER.info("已存在的区域实体: %s", existing_area_sensors)

        # 删除不再存在的房间实体
        for sensor_key in list(existing_room_sensors.keys()):
            room_id = sensor_key.split('_')[-1]  # 从键中提取房间ID
            if room_id not in current_room_ids:
                # 构造实体ID
                entity_id = f"binary_sensor.{DOMAIN}_occupancy_apartment_{apartment_id}_room_{room_id}"
                # 从注册表中删除实体
                if entity_registry.async_get(entity_id):
                    entity_registry.async_remove(entity_id)
                    _LOGGER.info(f"删除不存在的房间实体: {entity_id}")

        # 删除不再存在的区域实体
        for sensor_key in list(existing_area_sensors.keys()):
            area_id = sensor_key.split('_')[-1]  # 从键中提取区域ID
            if (area_id not in current_area_ids and 
                area_id not in current_door_ids):
                # 构造实体ID
                entity_id = f"binary_sensor.{DOMAIN}_occupancy_apartment_{apartment_id}_area_{area_id}"
                # 从注册表中删除实体
                if entity_registry.async_get(entity_id):
                    entity_registry.async_remove(entity_id)
                    _LOGGER.info(f"删除不存在的区域实体: {entity_id}")

        # 创建房间实体
        for room in data.get('rooms', []):
            room_id = str(room['id'])  # 确保使用字符串类型的ID
            sensor_key = f"apartment_{apartment_id}_room_{room_id}"
            if sensor_key not in existing_room_sensors:
                discovery_info = {
                    "room_id": room_id,
                    "name": room.get('name', f"Room {room_id}"),
                    "apartment_id": apartment_id,
                    "unique_id": f"occupancy_apartment_{apartment_id}_room_{room_id}"  # 添加唯一ID
                }
                async_add_room_sensor = hass.data[DOMAIN].get("async_add_room_sensor")
                if async_add_room_sensor:
                    await async_add_room_sensor(discovery_info)

        # 创建区域实体
        for area in data.get('areas', []):
            area_id = str(area['id'])  # 确保使用字符串类型的ID
            sensor_key = f"apartment_{apartment_id}_area_{area_id}"
            if sensor_key not in existing_area_sensors:
                discovery_info = {
                    "area_id": area_id,
                    "name": area.get('name', f"Area {area_id}"),
                    "apartment_id": apartment_id,
                    "unique_id": f"occupancy_apartment_{apartment_id}_area_{area_id}"  # 添加唯一ID
                }
                async_add_area_sensor = hass.data[DOMAIN].get("async_add_area_sensor")
                if async_add_area_sensor:
                    await async_add_area_sensor(discovery_info)

        # 创建门的区域实体
        for sticker in data.get('stickers', []):
            if sticker['type'] == 'door':
                sticker_id = str(sticker['id'])  # 确保使用字符串类型的ID
                sensor_key = f"apartment_{apartment_id}_area_{sticker_id}"
                if sensor_key not in existing_area_sensors:
                    discovery_info = {
                        "area_id": sticker_id,
                        "name": f"Gate {sticker_id}",
                        "apartment_id": apartment_id,
                        "unique_id": f"occupancy_apartment_{apartment_id}_area_{sticker_id}"  # 添加唯一ID
                    }
                    async_add_area_sensor = hass.data[DOMAIN].get("async_add_area_sensor")
                    if async_add_area_sensor:
                        await async_add_area_sensor(discovery_info)

    except Exception as e:
        _LOGGER.error("创建实体失败: %s", str(e))
        raise 

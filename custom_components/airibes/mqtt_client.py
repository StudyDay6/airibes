"""MQTT client for airibes ."""
import logging
import json
import time
import asyncio
from homeassistant.core import HomeAssistant
from homeassistant.components import mqtt
from homeassistant.helpers.entity_registry import async_get
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.entity_platform import async_get_current_platform
from homeassistant.helpers.entity_registry import async_get as async_get_entity_registry
from homeassistant.helpers.device_registry import async_get as async_get_device_registry
from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.components import persistent_notification
from .crypto_utils import encrypt_data, decrypt_data
from .const import DOMAIN, RADAR_CLIFE_PROFILE, STORAGE_VERSION, APARTMENTS_STORAGE_KEY, APARTMENT_DATA_KEY, RADAR_STORAGE_KEY, EVENT_DATA_FORMAT_ERROR
from .binary_sensor import RoomBinarySensor
from homeassistant.helpers.storage import Store
import pickle


_LOGGER = logging.getLogger(__name__)
class MqttClient:
    """MQTT 客户端类."""

    def __init__(self, hass: HomeAssistant):
        """初始化 MQTT 客户端."""
        self.hass = hass
        self.base_topic = "/device/05F6165E01290101"
        self.sender_msgId = 1
        self._status_task = None
        self._subscribe_task = None
        self._is_subscribed = False
        self._is_frontend_visible = False

    async def async_setup(self):
        """设置 MQTT 订阅."""
        try:
            if not self.hass.data.get("mqtt"):
                return False

            self._subscribe_task = asyncio.create_task(self._maintain_subscription())
            return True

        except Exception as e:
            return False

    async def _maintain_subscription(self):
        """维持 MQTT 订阅的任务."""
        retry_interval = 5
        max_retries = None

        while True:
            try:
                if not self._is_subscribed:
                    upward_topic = f"{self.base_topic}/+/upward"
                    
                    try:
                        await mqtt.async_subscribe(
                            self.hass,
                            upward_topic,
                            self._message_received,
                            qos=0
                        )
                        self._is_subscribed = True
                        _LOGGER.debug("MQTT 订阅成功")
                    except Exception as e:
                        self._is_subscribed = False

                if self._is_subscribed and not self.hass.data.get("mqtt"):
                    self._is_subscribed = False

                if not self._is_subscribed:
                    await asyncio.sleep(retry_interval)
                else:
                    await asyncio.sleep(60)

            except asyncio.CancelledError:
                _LOGGER.debug("MQTT 订阅维护任务被取消")
                break
            except Exception as e:
                _LOGGER.debug("MQTT 订阅维护任务出错: %s", str(e))
                await asyncio.sleep(retry_interval)

    async def async_stop(self):
        """停止 MQTT 客户端."""
        if self._status_task:
            self._status_task.cancel()
            try:
                await self._status_task
            except asyncio.CancelledError:
                pass
            self._status_task = None

        if self._subscribe_task:
            self._subscribe_task.cancel()
            try:
                await self._subscribe_task
            except asyncio.CancelledError:
                pass
            self._subscribe_task = None

    async def _message_received(self, message):
        """处理接收到的 MQTT 消息."""
        topic = message.topic
        payload = message.payload

        # 首先验证主题是否包含基础主题
        if not topic.startswith(self.base_topic):
            return
        _LOGGER.debug("收到 MQTT 消息: %s", topic)
        # 解析主题获取 device_id
        topic_parts = topic.split('/')
        if len(topic_parts) == 5:  # 确保主题格式正确
            device_id = topic_parts[3]  # 获取通配符位置的值
            
            try:
                # 尝试解析 payload 为 JSON
                if isinstance(payload, bytes):
                    payload_str = payload.decode('utf-8')
                else:
                    payload_str = payload

                payload_data = json.loads(payload_str)
                _LOGGER.debug("收到 MQTT 消息: Payload=%s", payload_data)

                # 获取 cmd 字段
                if 'cmd' in payload_data:
                    cmd = payload_data['cmd']
                    # 处理不同的 cmd
                    if cmd == 2004:
                        # 处理 cmd 2004 消息
                        await self._handle_cmd_2004(device_id, payload_data)
                    elif cmd == 2006:
                        # 处理 cmd 2006 消息
                        await self._handle_cmd_2006(device_id, payload_data)
                    elif cmd == 2012:
                        # 处理 cmd 2012 消息
                        await self._handle_cmd_2012(device_id, payload_data)
                    elif cmd == 2014:
                        # 处理 cmd 2014 消息
                        await self._handle_cmd_2014(device_id, payload_data)
                else:
                    _LOGGER.debug("消息中缺少 cmd 字段: %s", payload_str)
            except json.JSONDecodeError as e:
                _LOGGER.debug("JSON 解析失败: %s, Payload: %s", str(e), payload)
            except Exception as e:
                _LOGGER.debug("处理消息时出错: %s", str(e))
        else:
            _LOGGER.debug("无效的主题格式: %s", topic)

    def set_apartment_view_visible(self, apartment_id: int, visible: bool):
        """设置户型视图可见性."""
        self._is_frontend_visible = visible

    async def _get_radar_sensor(self, entity_id: str):
        """获取雷达传感实体."""
        entity_registry = await async_get_entity_registry(self.hass)
        return entity_registry.async_get(f"sensor.{entity_id}")

    async def _register_radar_device(self, device_id: str) -> bool:
        """注册雷达设备.
        
        Args:
            device_id: 设备ID
            
        Returns:
            bool: 注册是否成功
        """
        try:
            # 检查设备是否已存在
            entity_registry = async_get_entity_registry(self.hass)
            existing_sensor = entity_registry.async_get_entity_id(
                "sensor", DOMAIN, f"radar_sensor_{device_id}"
            )
            
            if existing_sensor:
                # 更新传感器状态为在线
                # await self._handle_device_status(device_id, 1)  # 1 表示在线
                await self._sender_for_all_status_cmd(device_id)
                return True
                
            # 设备不存在，创建新设备
            async_add_radar_sensor = self.hass.data[DOMAIN].get("async_add_radar_sensor")
            async_add_radar_select = self.hass.data[DOMAIN].get("async_add_radar_select")
            async_add_radar_switch = self.hass.data[DOMAIN].get("async_add_radar_switch")
            async_add_radar_button = self.hass.data[DOMAIN].get("async_add_radar_button")

            if async_add_radar_sensor and async_add_radar_select and async_add_radar_switch and async_add_radar_button:
                # 创建传感器、选择和开关实体
                sensor = await async_add_radar_sensor(device_id)
                select = await async_add_radar_select(device_id)
                switch = await async_add_radar_switch(device_id)
                button = await async_add_radar_button(device_id)
                if sensor and select and switch and button:
                    # 设置设备初始状态为在线
                    await self._handle_device_status(device_id, 1)  # 1 表示在线
                    return True
                    
            _LOGGER.error("创建设备失败: %s", device_id)
            return False

        except Exception as e:
            _LOGGER.error("注册雷达设备失败: %s", str(e))
            return False

    async def _handle_cmd_2004(self, device_id: str, payload: dict):
        """处理 cmd 2004 的消息."""
        try:
            plaintext = payload.get('data')
            msg_id = payload.get('msgId')
                        
            if plaintext:
                # 注册雷达设备
                if await self._register_radar_device(device_id):
                    # 入网应答数据
                    await self._async_data_publish(device_id, 2005, 2, msg_id, RADAR_CLIFE_PROFILE)
                else:
                    # 注册失败，显示通知
                    await self.hass.async_create_task(
                        persistent_notification.async_create(
                            self.hass,
                            f"设备 {device_id} 入网失败，请重试",
                            "雷设备入网失败",
                            f"{DOMAIN}_radar_register_failed"
                        )
                    )
        except Exception as e:
            _LOGGER.error("处理 cmd 2004 失败: %s", str(e))
            # 显示错误通知
            await self.hass.async_create_task(
                persistent_notification.async_create(
                    self.hass,
                    f"设备 {device_id} 入网失败: {str(e)}，请重试",
                    "雷达设备入网失败",
                    f"{DOMAIN}_radar_register_failed"
                )
            )

    async def _handle_device_status(self, device_id: str, value: int):
        """处理设备状态数据."""
        try:            
            # 更新传感器状态
            entity_id = f"sensor.{DOMAIN}_radar_{device_id}"
            state = "在线" if value == 1 else "离线"
            
            # 更新设备状态
            self.hass.states.async_set(
                entity_id,
                state,
                {
                    "device_id": device_id,
                    "status": state,
                    "last_update": int(time.time())
                }
            )

            # 从 hass.data 中获取传感器实体
            sensor = self.hass.data[DOMAIN].get("sensors", {}).get(device_id)
            if sensor and hasattr(sensor, 'set_online_status'):
                sensor.set_online_status(value == 1)

            # 发送状态更新事件，用于前端更新
            self.hass.bus.async_fire(
                f"{DOMAIN}_device_status_update",
                {
                    "device_id": device_id,
                    "status": value == 1
                }
            )
            
        except Exception as e:
            _LOGGER.error("处理设备状态数据失败: %s", str(e))

    async def _handle_cmd_2006(self, device_id: str, payload: dict):
        """处理 cmd 2006 的消息."""
         # 获取设备实体ID
        entity_id = f"sensor.airibes_radar_{device_id.lower()}"
        
        # 获取设备当前状态
        entity_state = self.hass.states.get(entity_id)
        if entity_state is None or entity_state.state != "在线":
            # 设备离线时才更新状态
            await self._handle_device_status(device_id, 1)
        
        try:
            encrypted_data = payload.get('data')
            if encrypted_data:
                # 解密数据
                decrypted_data = decrypt_data(encrypted_data)
                if isinstance(decrypted_data, str):
                    data_json = json.loads(decrypted_data)
                else:
                    data_json = decrypted_data
                    
                if 'params' in data_json:
                    for param in data_json['params']:
                        for key, value in param.items():
                            if key == '74':
                                # 只有在等待响应（有回调函数）才处理响应
                                if hasattr(self, '_response_callbacks') and device_id in self._response_callbacks:
                                    callback = self._response_callbacks[device_id]
                                    # 直接传递原始响应数据
                                    callback({
                                        'cmd': 2006,
                                        'key': 74,
                                        'value': value
                                    })
                                else:
                                    # 设备主动推送的数据，处理同步
                                    if not isinstance(value, str) or "HASS_" not in value:
                                        continue
                                    await self.sync_apartment_data(device_id, value)
                                # 发送共同出入口id数据
                                await self.send_common_door_id_to_device(device_id)
                            elif key == '76' or key == '78':
                                try:
                                    # 处理转义的 JSON 字符串
                                    value = value.replace('\\"', '"')  # 替换转义的双引号
                                    positions = json.loads(value)
                                    
                                    # 获取当前设备的所有位置数据
                                    if not hasattr(self, '_person_positions'):
                                        self._person_positions = {}
                                    if device_id not in self._person_positions:
                                        self._person_positions[device_id] = []
                                    
                                    # 如果是key 76且收到空列表，直接清空并更新
                                    if key == '76' and not positions:
                                        self._person_positions[device_id] = []
                                    else:
                                        # 如果是key 76，先清空现数据
                                        if key == '76':
                                            self._person_positions[device_id] = []
                                        
                                        # 转换坐标（米转换为厘米）并添加到列表中
                                        for pos in positions:
                                            converted_pos = {
                                                "id": pos["id"],
                                                "x": pos["x"] * 100,  # 米转厘米
                                                "y": pos["y"] * 100   # 米转厘米
                                            }
                                            # 更新或添加位置数据
                                            existing_pos = next(
                                                (p for p in self._person_positions[device_id] if p["id"] == pos["id"]), 
                                                None
                                            )
                                            if existing_pos:
                                                existing_pos.update(converted_pos)
                                            else:
                                                self._person_positions[device_id].append(converted_pos)
                                    
                                    # 发送事件通知前端更新
                                    self.hass.bus.async_fire(
                                        f"{DOMAIN}_person_positions_update",
                                        {
                                            "device_id": device_id,
                                            "positions": self._person_positions[device_id]
                                        }
                                    )
                                    
                                    # 更新设备的人员位置属性
                                    entity_id = f"sensor.{DOMAIN}_radar_{device_id}"
                                    state = self.hass.states.get(entity_id)
                                    if state:
                                        new_attributes = dict(state.attributes)
                                        new_attributes["person_positions"] = self._person_positions[device_id]
                                        self.hass.states.async_set(
                                            entity_id,
                                            state.state,
                                            new_attributes
                                        )
                                    
                                except json.JSONDecodeError as e:
                                    _LOGGER.error("解析人员位置数据失败: %s, 原始数据: %s", str(e), value)
                                except Exception as e:
                                    _LOGGER.error("处理人员位置数据失败: %s", str(e))
                            
                            elif key == '6':
                                # 设备状态（在线/离线）处理方法
                                await self._handle_device_status(device_id, value)
                            elif key == '7':
                                # 处理设备本信息
                                pass
                                
                            elif key == '8':
                                # 更新灵敏度选择实体
                                select_entity_id = f"select.{DOMAIN}_radar_{device_id}_level"
                                
                                # 获取选择实体对象
                                select = self.hass.data[DOMAIN].get("selects", {}).get(device_id)
                                if select:
                                    # 将数值转换为对应的选项
                                    level_map = {0: "低", 1: "中", 2: "高"}
                                    new_option = level_map.get(value)
                                    
                                    if new_option and new_option != select.current_option:
                                        await select.async_select_option(new_option)
                                        
                            elif key == '9':
                                # 处理设备工作模式
                                _LOGGER.info("设备工作模式: device_id=%s, value=%s", device_id, value)
                                
                            elif key == '10':
                                # 处理设报警状态
                                _LOGGER.info("设备报警状态: device_id=%s, value=%s", device_id, value)
                                
                            elif key == '11':
                                # 处理设备监测人数数量
                                _LOGGER.info("设备监测人数数量: device_id=%s, value=%s", device_id, value)
                                
                            elif key == '12':
                                # 处理设备电池电量
                                _LOGGER.info("设备电池电量: device_id=%s, value=%s", device_id, value)
                                
                            elif key == '13':
                                # 处理设备上报开关状态
                                if self._is_frontend_visible and value == 0:
                                    await self.send_start_cmd(device_id)
                                
                            elif key == '14':
                                # 处理设备温度
                                _LOGGER.info("设备温度: device_id=%s, value=%s", device_id, value)

                            elif key == '15':
                                # 处理设备湿度
                                _LOGGER.info("设备湿度: device_id=%s, value=%s", device_id, value)

                            elif key == '16':
                                # 更新 AP 开关状态
                                switch_entity_id = f"switch.{DOMAIN}_radar_{device_id}_ap"
                                # 获取开关实体对象
                                switch = self.hass.data[DOMAIN].get("switches", {}).get(device_id)
                                if switch:
                                    current_state = switch.is_on
                                    new_state = bool(value == 1)
                                    # 只有当状态需要改变时才调用相应方法
                                    if current_state != new_state:
                                        # 直接更新开关状态，而不是调用 turn_on/off 方法
                                        switch._is_on = new_state
                                        # 通知 Home Assistant 状态已更新
                                        switch.async_write_ha_state()
                                        
                            elif key == '17':
                                _LOGGER.info('mqtt -- 事件数据状态: %s', value)
                                try:
                                    value_dict = json.loads(value) if isinstance(value, str) else value
                                    if value_dict.get('siid') == 13 and value_dict.get('eiid') == 1:
                                        args = value_dict.get('arg', [])
                                        # 每两个元素为一组处理
                                        index = 0
                                        for i in range(0, len(args), 2):
                                            if i + 1 < len(args):
                                                index += 1
                                                area_id = args[i].get(str(index))
                                                has_person = args[i + 1].get(str(index + 10))
                                                if area_id is not None and has_person is not None:
                                                    await self.update_area_status(device_id, area_id, has_person == 1)
                                    elif value_dict.get('siid') == 13 and value_dict.get('eiid') == 3:
                                        _LOGGER.info('mqtt -- 出入口移动事件状态: %s', value_dict)
                                        args = value_dict.get('arg', [])
                                        if len(args) == 4:  # 确保有四个元素
                                            area_id = args[0].get('1')
                                            direction = args[1].get('21')
                                            frames = args[2].get('26')
                                            number = args[3].get('27')
                                            if all(v is not None for v in [area_id, direction, frames, number]):
                                                await self.notify_area_movement(device_id, area_id, direction, frames, number)
                                        else:
                                            _LOGGER.warning('mqtt -- 出入口移动事件参数不完整: %s', args)
                                except Exception as e:
                                    _LOGGER.error(f"处理区域状态数据失败: {str(e)}")
                            elif key == '18':
                                # 处理设备IP地址
                                _LOGGER.info("设备IP地址: device_id=%s, value=%s", device_id, value)
                                
                            elif key == '19':
                                _LOGGER.info('mqtt -- 整屋有无人状态改变')
                                # 更新房间状态
                                await self.update_room_status(device_id, value)
                            elif key == '70':
                                # 更新自学习开关状态
                                _LOGGER.info("自学习开关状态: device_id=%s, value=%s", device_id, value)
                                switch_entity_id = f"switch.{DOMAIN}_radar_{device_id}_learn"
                                # 获取开关实体对象
                                switch = self.hass.data[DOMAIN].get("switches", {}).get(f"{device_id}_learn")
                                if switch:
                                    current_state = switch.is_on
                                    new_state = bool(value == 1)
                                    # 只有当状态需要改变时才调用相应方法
                                    if current_state != new_state:
                                        if new_state:
                                            await switch.async_turn_on()
                                        else:
                                            await switch.async_turn_off()
                                        _LOGGER.info("更新自学习开关状态: %s -> %s", switch_entity_id, "on" if new_state else "off")
                            elif key == '73':
                                # 方法回复数据
                                _LOGGER.info("方法回复数据: %s", value)
                                # 方法回复数据: {"msgId":77,"siid":12,"aiid":1,"code":0,"out":[{"6":false}]}
                                value_dict = json.loads(value) if isinstance(value, str) else value
                                _LOGGER.info("校验 -- 方法回复数据0000: %s", value_dict)
                                if value_dict.get('siid') == 12 and value_dict.get('aiid') == 1:
                                    if value_dict.get('out') and value_dict.get('out')[0].get('6') is not None:
                                        #校验结果
                                        calibration_result = value_dict.get('out')[0].get('6')
                                        _LOGGER.info("方法回复数据--校验结果: %s", calibration_result)
                                        # 发送状态更新事件，用于前端更新
                                        self.hass.bus.async_fire(
                                            f"{DOMAIN}_device_calibration_result",
                                            {
                                                "device_id": device_id,
                                                "result": calibration_result
                                            }
                                        )   
                            else:
                                _LOGGER.info("未知 Key %s 数据: %s", key, value)
                else:
                    _LOGGER.warning("解密数据中没有 params 字段: %s", decrypted_data)
        except Exception as e:
            _LOGGER.error("处理 cmd 2006 数据失败: %s", str(e))

    async def _handle_cmd_2012(self, device_id: str, payload: dict):
        """处理 cmd 2012 的消息."""
        _LOGGER.info("收到 cmd 2012 消息: %s", payload)
        # 收到设备重置命令表明设备已从集成删除
        try:
            # 1. 从存储中删除设备数据
            store = Store(self.hass, STORAGE_VERSION, RADAR_STORAGE_KEY)
            stored_devices = await store.async_load() or {}
            
            if device_id.upper() in stored_devices:
                # 删除设备数据
                del stored_devices[device_id.upper()]
                
                # 使用 pickle 序列化数据
                cleaned_devices = pickle.dumps(stored_devices)
                # 再反序列化回来保存
                cleaned_devices = pickle.loads(cleaned_devices)
                
                # 保存清理后的数据
                await store.async_save(cleaned_devices)
                _LOGGER.info("已从存储中删除设备: %s，更新后的存储数据: %s", device_id, cleaned_devices)
                
                # # 2. 删除设备相关的所有实体
                entity_registry = async_get(self.hass)
                # 删除传感器实体
                sensor_entity_id = f"sensor.{DOMAIN}_radar_{device_id}"
                if entity_registry.async_get(sensor_entity_id):
                    entity_registry.async_remove(sensor_entity_id)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(sensor_entity_id)

                # 删除开关实体
                switch_entity_id = f"switch.{DOMAIN}_radar_{device_id}_ap"
                if entity_registry.async_get(switch_entity_id):
                    entity_registry.async_remove(switch_entity_id)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(switch_entity_id)
                learn_switch_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
                if entity_registry.async_get(learn_switch_entity_id):
                    entity_registry.async_remove(learn_switch_entity_id)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(learn_switch_entity_id)

                # 删除选择实体
                select_entity_id = f"select.{DOMAIN}_radar_{device_id}_level"
                if entity_registry.async_get(select_entity_id):
                    entity_registry.async_remove(select_entity_id)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(select_entity_id)

                # 删除按钮实体
                button_entity_id = f"{DOMAIN}_radar_{device_id}_learn"
                if entity_registry.async_get(button_entity_id):
                    entity_registry.async_remove(button_entity_id)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(button_entity_id)
                button_entity_id1 = f"{DOMAIN}_radar_{device_id}_learn1"
                if entity_registry.async_get(button_entity_id1):
                    entity_registry.async_remove(button_entity_id1)
                    # 同时从 states 中移除实体状态
                    self.hass.states.async_remove(button_entity_id1)
                    
                # 3. 从 hass.data 中删除设备相关数据
                if device_id in self.hass.data[DOMAIN].get("sensors", {}):
                    del self.hass.data[DOMAIN]["sensors"][device_id]
                
                if device_id in self.hass.data[DOMAIN].get("switches", {}):
                    del self.hass.data[DOMAIN]["switches"][device_id]
                    
                if device_id in self.hass.data[DOMAIN].get("selects", {}):
                    del self.hass.data[DOMAIN]["selects"][device_id]
                    
                # 4. 从设备注册表中删除设备
                device_registry = dr.async_get(self.hass)
                device_entry = device_registry.async_get_device(
                    identifiers={(DOMAIN, device_id)}
                )
                if device_entry:
                    device_registry.async_remove_device(device_entry.id)

                # 删除户型数据中的设备
                await self.delete_apart_device(device_id)

                # 5. 强制刷新实体注册表
                # await entity_registry.async_load()
                await self.publish_empty_message(device_id)

                # 6. 通知前端刷新
                self.hass.bus.async_fire(
                    f"{DOMAIN}_device_removed",
                    {
                        "device_id": device_id
                    }
                ) 
                # 强制刷新实体注册表以确保实体列表更新
                await entity_registry.async_load()
            else:
                _LOGGER.debug("设备 %s 不在存储中", device_id)
                
        except Exception as e:
            _LOGGER.error("处理设备删除失败: %s", str(e))

    async def _handle_cmd_2014(self, device_id: str, payload: dict):
        """处理 cmd 2014 的消息."""
        # 收到遗嘱表明设备状态已离线
        await self._handle_device_status(device_id, 0)
        # 清空此设备的人员位置数据
        self.hass.bus.async_fire(
            f"{DOMAIN}_person_positions_update",
            {
                "device_id": device_id,
                "positions": []
            }
        )

    # 发送获取全部状态数据 （所有设备）
    async def _sender_for_all_status_cmd(self, device_id: str):
        await self._sender_for_status_cmd(device_id, [])

    async def _sender_for_status_cmd(self, device_id: str, status: list):
        self.sender_msgId += 1  # 递增消息ID
        await self._async_data_publish(device_id, 2009, 2, self.sender_msgId, {"params": status})

    #发送属性数据
    async def _sender_profile_data(self, device_id: str, data: dict):
        self.sender_msgId += 1  # 递增消息ID
        await self._async_data_publish(device_id, 2011, 1, self.sender_msgId, data)

    #发送方法数据
    async def _sender_method_data(self, device_id: str, data: dict):
        cmdData = {"params": [{"72": json.dumps(data, separators=(',', ':'))}]}
        self.sender_msgId += 1  # 递增消息ID
        await self._async_data_publish(device_id, 2011, 1, self.sender_msgId, cmdData)

    async def _async_data_publish(self, device_id: str, cmd: int, prio: int, msg_id: int, data: dict = None):
        """异步发送数据.
        
        Args:
            device_id: 设备ID
            cmd: 命令ID
            prio: 优先级
            msg_id: 消息ID
            data: 要发送的数据,可选参数
        """
        try:
            if data:  # 如果有数据需要发送
                plaintext = json.dumps(data, separators=(',', ':'))
                sender_data = encrypt_data(plaintext)
                response = {
                    "cmd": cmd,
                    "dir": "30",
                    "msgId": msg_id,
                    "prio": prio,
                    "ver": "2.3",
                    "timestamp": int(time.time() * 1000),
                    "data": sender_data
                }
            else:  # 如果不需要发送数据
                response = {
                    "cmd": cmd,
                    "dir": "30",
                    "msgId": msg_id,
                    "prio": prio,
                    "ver": "2.3",
                    "timestamp": int(time.time() * 1000)
                }
            
            return await self.async_publish(device_id, json.dumps(response))
        except Exception as e:
            return False

    async def async_publish(self, device_id: str, payload: str):
        """发 MQTT 消息.
        
        Args:
            device_id: 设备ID
            payload: 要发送的数据
            
        Returns:
            bool: 发送是否成功
        """
        topic = f"{self.base_topic}/{device_id.upper()}/downward"
        try:
            await mqtt.async_publish(
                self.hass,
                topic,
                payload,
                0,
                False
            )
            return True
        except Exception as e:
            return False

    async def publish_empty_message(self, device_id: str):
        """发布空消息到指定的上行主题."""
        topic = f"{self.base_topic}/{device_id.upper()}/upward"
        try:
            await mqtt.async_publish(
                self.hass,
                topic,
                {},
                0,
                True
            )
        except Exception as e:
            pass

    # 取设备存在的区域
    async def get_device_area(self, device_id: str):
        sub_data = {"msgId": 99, "siid": 6, "aiid": 5, "in": [{"1": 1}]}
        await self._sender_method_data(device_id, sub_data)

    # 设备解除绑定
    async def sender_unbind_data(self, device_id: str):
        self.sender_msgId += 1  # 递增消息ID
        await self._async_data_publish(device_id, 2013, 2, self.sender_msgId)

    # 发送获取设备状态指令
    async def send_device_status_cmd(self, device_id: str):
        sub_data = {"params": [{"13": 1}]}
        await self._sender_profile_data(device_id, sub_data)

    # 发送重置无人命令
    async def send_reset_nobody_data(self, device_id: str, value: int):
        sub_data = {"msgId": 55, "siid": 5, "aiid": 1, "in": [{"5": value}]}
        await self._sender_method_data(device_id, sub_data)

    # 发送学习命令
    async def send_learning_command(self, device_id: str, learn_type: int, value: bool):
        if learn_type == 1:
            sub_data = {"params": [{"58": 1 if value else 0}]}
        elif learn_type == 2:
            sub_data = {"params": [{"68": 1 if value else 0}]}
        await self._sender_profile_data(device_id, sub_data)

    # 发送单个设备的户型数据
    async def send_single_device_apartment_data(self, device_id: str, device_data: dict) -> bool:
        """发送单个设备的户型数据."""
        try:            
            # 构造单个设备的数据
            room_data = {"params": [{"61": json.dumps(device_data, separators=(',', ':'))}]}
            
            # 发送数据并等待响应
            success = False
            retry_count = 0
            max_retries = 3
            
            while not success and retry_count < max_retries:
                try:
                    await self._sender_profile_data(device_id, room_data)
                    
                    # 等待响应
                    response = await self._wait_for_response(device_id, timeout=30)
                    
                    if response and response.get('cmd') == 2006 and response.get('key') == 74:
                        value = response.get('value')
                        if value == '0':
                            # 发送事件通知前端
                            self.hass.bus.async_fire(EVENT_DATA_FORMAT_ERROR, {
                                "room_id": device_data.get('room_id'),
                                "message": "户型数据格式有误"
                            })
                            return False
                        else:
                            return True
                    else:
                        retry_count += 1
                        if retry_count < max_retries:
                            await asyncio.sleep(1)
                            
                except asyncio.TimeoutError:
                    retry_count += 1
                    if retry_count < max_retries:
                        await asyncio.sleep(1)
                except Exception as e:
                    retry_count += 1
                    if retry_count < max_retries:
                        await asyncio.sleep(1)
            
            if not success:
                _LOGGER.debug('mqtt -- 设备 %s 户型数据发送失败，已达到最大重试次数', device_id)
            
            return success
            
        except Exception as e:
            return False

    async def sync_apartment_data(self, device_id: str, version_str: str):
        """同步户型数据."""
        try:            
            # 解析版本字符串
            parts = version_str.split('_')
            if len(parts) < 3:
                return
                
            apartment_id = parts[2]
            received_version = version_str
            
            if not apartment_id or not received_version:
                return
                            
            # 加载户型的 sender_data
            sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
            sender_data = await sender_store.async_load()
            
            if not sender_data or device_id not in sender_data:
                return
                
            # 获取当前设备的据
            device_data = sender_data[device_id]
            current_version = device_data.get('version')
            
            
            # 比较版本
            if str(current_version) != str(received_version):
                await self.send_single_device_apartment_data(device_id, device_data)
            else:
                _LOGGER.debug('mqtt -- 版本匹配，无需同步: device_id=%s', device_id)
                
        except Exception as e:
            _LOGGER.debug('mqtt -- 同步户型数据失败: %s', str(e))

    async def send_apartment_data(self, sender_data: dict) -> None:
        """发送户型数据."""
        try:            
            # 遍历所有设备ID
            for device_id, device_data in sender_data.items():
                # 检查设备是否在线
                entity_id = f"sensor.airibes_radar_{device_id.lower()}"
                entity_state = self.hass.states.get(entity_id)
                
                if entity_state and entity_state.state == "在线":
                    try:
                        await self.send_single_device_apartment_data(device_id, device_data)
                    except Exception as e:
                        continue
                else:
                    continue
            
            _LOGGER.debug("所有户型数据发送完成")
            
        except Exception as e:
            raise

    async def _wait_for_response(self, device_id: str, timeout: int = 60) -> dict:
        """等待设备响应.
        
        Args:
            device_id: 设备ID
            timeout: 超时时间（秒），默认60秒
        """
        if not hasattr(self, '_response_callbacks'):
            self._response_callbacks = {}
            
        try:
            # 创建Future对象用于等待响应
            future = asyncio.Future()
            
            def response_callback(response):
                if not future.done():
                    future.set_result(response)
            
            # 添加响应回调前先清理可能存在的旧回调
            self._response_callbacks.pop(device_id, None)
            # 添加新的响应回调
            self._response_callbacks[device_id] = response_callback
            
            try:
                # 等待响应，使用指定的超时时间
                return await asyncio.wait_for(future, timeout)
            finally:
                # 确保在任何情况下都清理回调
                if device_id in self._response_callbacks and self._response_callbacks[device_id] == response_callback:
                    self._response_callbacks.pop(device_id, None)
                
        except asyncio.TimeoutError:
            _LOGGER.warning(f"等待设备 {device_id} 响应超时（{timeout}秒）")
            raise
        except Exception as e:
            _LOGGER.error(f"等待设备 {device_id} 响应时出错: {str(e)}")
            raise

    async def send_start_cmd(self, device_id: str) -> None:
        """发送开启命令."""
        try:
            cmd_data = {"params": [{"13": 1}]}  # 开启命令
            await self._sender_profile_data(device_id, cmd_data)
            await self._sender_for_status_cmd(device_id, [74, 76])
        except Exception as e:
            _LOGGER.error(f"发送开启命令失败: {str(e)}")

    async def send_stop_cmd(self, device_id: str) -> None:
        """发送停止命令."""
        try:
            cmd_data = {"params": [{"13": 0}]}  # 停止命令
            await self._sender_profile_data(device_id, cmd_data)
        except Exception as e:
            _LOGGER.error(f"发送停止命令失败: {str(e)}")

    async def send_start_calibration_cmd(self, device_id: str, door_position: dict):
        """发送开始校准命令."""
        print("door_position:", door_position)
        try:
            sub_data = {"msgId": 77, "siid": 12, "aiid": 1, "in": [{"4": door_position['x']}, {"5": door_position['y']}]}
            await self._sender_method_data(device_id, sub_data)
        except Exception as e:
            _LOGGER.error(f"发送开始校准命令失败: {str(e)}")

    async def update_room_status(self, device_id: str, value: int):
        """更新房间状态"""
        try:            
            # 获取户型列表
            apartments_store = Store(self.hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments_data = await apartments_store.async_load()
            
            # 遍历所有户型查找设备
            device_info = None
            apartment_id = None
            
            if apartments_data and 'apartments' in apartments_data:
                for apartment in apartments_data['apartments']:
                    apartment_id = apartment['id']

                    # 加载户型的 sender_data
                    sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
                    sender_data = await sender_store.async_load()
                    if sender_data and device_id in sender_data:
                        device_info = sender_data[device_id]
                        break

            if not device_info or not apartment_id:
                _LOGGER.error(f"找不到设备 {device_id} 对应的房间信息")
                return
            
            room_id = device_info.get("room_id")
            if room_id is None:
                _LOGGER.error(f"设备 {device_id} 的房间ID为空")
                return
            
            # 获取房间传感器实体并更新其状态
            sensor_key = f"apartment_{apartment_id}_room_{room_id}"
            room_sensor = self.hass.data[DOMAIN].get('room_sensors', {}).get(sensor_key)
            if room_sensor:
                room_sensor.set_state(value == 1)
            else:
                _LOGGER.warning(f"未找到房间传感器: {sensor_key}")
            
        except Exception as e:
            _LOGGER.error(f"更新房间状态失败: {e}")

    async def update_area_status(self, device_id: str, area_id: int, has_person: bool):
        """更新区域状态"""
        try:
            # 获取户型列表
            apartments_store = Store(self.hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments_data = await apartments_store.async_load()
            
            # 遍历所有户型查找设备
            device_info = None
            apartment_id = None
            
            if apartments_data and 'apartments' in apartments_data:
                for apartment in apartments_data['apartments']:
                    apartment_id = apartment['id']
                    
                    # 加载户型的 sender_data
                    sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
                    sender_data = await sender_store.async_load()
                    
                    if sender_data and device_id in sender_data:
                        device_info = sender_data[device_id]
                        
                        # 检查区域ID是否属于这个设备
                        if 'region' in device_info:
                            # 遍历 region 数组查找匹配的 area_id
                            for region in device_info['region']:
                                if region.get('area-id') == area_id:
                                    break
                            else:
                                # 如果遍历完没找到匹配的区域，继续检查下一户型
                                continue
                            # 找到匹配的区域，跳出户型循环
                            break
                        
            if not device_info or not apartment_id:
                return
            
            # 获取区域传感器实体并更新其状态
            sensor_key = f"apartment_{apartment_id}_area_{area_id}"
            area_sensor = self.hass.data[DOMAIN].get('area_sensors', {}).get(sensor_key)
            if area_sensor:
                area_sensor.set_state(has_person)
            else:
                _LOGGER.warning(f"未找到区域传感器: {sensor_key}")
                
        except Exception as e:
            _LOGGER.error(f"更新区域状态失败: {e}")

    async def notify_area_movement(self, source_device_id: str, area_id: int, direction: int, frames: int, number: int):
        """通知其他设备区域移动事件."""
        try:
            # 获取户型列表
            apartments_store = Store(self.hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments_data = await apartments_store.async_load()
            
            if apartments_data and 'apartments' in apartments_data:
                for apartment in apartments_data['apartments']:
                    apartment_id = apartment['id']
                    
                    # 加载户型的 sender_data
                    sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
                    sender_data = await sender_store.async_load()
                    
                    if sender_data and source_device_id in sender_data:
                        # 遍历其他设备
                        for target_device_id, device_info in sender_data.items():
                            # 跳过源设备
                            if target_device_id == source_device_id:
                                continue
                            
                            # 检查设备的区域配置
                            if 'region' in device_info:
                                for region in device_info['region']:
                                    if region.get('area-id') == area_id:
                                        sub_data = {"msgId": 8, "siid": 13, "aiid": 4, "in": [{"1": area_id}, {"21": direction}, {"26": frames}, {"27": number}]}
                                        await self._sender_method_data(target_device_id, sub_data)
                                        break
        
        except Exception as e:
            _LOGGER.error('mqtt -- 处理区域移动通知失败: %s', str(e))

    async def send_common_door_id_to_device(self, device_id: str):
        """发送共用门id给设备."""
        try:            
            # 获取户型列表
            apartments_store = Store(self.hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments_data = await apartments_store.async_load()
            
            if not apartments_data or 'apartments' not in apartments_data:
                return
            
            common_doors = set()  # 用于存储共用门的ID
            
            # 遍历所有户型
            for apartment in apartments_data['apartments']:
                apartment_id = apartment['id']
                
                # 加载户型的 sender_data
                sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
                sender_data = await sender_store.async_load()
                
                if not sender_data:
                    continue
                    
                # 如果只有一个设备，跳过这个户型
                if len(sender_data) <= 1:
                    continue
                
                # 如果当前设备不在这个户型中，跳过
                if device_id not in sender_data:
                    continue
                
                # 获取当前设备的区域数据
                current_device_regions = sender_data[device_id].get('region', [])
                
                # 遍历其他设备
                for other_device_id, other_device_data in sender_data.items():
                    if other_device_id == device_id:
                        continue
                        
                    other_device_regions = other_device_data.get('region', [])
                    
                    # 查找共用门
                    for region in current_device_regions:
                        if region.get('area-attribute') == 2:  # 门区域
                            area_id = region.get('area-id')
                            # 在其他设备的区域中查找相同的门
                            for other_region in other_device_regions:
                                if (other_region.get('area-attribute') == 2 and 
                                    other_region.get('area-id') == area_id):
                                    common_doors.add(area_id)
            
            # 如果找到共用门，发送到设备
            if common_doors:
                for door_id in common_doors:
                    sub_data = {"msgId": 19, "siid": 13, "aiid": 5, "in": [{"1": door_id}]}
                    await self._sender_method_data(device_id, sub_data)
            else:
                _LOGGER.debug("未找到共用门: device_id=%s", device_id)
                
        except Exception as e:
            _LOGGER.debug("发送共用门ID失败: %s", str(e))

    async def delete_apart_device(self, device_id: str):
        """删除户型数据中包含指定device_id的数据.
        
        Args:
            device_id: 要删除的设备ID
        """
        try:
            
            # 获取户型列表
            apartments_store = Store(self.hass, STORAGE_VERSION, APARTMENTS_STORAGE_KEY)
            apartments_data = await apartments_store.async_load()
            
            if not apartments_data or 'apartments' not in apartments_data:
                return
                
            # 遍历所有户型
            for apartment in apartments_data['apartments']:
                apartment_id = apartment['id']
                
                # 加载户型数据
                apartment_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}")
                apartment_data = await apartment_store.async_load()
                
                if apartment_data:
                    modified = False
                    
                    # 删除设备列表中的设备
                    if 'devices' in apartment_data:
                        original_length = len(apartment_data['devices'])
                        apartment_data['devices'] = [
                            device for device in apartment_data['devices'] 
                            if device.get('id') != device_id
                        ]
                        if len(apartment_data['devices']) < original_length:
                            modified = True
                    # 如果数据被修改，保存更新后的户型数据
                    if modified:
                        await apartment_store.async_save(apartment_data)
                
                # 加载并更新 sender_data
                sender_store = Store(self.hass, STORAGE_VERSION, f"{APARTMENT_DATA_KEY}_{apartment_id}_sender")
                sender_data = await sender_store.async_load()
                
                if sender_data and device_id in sender_data:
                    # 删除设备数据
                    del sender_data[device_id]
                    await sender_store.async_save(sender_data)            
        except Exception as e:
            _LOGGER.debug("删除户型数据中的设备失败: %s", str(e))
        
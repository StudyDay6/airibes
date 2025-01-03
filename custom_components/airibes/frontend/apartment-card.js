import { STICKER_TYPES, AREA_TYPES } from './constants.js';
import { getTranslationValue } from './translations.js';
class ApartmentCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._initialized = false;
        this.personPositions = new Map();
        this.currentApartmentId = 1; // 当前选中的户型ID
        this._unsubs = []; // 初始化 _unsubs 数组
    }

    setConfig(config) {
        this.config = config;
    }

    getCardSize() {
        return 3;
    }

    set hass(hass) {
        this._hass = hass;
        if (!this._initialized) {
            this._initialized = true;
            this.initializeCard();
        }
    }

    async initializeCard() {
        try {
            await this.loadStyles();
            this.render();
            await this.loadData();
            this.initCanvas();
        } catch (error) {
            console.error('初始化卡片失败:', error);
        }
    }

    async loadStyles() {
        const response = await fetch('/frontend_static/apartment.css');
        const style = await response.text();
        this.styles = style;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                ${this.styles}
                /* 添加卡片特定样式 */
                ha-card {
                    height: 100%;
                    overflow: hidden;
                }
                .card-content {
                    height: 100%;
                    width: calc(100% - 32px);
                }
                .apartment-view {
                    width: 100%;
                    height: 100%;
                    min-height: 300px;
                    position: relative;
                }
                canvas {
                    width: 100%;
                    height: 100%;
                    position: absolute;
                    top: 0;
                    left: 0;
                }
                .stickers-container {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                }
                .sticker-element {
                    position: absolute;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }
                .sticker-content {
                    width: 100%;
                    height: 100%;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .sticker-content svg {
                    width: 100%;
                    height: 100%;
                }
                .device-element {
                    position: absolute;
                    width: 12px;  /* 增加容器大小 */
                    height: 12px;
                    transform-origin: center center;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    pointer-events: auto;
                }

                .device-content {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: auto;
                }

                .device-content ha-icon {
                    width: 12px;    /* 控制图标大小 */
                    height: 12px;
                    --mdc-icon-size: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: auto;
                }
            </style>
            <ha-card>
                <div class="card-content">
                    <div class="apartment-view">
                        <canvas id="apartmentCanvas"></canvas>
                        <div class="stickers-container"></div>
                    </div>
                </div>
            </ha-card>
        `;
    }

    async loadData() {
        try {
            if (!this._hass) {
                console.warn('hass 对象未初始化');
                return;
            }

            // 先加载户型列表
            const apartmentsResponse = await this._hass.callWS({
                type: 'airibes/get_apartments'
            });
            
            let currentApartmentId = 1; // 默认使用户型一
            
            if (apartmentsResponse && apartmentsResponse.apartments) {
                const apartments = apartmentsResponse.apartments;
                if (apartments.length > 0) {
                    currentApartmentId = apartments[0].id;
                }
            }

            // 加载指定户型的数据
            const response = await this._hass.callWS({
                type: 'airibes/load_apartment_data',
                apartment_id: currentApartmentId
            });

            if (response && response.data) {
                this.apartmentData = response.data;
                // 重新绘制
                if (this.canvas && this.ctx) {
                    this.drawApartment();
                }
            }
        } catch (error) {
            console.error('加载户型数据失败:', error);
        }
    }

    initCanvas() {
        this.canvas = this.shadowRoot.getElementById('apartmentCanvas');
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        if (!container) return;

        this.updateCanvasSize();
        this.ctx = this.canvas.getContext('2d');

        // 添加窗口大小变化监听
        window.addEventListener('resize', () => {
            this.updateCanvasSize();
        });

        // 添加容器大小变化监听
        const resizeObserver = new ResizeObserver(() => {
            this.updateCanvasSize();
        });
        resizeObserver.observe(container);
    }

    updateCanvasSize() {
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;

        if (this.apartmentData) {
            this.drawApartment();
        }
    }

    drawApartment() {
        if (!this.canvas || !this.ctx || !this.apartmentData) return;

        const ctx = this.ctx;
        const container = this.canvas.parentElement;
        
        // 清除画布
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 计算布局边界
        const bounds = this.calculateBounds();
        if (!bounds) return;

        // 计算缩放比例
        const padding = 40;
        const scaleX = (container.clientWidth - padding * 2) / bounds.width;
        const scaleY = (container.clientHeight - padding * 2) / bounds.height;
        const scale = Math.min(scaleX, scaleY);

        // 计算居中偏移
        const offsetX = (container.clientWidth - bounds.width * scale) / 2;
        const offsetY = (container.clientHeight - bounds.height * scale) / 2;

        // 应用变换
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);
        ctx.translate(-bounds.minX, -bounds.minY);

        // 绘制房间
        this.drawRooms(ctx);
        // 绘制区域 （卡片内部绘制区域）
        // this.drawAreas(ctx);
        // 绘制人员位置
        this.drawPersonPositions(ctx);

        ctx.restore();

        // 更新贴纸
        this.updateStickers(scale, offsetX, offsetY, bounds);
        // 绘制设备
        this.drawDevices(ctx);
    }

    calculateBounds() {
        const { rooms = [], areas = [], stickers = [], devices = [] } = this.apartmentData;
        if (!rooms.length && !areas.length && !stickers.length && !devices.length) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // 计算所有元素的边界
        [...rooms, ...areas, ...stickers, ...devices].forEach(element => {
            const left = element.left;
            const top = element.top;
            const right = left + (element.width || 0);
            const bottom = top + (element.height || 0);

            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, right);
            maxY = Math.max(maxY, bottom);
        });

        return {
            minX,
            minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    drawRooms(ctx) {
        const { rooms = [], stickers = [] } = this.apartmentData;
        
        // 遍历每个房间
        rooms.forEach(room => {
          // 检查房间内的灯具状态
          const roomLights = this.apartmentData.devices.filter(device => {
            // 只检查灯具设备
            if (device.type !== 'light') return false;
            
            // 检查设备是否在房间内
            const deviceCenter = {
              x: device.left + 5, // 设备宽度为10cm,取中心点
              y: device.top + 5
            };
            return this.isPointInRoom(deviceCenter, room);
          });

          // 根据灯具状态决定房间颜色
          let roomColor;
          if (roomLights.length > 0) {
            // 检查是否有开启的灯
            const hasLightOn = roomLights.some(light => {
              const entityId = light.id;
              return this._hass.states[entityId]?.state === 'on';
            });
            
            if (hasLightOn) {
              roomColor = '#203B5544'; // 亮色
            } else {
              roomColor = '#203B55'; // 暗色
            }
          } else {
            roomColor = '#203B55'; // 默认颜色(没有灯具的房间)
          }

          // 绘制房间地板
          ctx.fillStyle = roomColor;
          ctx.fillRect(room.left, room.top, room.width, room.height);
        });

        // 绘制墙壁
        ctx.strokeStyle = '#64758B';  // 深色墙壁
        ctx.lineWidth = 8;  // 加粗的墙
        ctx.lineJoin = 'miter';  // 尖角连接

        // 遍历每个房间
        rooms.forEach(room => {
            ctx.save();
            
            // 创建新路径用于绘制房间墙壁
            ctx.beginPath();
            ctx.rect(room.left, room.top, room.width, room.height);
            ctx.stroke();

            // 找出房间墙上的所有门
            const doors = stickers.filter(sticker => 
                sticker.type === 'door' && 
                this.isDoorOnRoomWall(sticker, room)
            );

            // 为每个门建门洞
            doors.forEach(door => {
                if (!door.isValid) return; // 如果门是无效的则跳过不创建门洞

                const doorWidth = door.height;  // 门洞宽度（厘米）
                const wallThickness = 8;  // 墙厚度（像素）

                // 使用地板颜色擦除门洞位置的墙
                ctx.strokeStyle = '#203B55';  // 使用地板颜色
                ctx.lineWidth = wallThickness + 2;  // 稍微比墙宽一点，确保完全覆盖

                // 计算门的中心点
                const doorCenterX = door.left + door.width / 2;
                const doorCenterY = door.top + door.height / 2;

                // 判断门在哪面墙上
                const onLeftWall = Math.abs(doorCenterX - room.left) < 5;
                const onRightWall = Math.abs(doorCenterX - (room.left + room.width)) < 5;
                const onTopWall = Math.abs(doorCenterY - room.top) < 5;
                const onBottomWall = Math.abs(doorCenterY - (room.top + room.height)) < 5;

                ctx.beginPath();
                if (onLeftWall || onRightWall) {
                    // 垂直墙上的门
                    const x = onLeftWall ? room.left : room.left + room.width;
                    ctx.moveTo(x, doorCenterY - doorWidth/2);
                    ctx.lineTo(x, doorCenterY + doorWidth/2);
                } else if (onTopWall || onBottomWall) {
                    // 水平墙上的门
                    const y = onTopWall ? room.top : room.top + room.height;
                    ctx.moveTo(doorCenterX - doorWidth/2, y);
                    ctx.lineTo(doorCenterX + doorWidth/2, y);
                }
                ctx.stroke();
            });

            ctx.restore();
        });

        // 处理相邻墙壁
        rooms.forEach((room, i) => {
            rooms.slice(i + 1).forEach(otherRoom => {
                // 检查垂直墙
                if (Math.abs(room.left - (otherRoom.left + otherRoom.width)) < 1 ||
                    Math.abs(otherRoom.left - (room.left + room.width)) < 1) {
                    const x = Math.min(room.left + room.width, otherRoom.left + otherRoom.width);
                    ctx.strokeStyle = '#64758B';
                    ctx.lineWidth = 4;  // 相邻墙减半
                    ctx.beginPath();
                    ctx.moveTo(x, Math.min(room.top, otherRoom.top));
                    ctx.lineTo(x, Math.max(room.top + room.height, otherRoom.top + otherRoom.height));
                    ctx.stroke();
                }

                // 检查水平墙
                if (Math.abs(room.top - (otherRoom.top + otherRoom.height)) < 1 ||
                    Math.abs(otherRoom.top - (room.top + room.height)) < 1) {
                    const y = Math.min(room.top + room.height, otherRoom.top + otherRoom.height);
                    ctx.strokeStyle = '#64758B';
                    ctx.lineWidth = 4;  // 相邻墙减半
                    ctx.beginPath();
                    ctx.moveTo(Math.min(room.left, otherRoom.left), y);
                    ctx.lineTo(Math.max(room.left + room.width, otherRoom.left + otherRoom.width), y);
                    ctx.stroke();
                }
            });
        });
    }

    isPointInRoom(point, room) {
        return point.x >= room.left && 
               point.x <= (room.left + room.width) &&
               point.y >= room.top && 
               point.y <= (room.top + room.height);
    }

    isDoorOnRoomWall(door, room) {
        const doorCenter = {
            x: door.left + door.width / 2,
            y: door.top + door.height / 2
        };

        const tolerance = 5;  // 容差值

        // 检查是否在房间的四面墙上
        const onLeftWall = Math.abs(doorCenter.x - room.left) < tolerance;
        const onRightWall = Math.abs(doorCenter.x - (room.left + room.width)) < tolerance;
        const onTopWall = Math.abs(doorCenter.y - room.top) < tolerance;
        const onBottomWall = Math.abs(doorCenter.y - (room.top + room.height)) < tolerance;

        // 检查是否在房间范围
        const inHorizontalRange = doorCenter.x >= room.left && doorCenter.x <= room.left + room.width;
        const inVerticalRange = doorCenter.y >= room.top && doorCenter.y <= room.top + room.height;

        return ((onLeftWall || onRightWall) && inVerticalRange) ||
               ((onTopWall || onBottomWall) && inHorizontalRange);
    }

    drawAreas(ctx) {
        const { areas = [] } = this.apartmentData;
        areas.forEach(area => {
            ctx.fillStyle = `${area.color}33`;
            ctx.strokeStyle = area.color;
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.rect(area.left, area.top, area.width, area.height);
            ctx.fill();
            ctx.stroke();

            // 绘制区域名称
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(area.name, area.left + area.width / 2, area.top + area.height / 2);
        });
    }

    drawDevices(ctx) {
        const deviceContainer = this.shadowRoot.querySelector('.stickers-container');
        if (!deviceContainer) return;

        // 计算布局边界和缩放比例
        const bounds = this.calculateBounds();
        if (!bounds) return;

        const container = this.canvas.parentElement;
        const padding = 40;
        const scaleX = (container.clientWidth - padding * 2) / bounds.width;
        const scaleY = (container.clientHeight - padding * 2) / bounds.height;
        const scale = Math.min(scaleX, scaleY);

        // 计算居中偏移
        const offsetX = (container.clientWidth - bounds.width * scale) / 2;
        const offsetY = (container.clientHeight - bounds.height * scale) / 2;

        // 清除现有的设备元素
        const existingDevices = deviceContainer.querySelectorAll('.device-element');
        existingDevices.forEach(device => device.remove());

        // 绘制设备
        if (this.apartmentData && this.apartmentData.devices) {
            this.apartmentData.devices.forEach(device => {
                if (device.visible === false) return;

                // 先检查设备实体是否可用
                let entityId;
                if (device.type === 'radar') {
                    entityId = `sensor.airibes_radar_${device.id.toLowerCase()}`;
                } else {
                    entityId = device.id;
                }
                
                // 如果实体不存在，跳过该设备
                if (!this._hass.states[entityId]) {
                    console.log(`设备 ${device.id} 的实体 ${entityId} 不可用，跳过渲染`);
                    return;
                }
                
                // 检查设备是否在任何房间内
                const isInAnyRoom = this.apartmentData.rooms.some(room => 
                    this.isElementInRoom({
                        left: device.left,
                        top: device.top,
                        width: 10, // 设备默认宽度10cm
                        height: 10 // 设备默认高度10cm
                    }, room)
                );
                if (!isInAnyRoom) return;

                // 计算设备位置
                const x = (device.left - bounds.minX) * scale + offsetX;
                const y = (device.top - bounds.minY) * scale + offsetY;

                // 创建设备元素
                this.createDeviceElement(device, x, y, scale);
            });
        }
    }

    calculateBounds() {
        const { rooms = [], areas = [], stickers = [], devices = [] } = this.apartmentData;
        if (!rooms.length && !areas.length && !stickers.length && !devices.length) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        // 计算所有元素的边
        [...rooms, ...areas, ...stickers, ...devices].forEach(element => {
            const left = element.left;
            const top = element.top;
            const right = left + (element.width || 0);
            const bottom = top + (element.height || 0);

            minX = Math.min(minX, left);
            minY = Math.min(minY, top);
            maxX = Math.max(maxX, right);
            maxY = Math.max(maxY, bottom);
        });

        return {
            minX,
            minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    createDeviceElement(device, x, y, scale) {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-element';
        
        // 调整位置，考虑元素大小进行居中偏移
        deviceElement.style.left = `${x - 6}px`;  // 偏移半个元素宽度
        deviceElement.style.top = `${y - 6}px`;   // 偏移半个元素高度
        
        if (device.rotation) {
            deviceElement.style.transform = `rotate(${device.rotation}deg)`;
        }

        // 获取设备状态和颜色
        let state = 'unavailable';
        let iconColor = 'var(--disabled-text-color)';

        // 根据设备类型构造 entity_id
        let entityId;
        if (device.type === 'radar') {
          entityId = `sensor.airibes_radar_${device.id.toLowerCase()}`;
        } else {
          entityId = device.id;
        }

        // 获取设备状态
        if (entityId && this._hass.states[entityId]) {
          state = this._hass.states[entityId].state;
          // 根据设备类型和状态设置颜色
          switch (device.type) {
            case 'radar':
              if (state === getTranslationValue('online', this._hass?.language || 'en')) {
                iconColor = 'var(--success-color)'; // 在线/有人时绿色
              } else {
                iconColor = 'var(--primary-color)'; // 在线/无人时蓝色
              }
              break;
              
            case 'light':
              if (state === 'on') {
                iconColor = 'var(--warning-color)'; // 开启时黄色
              } else if (state === 'off') {
                iconColor = 'var(--primary-color)'; // 关闭时蓝色
              }
              break;
              
            case 'climate':
              if (state === 'on' || state === 'heat' || state === 'cool') {
                iconColor = 'var(--info-color)'; // 运行时蓝色
              } else if (state === 'off') {
                iconColor = 'var(--primary-color)'; // 关闭时默认色
              }
              break;
          }
        }

        // 设置设备图标
        const icon = device.type === 'radar' ? 'mdi:radar' : 
                     device.type === 'light' ? 'mdi:lightbulb' : 
                     device.type === 'climate' ? 'mdi:air-conditioner' : 'mdi:help-circle';

        deviceElement.innerHTML = `
            <div class="device-content">
                <ha-icon 
                    icon="${icon}" 
                    style="color: ${iconColor};" 
                    data-device-id="${device.id}"
                ></ha-icon>
            </div>
        `;

        // 添加点击事件处理 <span class="device-name">${device.id.slice(-4)}</span>
        deviceElement.addEventListener('click', () => {
          console.log('deviceElement', deviceElement);
          let entityId;
          if (device.type === 'radar') {
            entityId = `sensor.airibes_radar_${device.id.toLowerCase()}`;
          } else {
            entityId = device.id;
          }

          const event = new CustomEvent('hass-more-info', {
            detail: { entityId: entityId },
            bubbles: true,
            composed: true
          });
          this.dispatchEvent(event);
        });

        const deviceContainer = this.shadowRoot.querySelector('.stickers-container');
        deviceContainer.appendChild(deviceElement);
    }

    drawPersonPositions(ctx) {
        // 遍历所有设备的人员位置
        this.personPositions.forEach((positions, deviceId) => {
            positions.forEach(pos => {
                ctx.save();
                
                // 设置人员标记样式 - 使用绿色小圆点
                ctx.fillStyle = '#4CAF50';  // 使用绿色
                
                // 绘制小圆点
                const radius = 4;  // 减小圆点半径
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
            });
        });
    }

    updateStickers(scale, offsetX, offsetY, bounds) {
        const stickersContainer = this.shadowRoot.querySelector('.stickers-container');
        if (!stickersContainer) return;
        
        // 只清除贴纸元素，保留其他元素（如设备）
        const existingStickers = stickersContainer.querySelectorAll('.sticker-element');
        existingStickers.forEach(sticker => sticker.remove());

        const { stickers = [], rooms = [] } = this.apartmentData;
        stickers.forEach(sticker => {
          // 跳过门类型贴纸
          if (sticker.type === 'door') return;

          // 检查贴纸是否在任何房间内
          const isInAnyRoom = rooms.some(room => 
            this.isElementInRoom({
              left: sticker.left,
              top: sticker.top,
              width: sticker.width,
              height: sticker.height
            }, room)
          );

          if (!isInAnyRoom) return;

          this.createStickerElement(sticker, scale, offsetX, offsetY, bounds);
        });
    }

    isElementInRoom(element, room) {
        // 获取元素中心点
        const elementCenterX = element.left + (element.width || 0) / 2;
        const elementCenterY = element.top + (element.height || 0) / 2;

        // 检查中心点是否在房间内
        return elementCenterX >= room.left && 
               elementCenterX <= (room.left + room.width) &&
               elementCenterY >= room.top && 
               elementCenterY <= (room.top + room.height);
    }

    createStickerElement(sticker, scale, offsetX, offsetY, bounds) {
        const stickerElement = document.createElement('div');
        stickerElement.className = 'sticker-element';
        
        // 计算位置（考虑边界和偏移）
        const x = (sticker.left - bounds.minX) * scale + offsetX;
        const y = (sticker.top - bounds.minY) * scale + offsetY;
        const width = sticker.width * scale;
        const height = sticker.height * scale;

        stickerElement.style.position = 'absolute';
        stickerElement.style.left = `${x}px`;
        stickerElement.style.top = `${y}px`;
        stickerElement.style.width = `${width}px`;
        stickerElement.style.height = `${height}px`;

        if (sticker.rotation) {
          stickerElement.style.transform = `rotate(${sticker.rotation}deg)`;
        }

        // 获取贴纸SVG内容
        const stickerInfo = STICKER_TYPES[sticker.type];
        if (stickerInfo) {
          stickerElement.innerHTML = `
            <div class="sticker-content">
              ${stickerInfo.getSvg()}
            </div>
          `;
        }

        const stickersContainer = this.shadowRoot.querySelector('.stickers-container');
        stickersContainer.appendChild(stickerElement);
    }

    async connectedCallback() {
        // 发送户型视图可见事件
        if (this._hass) {
            await this._hass.callWS({
                type: 'airibes/set_apartment_view_visible',
                visible: true,
                apartment_id: this.currentApartmentId,
            });

            // 订阅人员位置更新事件
            this._personPositionHandler = (event) => this._handlePersonPositionsUpdate(event);
            const unsub = this._hass.connection.subscribeEvents(
                this._personPositionHandler,
                'airibes_person_positions_update'
            );
            this._unsubs.push(unsub);
        }
    }

    disconnectedCallback() {
        // 清理事件订阅
        if (this._unsubs) {
            while (this._unsubs.length) {
                const unsub = this._unsubs.pop();
                if (typeof unsub === 'function') {
                    unsub();
                }
            }
        }

        // 通知后端户型视图不可见
        if (this._hass) {
            this._hass.callWS({
                type: 'airibes/set_apartment_view_visible',
                visible: false,
                apartment_id: this.currentApartmentId || 1
            }).catch(error => {
                console.error('通知后端户型视图不可见失败:', error);
            });
        }
    }

    // 添加人员位置更新处理方法
    _handlePersonPositionsUpdate(event) {
        const { device_id, positions } = event.data;
        this.personPositions.set(device_id, positions);
        // 重新绘制以更新人员位置
        this.drawApartment();
    }
}

// 等待 HA 核心组件加载完成后再注册卡片
customElements.whenDefined('ha-card').then(() => {
    if (!customElements.get('apartment-card')) {
        customElements.define('apartment-card', ApartmentCard);
        console.log('注册户型卡片组件成功');
    }
    
    // 注册到 customCards
    window.customCards = window.customCards || [];
    if (!window.customCards.find(card => card.type === "apartment-card")) {
        window.customCards.push({
            type: "apartment-card",
            name: "apartment",
            description: "Monitor the presence of no one in the home"
        });
        console.log('添加户型卡片到 customCards 成功');
    }
});

// 导出卡片类以供其他模块使用
export { ApartmentCard }; 
import { STICKER_TYPES, AREA_TYPES } from './constants.js';

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
                    width: 100%;
                    padding: 16px;
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
        // 绘制区域
        this.drawAreas(ctx);
        // 绘制设备
        this.drawDevices(ctx);
        // 绘制人员位置
        this.drawPersonPositions(ctx);

        ctx.restore();

        // 更新贴纸
        this.updateStickers(scale, offsetX, offsetY, bounds);
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
        const { rooms = [] } = this.apartmentData;
        rooms.forEach(room => {
            ctx.fillStyle = room.color || '#ffffff';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.rect(room.left, room.top, room.width, room.height);
            ctx.fill();
            ctx.stroke();

            // 绘制房间名称
            ctx.fillStyle = '#000000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(room.name, room.left + room.width / 2, room.top + room.height / 2);
        });
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
        const { devices = [] } = this.apartmentData;
        devices.forEach(device => {
            ctx.save();
            ctx.translate(device.left, device.top);
            if (device.rotation) {
                ctx.rotate(device.rotation * Math.PI / 180);
            }

            // 获取设备状态
            const entityId = `sensor.airibes_radar_${device.id}`;
            const state = this._hass.states[entityId];
            const isOnline = state?.state === "在线";

            // 根据状态设置颜色
            ctx.fillStyle = isOnline ? '#4CAF50' : '#999';

            // 绘制设备图标
            ctx.beginPath();
            ctx.arc(15, 15, 15, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });
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
        stickersContainer.innerHTML = ''; // 清除现有贴纸

        const { stickers = [] } = this.apartmentData;
        stickers.forEach(sticker => {
            const stickerInfo = STICKER_TYPES[sticker.type];
            if (!stickerInfo) return;

            // 计算贴纸位置和大小
            const x = (sticker.left - bounds.minX) * scale + offsetX;
            const y = (sticker.top - bounds.minY) * scale + offsetY;
            const width = sticker.width * scale;
            const height = sticker.height * scale;

            // 创建贴纸元素
            const stickerElement = document.createElement('div');
            stickerElement.className = 'sticker-element';
            stickerElement.style.cssText = `
                left: ${x}px;
                top: ${y}px;
                width: ${width}px;
                height: ${height}px;
                transform: rotate(${sticker.rotation || 0}deg);
            `;

            // 添加贴纸内容
            stickerElement.innerHTML = `
                <div class="sticker-content">
                    ${stickerInfo.getSvg()}
                </div>
            `;

            stickersContainer.appendChild(stickerElement);
        });
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
            name: "户型卡片",
            description: "显示户型布局的卡片"
        });
        console.log('添加户型卡片到 customCards 成功');
    }
});

// 导出卡片类以供其他模块使用
export { ApartmentCard }; 
import { STICKER_TYPES, AREA_TYPES } from './constants.js';
export class PreviewDialog extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.scale = 1;
    }

    set data(value) {
        this._data = value;
        console.log(this._data);
        this.updatePreview();
    }

    async connectedCallback() {
        await this.loadStyles();
        this.render();
        this.initializeCanvas();
    }

    async loadStyles() {
        const style = `
            :host {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            }

            .preview-dialog {
                background: var(--card-background-color);
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
                width: 98%;
                max-width: 98vw;
                height: 98vh;
                display: flex;
                overflow: hidden;
            }

            .dialog-content {
                flex: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                background: var(--card-background-color);
                overflow: hidden;
                padding: 16px;
                padding-bottom: 32px;
            }

            .preview-canvas-container {
                position: relative;
                width: 100%;
                height: calc(100% - 16px);
                display: flex;
                justify-content: center;
                align-items: center;
                background: #e4eafe;
                border-radius: 4px;
            }

            canvas {
                display: block;
                background: #E8EAF6;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                border-radius: 8px;
            }
        `;
        this.styles = style;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>${this.styles}</style>
            <div class="preview-dialog">
                <div class="dialog-content">
                    <div class="preview-canvas-container">
                        <canvas id="previewCanvas"></canvas>
                        <div class="stickers-container"></div>
                    </div>
                </div>
            </div>
        `;

        // 添加样式
        const additionalStyles = document.createElement('style');
        additionalStyles.textContent = `
            .preview-canvas-container {
                position: relative;
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
                width: 24px;
                height: 24px;
                transform-origin: center;
            }

            .sticker-content {
                width: 100%;
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                color: #795548;
            }
        `;
        this.shadowRoot.appendChild(additionalStyles);

        // 点击背景关闭
        this.addEventListener('click', (e) => {
            if (e.target === this) {
                this.remove();
            }
        });
    }

    initializeCanvas() {
        this.canvas = this.shadowRoot.querySelector('#previewCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.updateCanvasSize();
    }

    updateCanvasSize() {
        if (!this.canvas) return;

        const container = this.shadowRoot.querySelector('.preview-canvas-container');
        const content = this.shadowRoot.querySelector('.dialog-content');
        
        // 获取内容区域的尺寸，考虑底部空白
        const contentWidth = content.offsetWidth;
        const contentHeight = content.offsetHeight - 16;

        // 计算户型图的边界
        const bounds = this.calculateBounds();
        if (!bounds) {
            this.canvas.width = contentWidth;
            this.canvas.height = contentHeight;
            return;
        }

        // 计算缩放比例，使户型图最大化显示
        const scaleX = (contentWidth - 80) / bounds.width;  // 左右各留40px边距
        const scaleY = (contentHeight - 80) / bounds.height; // 上下各留40px边距
        this.scale = Math.min(scaleX, scaleY);

        // 设置画布尺寸
        this.canvas.width = contentWidth;
        this.canvas.height = contentHeight;

        this.bounds = bounds;
        this.updatePreview();
    }

    updatePreview() {
        if (!this._data || !this.ctx || !this.bounds) return;

        const ctx = this.ctx;
        const { rooms = [], areas = [], stickers = [], devices = [] } = this._data;

        // 清空画布
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 计算居中偏移
        const offsetX = (this.canvas.width - this.bounds.width * this.scale) / 2;
        const offsetY = (this.canvas.height - this.bounds.height * this.scale) / 2;

        // 应用变换
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.translate(-this.bounds.minX * this.scale, -this.bounds.minY * this.scale);

        // 按照顺序绘制
        this.drawRooms(ctx);  // 先绘制房间（包括墙和门洞）
        this.drawAreas(ctx);  // 再绘制区域
        this.drawStickers(ctx);  // 绘制房间内的贴纸

        ctx.restore();
    }

    calculateBounds() {
        if (!this._data) return null;

        const { rooms = [], areas = [], stickers = [], devices = [] } = this._data;
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
            height: maxY - minY,
            maxX,
            maxY
        };
    }

    drawAreas(ctx) {
        if (this.showAreas === false) return;

        const { areas = [], rooms = [] } = this._data;
        areas.forEach(area => {
            // 检查区域是否在任何房间内且visible为true
            const isInAnyRoom = rooms.some(room => this.isElementInRoom(area, room));
            if (!isInAnyRoom || area.visible === false || area.isValid === false) return;

            ctx.fillStyle = `${area.color}33`;
            ctx.strokeStyle = area.color;
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.rect(
                area.left * this.scale,
                area.top * this.scale,
                area.width * this.scale,
                area.height * this.scale
            );
            ctx.fill();
            ctx.stroke();

            // 绘制区域名称
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                area.name,
                (area.left + area.width/2) * this.scale,
                (area.top + area.height/2) * this.scale
            );
        });
    }

    // 添加辅助方法
    isElementInRoom(element, room) {
        const elementCenter = {
            x: element.left + element.width/2,
            y: element.top + element.height/2
        };
        
        return elementCenter.x >= room.left &&
               elementCenter.x <= room.left + room.width &&
               elementCenter.y >= room.top &&
               elementCenter.y <= room.top + room.height;
    }


    drawRooms(ctx) {
        const { rooms = [], stickers = [] } = this._data;
        
        // 先绘制所有房间的地板
        rooms.forEach(room => {
            // 检查房间内的灯具状态
            const roomLights = this._data.devices.filter(device => {
                if (device.type !== 'light') return false;
                
                const deviceCenter = {
                    x: device.left + 5,
                    y: device.top + 5
                };
                return deviceCenter.x >= room.left && 
                       deviceCenter.x <= room.left + room.width &&
                       deviceCenter.y >= room.top &&
                       deviceCenter.y <= room.top + room.height;
            });

            // 根据灯具状态决定房间颜色
            let roomColor;
            if (roomLights.length > 0) {
                const hasLightOn = roomLights.some(light => {
                    const entityId = light.id;
                    return this._data.states?.[entityId]?.state === 'on';
                });
                
                roomColor = hasLightOn ? '#F5F5F5' : '#E0E0E0';
            } else {
                roomColor = '#E8EAF6';
            }

            // 绘制房间地板
            ctx.fillStyle = roomColor;
            ctx.fillRect(
                room.left * this.scale, 
                room.top * this.scale, 
                room.width * this.scale, 
                room.height * this.scale
            );
        });

        // 绘制所有墙壁（包括相邻墙）
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'miter';

        // 先绘制所有房间的主墙
        rooms.forEach(room => {
            ctx.beginPath();
            ctx.rect(
                room.left * this.scale, 
                room.top * this.scale, 
                room.width * this.scale, 
                room.height * this.scale
            );
            ctx.stroke();
        });

        // 处理相邻墙（用较细的线重绘）
        rooms.forEach((room, i) => {
            rooms.slice(i + 1).forEach(otherRoom => {
                // 检查垂直墙
                if (Math.abs(room.left - (otherRoom.left + otherRoom.width)) < 1 ||
                    Math.abs(otherRoom.left - (room.left + room.width)) < 1) {
                    const x = Math.min(room.left + room.width, otherRoom.left + otherRoom.width);
                    ctx.strokeStyle = '#333333';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(x * this.scale, Math.min(room.top, otherRoom.top) * this.scale);
                    ctx.lineTo(x * this.scale, Math.max(room.top + room.height, otherRoom.top + otherRoom.height) * this.scale);
                    ctx.stroke();
                }

                // 检查水平墙
                if (Math.abs(room.top - (otherRoom.top + otherRoom.height)) < 1 ||
                    Math.abs(otherRoom.top - (room.top + room.height)) < 1) {
                    const y = Math.min(room.top + room.height, otherRoom.top + otherRoom.height);
                    ctx.strokeStyle = '#333333';
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(Math.min(room.left, otherRoom.left) * this.scale, y * this.scale);
                    ctx.lineTo(Math.max(room.left + room.width, otherRoom.left + otherRoom.width) * this.scale, y * this.scale);
                    ctx.stroke();
                }
            });
        });

        // 最后处理门洞
        rooms.forEach(room => {
            // 找出房间墙上的所有门
            const doors = stickers.filter(sticker => 
                sticker.type === 'door' && 
                this.isDoorOnRoomWall(sticker, room)  // 使用与 my-panel.js 相同的检测方法
            );

            // 为每个门创建门洞
            doors.forEach(door => {
                if (!door.isValid) return; // 如果门是效的则跳过不创建门洞

                const doorWidth = door.height;  // 门洞宽度（厘米）
                const wallThickness = 8;  // 墙厚度（像素）

                // 使用地板颜色擦除门洞位置的墙
                ctx.strokeStyle = '#E8EAF6';  // 使用地板颜色
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
                    ctx.moveTo(x * this.scale, (doorCenterY - doorWidth/2) * this.scale);
                    ctx.lineTo(x * this.scale, (doorCenterY + doorWidth/2) * this.scale);
                } else if (onTopWall || onBottomWall) {
                    // 水平墙上的门
                    const y = onTopWall ? room.top : room.top + room.height;
                    ctx.moveTo((doorCenterX - doorWidth/2) * this.scale, y * this.scale);
                    ctx.lineTo((doorCenterX + doorWidth/2) * this.scale, y * this.scale);
                }
                ctx.stroke();
            });
        });

        // 最后绘制房间名称
        rooms.forEach(room => {
            ctx.fillStyle = '#000000';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                room.name,
                (room.left + room.width/2) * this.scale,
                (room.top + room.height/2) * this.scale
            );
        });
    }

    // 添加与 my-panel.js 相同的门检测方法
    isDoorOnRoomWall(door, room) {
        // 获取门的中心点
        const doorCenter = {
            x: door.left + door.width/2,
            y: door.top + door.height/2
        };

        // 定义墙的容差范围
        const tolerance = 5;

        // 检查是否在上下墙
        const onHorizontalWall =
            Math.abs(doorCenter.y - room.top) < tolerance ||
            Math.abs(doorCenter.y - (room.top + room.height)) < tolerance;

        // 检查是否在左右墙
        const onVerticalWall =
            Math.abs(doorCenter.x - room.left) < tolerance ||
            Math.abs(doorCenter.x - (room.left + room.width)) < tolerance;

        // 检查是否在房间范围内
        const inHorizontalRange = doorCenter.x >= room.left && doorCenter.x <= room.left + room.width;
        const inVerticalRange = doorCenter.y >= room.top && doorCenter.y <= room.top + room.height;

        // 门必须在墙上且在房间范围内
        return ((onVerticalWall && inVerticalRange) || (onHorizontalWall && inHorizontalRange));
    }

    drawStickers() {
        const { stickers = [], rooms = [] } = this._data;
        const stickersContainer = this.shadowRoot.querySelector('.stickers-container');
        
        // 清空现有贴纸
        stickersContainer.innerHTML = '';

        // 计算画布居中偏移
        const offsetX = (this.canvas.width - this.bounds.width * this.scale) / 2;
        const offsetY = (this.canvas.height - this.bounds.height * this.scale) / 2;

        // 过滤出在房间内的贴纸，但门贴纸只保留在墙上的
        const validStickers = stickers.filter(sticker => {
            if (sticker.type === 'door') return false; // 门已经在drawRooms中处理过了
            
            // 检查贴纸是否在任何房间内
            return rooms.some(room => this.isElementInRoom(sticker, room));
        });

        // 创建贴纸元素
        validStickers.forEach(sticker => {
            const stickerInfo = STICKER_TYPES[sticker.type];
            if (!stickerInfo) return;

            const stickerElement = document.createElement('div');
            stickerElement.className = 'sticker-element';
            
            // 计算位置（考虑边界、偏移和缩放）
            const x = (sticker.left - this.bounds.minX) * this.scale + offsetX;
            const y = (sticker.top - this.bounds.minY) * this.scale + offsetY;
            const width = sticker.width * this.scale;
            const height = sticker.height * this.scale;

            // 设置位置和尺寸
            stickerElement.style.left = `${x}px`;
            stickerElement.style.top = `${y}px`;
            stickerElement.style.width = `${width}px`;
            stickerElement.style.height = `${height}px`;

            // 设置旋转
            if (sticker.rotation) {
                stickerElement.style.transform = `rotate(${sticker.rotation}deg)`;
            }

            // 添加SVG内容
            stickerElement.innerHTML = `
                <div class="sticker-content">
                    ${stickerInfo.getSvg()}
                </div>
            `;

            stickersContainer.appendChild(stickerElement);
        });
    }
}

// 注册自定义元素
if (!customElements.get('preview-dialog')) {
    customElements.define('preview-dialog', PreviewDialog);
} 
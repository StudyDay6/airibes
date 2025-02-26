import { getTranslation, getTranslationValue } from './translations.js';
import { STICKER_TYPES, AREA_TYPES } from './constants.js';

if (!customElements.get('cus-panel')) {
  customElements.define(
    "cus-panel",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._initialized = false;
        this._hass = null;
        this.apartmentData = null;
        this.currentApartmentId = 1;
        this.calibrationStep = 0;
        this.personPositions = new Map();
        this.calibratingRoomId = null;
        this.calibratingRadarId = null;
        this.doorNumbers = new Map();
        this.calibratingDoorPosition = null;
        this.scale = 1;
      }

      set hass(hass) {
        const oldHass = this._hass;
        this._hass = hass;
        
        if (oldHass) {
            this.updateDevicesState(oldHass);
        }
        
        if (!oldHass && hass) {
            if (this._initialized && !this.apartmentData) {
                this.loadData();
            } else if (!this._initialized) {
                this.initializePanel();
            }
        }
        
        // 添加自动重连逻辑
        if (hass && !oldHass && this._initialized) {
            this.reconnect();
        }
      }

      async initializePanel() {
        if (this._initialized) return;
        
        try {
            await this.loadStyles();
            this.render();
            this.initCanvas();
            this.addEventListeners();
            
            // 确保 hass 对象已初始化后再加载数据
            if (this._hass) {
                await this.loadData();
            }
            
            // 添加画布大小监听
            const container = this.canvas?.parentElement;
            if (container) {
                const resizeObserver = new ResizeObserver(() => {
                    this.updateCanvasSize();
                });
                resizeObserver.observe(container);
            }

            this._initialized = true;
        } catch (error) {
            console.error('初始化面板失败:', error);
        }
      }

      async loadStyles() {
        const response = await fetch('/frontend_static/my-panel.css');
        const style = await response.text();
        this.styles = style;
      }

      render() {
        const translations = getTranslation(this._hass?.language || 'en');
        
        this.shadowRoot.innerHTML = `
            <style>${this.styles}</style>
            <div class="panel-container">
                <ha-card>
                    <div class="header-content">
                        <div class="header-title">${translations.title}</div>
                        <div class="header-buttons">
                            <mwc-button 
                                raised
                                class="header-button" 
                                id="apartment-btn">
                                <ha-icon icon="mdi:floor-plan"></ha-icon>
                                ${translations.edit_button}
                            </mwc-button>
                            <div class="more-button">
                                <ha-icon icon="mdi:dots-vertical"></ha-icon>
                                <div class="dropdown-menu">
                                    <div class="dropdown-item" id="device-library-button">
                                        <ha-icon icon="mdi:database"></ha-icon>
                                        <span>${translations.device_library}</span>
                                    </div>
                                    <div class="dropdown-item" id="reset-button">
                                        <ha-icon icon="mdi:account-off"></ha-icon>
                                        <span>${getTranslationValue('reset_position', this._hass?.language || 'en')}</span>
                                    </div>
                                    <div class="dropdown-item" id="export-button">
                                        <ha-icon icon="mdi:export"></ha-icon>
                                        <span>${translations.export_cards}</span>
                                    </div>
                                    <div class="dropdown-item" id="calibrate-button">
                                        <ha-icon icon="mdi:ruler"></ha-icon>
                                        <span>${translations.calibrate}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="apartment-view">
                            <div class="canvas-wrapper">
                                <canvas id="apartmentCanvas"></canvas>
                                <div class="stickers-container"></div>
                            </div>
                        </div>
                    </div>
                </ha-card>
                
                <!-- 添加雷达校准弹框 -->
                <div class="calibration-dialog" id="calibrationDialog">
                    <div class="dialog-content">
                        <div class="dialog-header">
                            <span>${translations.calibrate}</span>
                            <span class="calibration-help-link">${translations.why_calibrate}</span>
                            <ha-icon 
                                class="close-button" 
                                icon="mdi:close" 
                                id="closeDialog">
                            </ha-icon>
                        </div>
                        <div class="dialog-body">
                            <div class="radar-list" id="radarList">
                                <!-- 雷达列表将动态添加 -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 添加点击事件监听
        this.shadowRoot.querySelector('.calibration-help-link')?.addEventListener('click', () => {
            const translations = getTranslation(this._hass?.language || 'en');
            
            // 创建弹框
            const dialog = document.createElement('ha-dialog');
            dialog.heading = translations.why_calibrate;
            dialog.open = true;
            dialog.hideActions = true; // 隐藏默认的 footer
            
            // 设置弹框内容
            dialog.innerHTML = `
                <div class="calibration-help-dialog">
                    <p>${translations.calibration_help_text}</p>
                    <div class="dialog-button-container">
                        <mwc-button
                            class="close-button"
                            dialogAction="ok">
                            ${translations.confirm}
                        </mwc-button>
                    </div>
                </div>
            `;
            
            // 添加关闭事件监听
            dialog.addEventListener('closed', () => dialog.remove());
            
            // 添加按钮点击事件
            dialog.addEventListener('click', (e) => {
                const button = e.target.closest('mwc-button');
                if (button) {
                    dialog.close();
                }
            });
            
            // 添加到 DOM
            this.shadowRoot.appendChild(dialog);
        });
      }

      async loadData() {
        try {
            if (!this._hass) {
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
            
        }
      }

      initCanvas() {
        this.canvas = this.shadowRoot.getElementById('apartmentCanvas');
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        if (!container) return;

        this.updateCanvasSize();
        this.ctx = this.canvas.getContext('2d');
      }

      updateCanvasSize() {
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;

        if (this.apartmentData) {
            this.drawApartment();
            this.updateResetButton();
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
        this.scale = scale;

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
        // 绘制区域（只绘制房间内且visible为true的区域）
        this.drawAreas(ctx);

        ctx.restore();

        // 更新贴纸（只显示房间内的贴纸）
        this.updateStickers(scale, offsetX, offsetY, bounds);
        // 绘制人员位置
        this.drawPersonPositions(ctx);
        // 绘制设备（只显示房间内的设备）
        this.drawDevices(ctx);
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

      drawRooms(ctx) {
        let { rooms = [], stickers = [] } = this.apartmentData;
        rooms = rooms.filter(room => !(room?.isValid === false));
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
          if (this.calibratingRoomId && room.id === this.calibratingRoomId) {
            roomColor = '#FFFFFF'; // 白色背景
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
                const onLeftWall = Math.abs(doorCenterX - room.left) < 10;
                const onRightWall = Math.abs(doorCenterX - (room.left + room.width)) < 10;
                const onTopWall = Math.abs(doorCenterY - room.top) < 10;
                const onBottomWall = Math.abs(doorCenterY - (room.top + room.height)) < 10;
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

        // 绘制房间名称
        rooms.forEach(room => {
            ctx.fillStyle = '#64758B';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(room.name, room.left + room.width / 2, room.top + room.height / 2);
        });

        // 在绘制完门洞后，绘制门号
        if (this.calibrationStep === 2 && this.calibratingRoomId) {
            rooms.forEach(room => {
                if (room.id === this.calibratingRoomId) {
                    const doors = this.apartmentData.stickers.filter(sticker => 
                        sticker.type === 'door' && 
                        this.isDoorOnRoomWall(sticker, room)
                    );
                    doors.forEach(door => {
                        const doorNumber = this.doorNumbers.get(door.id);
                        if (doorNumber !== undefined) {
                            // 计算门的中心点
                            const doorCenterX = door.left + door.width / 2;
                            const doorCenterY = door.top + door.height / 2;
                            
                            // 绘制圆形背景
                            ctx.save();
                            ctx.fillStyle = '#1976D2';  // 蓝色背景
                            ctx.beginPath();
                            ctx.arc(doorCenterX, doorCenterY, 12, 0, Math.PI * 2);
                            ctx.fill();
                            
                            // 绘制门号文字
                            ctx.fillStyle = '#FFFFFF';  // 白色文字
                            ctx.font = 'bold 16px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(doorNumber.toString(), doorCenterX, doorCenterY);
                            ctx.restore();
                            // 添加点击区域
                            // this.addDoorNumberClickArea(doorCenterX, doorCenterY, door);
                        }
                    });
                }
            });
        }
      }

      // 判断门是否在房间墙上的辅助方法
      isDoorOnRoomWall(door, room) {
        const doorCenter = {
            x: door.left + door.width / 2,
            y: door.top + door.height / 2
        };

        const tolerance = 10;  // 容差值

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
        if (this.showAreas === false) return;

        const { areas = [], rooms = [] } = this.apartmentData;
        areas.forEach(area => {
          // 检查区域是否在任何房间内且visible为true
          const isInAnyRoom = rooms.some(room => this.isElementInRoom(area, room));
          if (!isInAnyRoom || area.visible === false || area.isValid === false) return;

          ctx.fillStyle = `${area.color}33`;
          ctx.strokeStyle = area.color;
          ctx.lineWidth = 2;

          ctx.beginPath();
          ctx.rect(area.left, area.top, area.width, area.height);
          ctx.fill();
          ctx.stroke();

          // 绘制区域名称
          ctx.fillStyle = area.color;
          ctx.font = '10px Arial';
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

      addEventListeners() {
        const apartmentBtn = this.shadowRoot.getElementById('apartment-btn');
        if (apartmentBtn) {
          apartmentBtn.addEventListener('click', () => {
            window.location.pathname = '/airibes_apartment';
          });
        }

        // 添加重置无人按钮事件监听
        const resetButton = this.shadowRoot.getElementById("reset-button");
        if (resetButton) {
            resetButton.addEventListener("click", () => {
                this.resetNoPersonStatus();
            });
        }

        // 添加导出按钮事件监听
        const exportButton = this.shadowRoot.getElementById("export-button");
        if (exportButton) {
            exportButton.addEventListener("click", () => {
                this.exportApartmentCard();
            });
        }

        // 添加设备库按钮事件监听
        const deviceLibraryButton = this.shadowRoot.getElementById("device-library-button");
        if (deviceLibraryButton) {
            deviceLibraryButton.addEventListener("click", () => {
                window.location.pathname = '/airibes_device_library';
            });
        }

        // 添加更多按钮的点击事件
        const moreButton = this.shadowRoot.querySelector('.more-button');
        const dropdownMenu = this.shadowRoot.querySelector('.dropdown-menu');
        
        // 点击更多按钮显示/隐藏下拉菜单
        moreButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        // 点击其他地方关闭下拉菜单
        document.addEventListener('click', () => {
            dropdownMenu?.classList.remove('show');
        });

        // 雷达校准按钮点击事件
        this.shadowRoot.querySelector('#calibrate-button')?.addEventListener('click', () => {
            // 判断有雷达设备
            const radarDevices = this.apartmentData.devices.filter(device => device.type === 'radar');
            if (radarDevices.length === 0) {
                return;
            }else if (radarDevices.length === 1) {
              this.calibrationStep = 2;
              const device = radarDevices[0];
              this.calibratingRadarId = device.id;
              // 找到雷达所在的房间并保存其 ID
              const radarRoom = this.findDeviceRoom(device);
              if (radarRoom) {
                  this.calibratingRoomId = radarRoom.id;
                  // 给房间内的门添加标号
                  this.markDoorNumbers(radarRoom);
                  this.drawApartment();  // 重新绘制整个户型
              }
              this.showCalibrationDialog();
            }else {
              this.calibrationStep = 1;
              this.showCalibrationDialog();
            }
        });

        // 添加关闭按钮事件
        this.shadowRoot.querySelector('#closeDialog')?.addEventListener('click', () => {
          this.hideCalibrationDialog();
          this.calibrationStep = 0;
        });
      }

      async connectedCallback() {
        // 保存现有的取消订阅函数
        this._unsubs = this._unsubs || [];
        
        // 添加重连标志
        this._isConnected = true;

        if (!this._hass) {
            // 等待 hass 对象初始化
            await new Promise(resolve => {
                const checkHass = () => {
                    if (this._hass) {
                        resolve();
                    } else if (this._isConnected) { // 只在组件仍然连接时继续检查
                        setTimeout(checkHass, 100);
                    }
                };
                checkHass();
            });
        }

        // 只有在组件仍然连接时才继续初始化
        if (this._isConnected && this._hass) {
            // 发送户型视图可见事件
            await this._hass.callWS({
                type: 'airibes/set_apartment_view_visible',
                visible: true,
                apartment_id: this.currentApartmentId || 1
            });

            // 订阅事件
            if (!this._eventSubscribed) {
                this._unsubs.push(
                    this._hass.connection.subscribeEvents(
                        (event) => this._handleEvent(event),
                        "airibes_event"
                    )
                );

                this._stateUpdateHandler = (ev) => this._handleDeviceStateUpdate(ev);
                this._unsubs.push(
                    this._hass.connection.subscribeEvents(
                        this._stateUpdateHandler,
                        'airibes_device_status_update'
                    )
                );

                this._personPositionHandler = (event) => this._handlePersonPositionsUpdate(event);
                this._unsubs.push(
                    this._hass.connection.subscribeEvents(
                        this._personPositionHandler,
                        'airibes_person_positions_update'
                    )
                );

                this._calibrationResultHandler = (event) => this._handleCalibrationResult(event);
                this._unsubs.push(
                    this._hass.connection.subscribeEvents(
                        this._calibrationResultHandler,
                        'airibes_device_calibration_result'
                    )
                );

                this._deviceRemovedHandler = (event) => this._handleDeviceRemoved(event);
                this._unsubs.push(
                    this._hass.connection.subscribeEvents(
                        this._deviceRemovedHandler,
                        'airibes_device_removed'
                    )
                );  

                this._eventSubscribed = true;
            }

            // 如果面板还没初始化，则初始化
            if (!this._initialized) {
                await this.initializePanel();
            } else {
                // 如果已经初始化过，则重新加载数据和重绘
                await this.loadData();
                this.drawApartment();
            }
        }

        // 在 connectedCallback 中也调用一次
        this.updateResetButton();
      }

      disconnectedCallback() {
        // 设置断开连接标志
        this._isConnected = false;
        this._eventSubscribed = false;

        // 清理所有订阅
        if (this._unsubs) {
            this._unsubs.forEach((unsub) => {
                if (typeof unsub === 'function') {
                    unsub();
                }
            });
            this._unsubs = [];
        }

        // 通知后端户型视图不可见
        if (this._hass) {
            this._hass.callWS({
                type: 'airibes/set_apartment_view_visible',
                visible: false,
                apartment_id: this.currentApartmentId || 1
            }).catch(error => {
                // error
            });
        }
      }

      _handleDeviceStateUpdate(event) {
        const { device_id, status } = event.data;
        
        // 找到对应的设备元素
        const deviceContainer = this.shadowRoot.querySelector('.stickers-container');
        if (!deviceContainer) return;

        // 构造 entity_id
        let entityId;
        if (status.type === 'radar') {
          entityId = `sensor.airibes_radar_${device_id.toLowerCase()}`;
        } else {
          entityId = device_id;
        }

        // 找到设备元素
        const deviceElement = deviceContainer.querySelector(`.device-element ha-icon[data-device-id="${device_id}"]`);
        if (!deviceElement) return;

        // 获取新的状态和颜色
        let iconColor = 'var(--disabled-text-color)'; 
        const state = this._hass.states[entityId]?.state || 'unavailable';

        // 根据设备类型和状态设置颜色
        switch (status.type) {
          case 'radar':
            if (state === '在线') {
              iconColor = 'var(--success-color)'; 
            } else if (state === 'off') {
              iconColor = 'var(--primary-color)'; 
            }
            break;
            
          case 'light':
            if (state === 'on') {
              iconColor = 'var(--warning-color)'; 
            } else if (state === 'off') {
              iconColor = 'var(--primary-color)'; 
            }
            break;
            
          case 'climate':
            if (state === 'on' || state === 'heat' || state === 'cool') {
              iconColor = 'var(--info-color)'; 
            } else if (state === 'off') {
              iconColor = 'var(--primary-color)'; 
            }
            break;
        }

        // 更新设备图标颜色
        deviceElement.style.color = iconColor;
      }

      _handleCalibrationResult(event) {
        const { device_id, result } = event.data;
        this.hideCalibrationDialog();
        const translations = getTranslation(this._hass?.language || 'en');
        this.showToast(result ? translations.calibration_success : translations.calibration_failed);
      }

      _handleDeviceRemoved(event) {
        // 重新加载数据
        const deviceId = event.data.device_id;
        this.loadData();
        this.personPositions.delete(deviceId);
        this.drawApartment();
      }

      // 修改 exportApartmentCard 方法
      async exportApartmentCard() {
        const translations = getTranslation(this._hass?.language || 'en');
        try {
            // 先加载和注册 apartment-card 组件
            await this.loadApartmentCard();

            // 获取当前的 Lovelace 配置
            const lovelaceConfig = await this._hass.callWS({
                type: "lovelace/config"
            });
            console.log("lovelaceConfig", lovelaceConfig);
            // 检查配置和视图是否存在
            if (!lovelaceConfig || !lovelaceConfig.views || !Array.isArray(lovelaceConfig.views)) {
                this.showToast(translations.export_card_failed);
                return;
            }

            // 检查所有视图中是否已存在户型卡片
            let hasApartmentCard = false;
            lovelaceConfig.views.forEach(view => {
                if (view.cards && Array.isArray(view.cards)) {
                    if (view.cards.some(card => card.type === "custom:apartment-card")) {
                        hasApartmentCard = true;
                    }
                }
            });

            if (hasApartmentCard) {
                this.showToast(translations.export_card_exist);
                return;
            }

            // 找到第一个有效的视图，如果没有则创建一个
            let targetView = lovelaceConfig.views.find(view => view && view.cards);
            if (!targetView) {
                if (lovelaceConfig.views.length === 0) {
                    // 如果没有视图，创建一个新视图
                    lovelaceConfig.views.push({
                        title: "Home",
                        cards: []
                    });
                    targetView = lovelaceConfig.views[0];
                } else {
                    // 使用第一个视图，并确保它有 cards 数组
                    targetView = lovelaceConfig.views[0];
                    targetView.cards = targetView.cards || [];
                }
            }

            // 创建户型卡片配置
            const cardConfig = {
                type: "custom:apartment-card"
            };

            // 添加卡片到目标视图
            targetView.cards.push(cardConfig);

            // 保存更新后的配置
            await this._hass.callWS({
                type: "lovelace/config/save",
                config: lovelaceConfig
            });

            // 显示成功提示
            this.showToast(translations.export_card_success);

        } catch (error) {
            this.showToast(translations.export_card_failed); 
        }
      }

      // 添加加载和注册卡片组件方法
      async loadApartmentCard() {
        // 检查是否已经注册
        if (customElements.get('apartment-card')) {
            return;
        }

        try {
            // 动态导入卡片组件
            await import('/frontend_static/apartment-card.js');

            // 等待组件注册完成
            await customElements.whenDefined('apartment-card');
        } catch (error) {
            throw error;
        }
      }

      // 添加提示方法
      showToast(message) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.textContent = message;
        this.shadowRoot.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
      }

      // 修改 drawDoors 方法
      drawDoors(ctx) {
        const { stickers = [] } = this.apartmentData;
        // 只处理门类型的贴纸
        const doorStickers = stickers.filter(sticker => sticker.type === 'door');

        if (doorStickers.length > 0) {
            // 使用 destination-out 混合模式，将门的区域"掏空"
            ctx.globalCompositeOperation = 'destination-out';

            doorStickers.forEach(sticker => {
                ctx.save();
                
                // 应用旋转
                if (sticker.rotation) {
                    const centerX = sticker.left + sticker.width / 2;
                    const centerY = sticker.top + sticker.height / 2;
                    ctx.translate(centerX, centerY);
                    ctx.rotate(sticker.rotation * Math.PI / 180);
                    ctx.translate(-centerX, -centerY);
                }

                // 绘制门的区域（将被掏空）
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.rect(sticker.left, sticker.top, sticker.width, sticker.height);
                ctx.fill();

                ctx.restore();
            });

            // 恢复正常的混合模式
            ctx.globalCompositeOperation = 'source-over';
        }
      }

      // 添加绘制其他贴纸的方法
      drawOtherStickers(ctx) {
        const { stickers = [] } = this.apartmentData;
        // 绘制非门类型的贴纸
        stickers.filter(sticker => sticker.type !== 'door').forEach(sticker => {
            const stickerInfo = STICKER_TYPES[sticker.type];
            if (!stickerInfo) return;

            ctx.save();
            
            if (sticker.rotation) {
                const centerX = sticker.left + sticker.width / 2;
                const centerY = sticker.top + sticker.height / 2;
                ctx.translate(centerX, centerY);
                ctx.rotate(sticker.rotation * Math.PI / 180);
                ctx.translate(-centerX, -centerY);
            }

            // 绘制贴纸边框和背景
            ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.rect(sticker.left, sticker.top, sticker.width, sticker.height);
            ctx.fill();
            ctx.stroke();

            // 绘制贴纸名称
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                stickerInfo.name,
                sticker.left + sticker.width / 2,
                sticker.top + sticker.height / 2
            );

            ctx.restore();
        });
      }

      // 添加人员位置更新处理方法
      _handlePersonPositionsUpdate(event) {
        const { device_id, positions } = event.data;
        const deviceExists = this.apartmentData.devices.some(device => device.id === device_id);
        if (deviceExists) {
          this.personPositions.set(device_id, positions);
        }else{
          this.personPositions.delete(device_id);
        }
        // 重新绘制以更新人员位置
        this.drawApartment();
      }

      // 修改绘制人员位置的方法
      drawPersonPositions(ctx) {
        const stickersContainer = this.shadowRoot.querySelector('.stickers-container');
        if (!stickersContainer) {
            return;
        }

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

        // 清除现有的人员标记
        const existingMarkers = stickersContainer.querySelectorAll('.person-marker');
        existingMarkers.forEach(marker => marker.remove());

        // 遍历所有设备的人员位置
        if (this.personPositions && this.personPositions.size > 0) {
            this.personPositions.forEach((positions, deviceId) => {
                positions.forEach((pos, index) => {
                    // 计算显示位置（考虑缩放和偏移）
                    const x = (pos.x - bounds.minX) * scale + offsetX;
                    const y = (pos.y - bounds.minY) * scale + offsetY;

                    // 创建人员标记元素
                    const marker = document.createElement('div');
                    marker.className = 'person-marker';
                    marker.innerHTML = `
                        <div class="person-content">
                            <ha-icon icon="mdi:walk" style="color: #00FF00;"></ha-icon>
                        </div>
                    `;

                    // 设置位置和样式
                    marker.style.cssText = `
                        position: absolute;
                        left: ${x}px;
                        top: ${y}px;
                        transform: translate(-50%, -50%);
                        z-index: 1000;
                        pointer-events: auto;
                        width: 24px;
                        height: 24px;
                    `;

                    // 添加点击事件
                    marker.addEventListener('click', (e) => {
                        this.showPersonInfo(e, deviceId, pos.id);
                    });

                    // 添加到容器
                    stickersContainer.appendChild(marker);
                });
            });
        }

        // 验证添加结果
        const addedMarkers = stickersContainer.querySelectorAll('.person-marker');
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

      // 添加重置无人状态的方法
      async resetNoPersonStatus() {
        try {
            // 直接使用当前户型数据中的设备
            const radarDevices = this.apartmentData.devices.filter(device => device.type === 'radar');
            
            for (const device of radarDevices) {
                // 发送重置无人命令
                await this._hass.callWS({
                    type: 'airibes/send_reset_nobody_data',
                    device_id: device.id,
                    person_id: 255
                });
            }
            
            this.showToast(getTranslationValue('reset_nobody_command_sent', this._hass?.language || 'en'));
        } catch (error) {
            this.showToast(getTranslationValue('reset_nobody_command_failed', this._hass?.language || 'en'));
        }
      }

      // 修改人员标记点击事件处理
      showPersonInfo(event, deviceId, personIndex) {
        // 移除现有的弹框
        const existingPopup = this.shadowRoot.querySelector('.person-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // 创建弹框
        const popup = document.createElement('div');
        popup.className = 'person-popup';
        popup.innerHTML = `
            <div class="popup-content">
                <mwc-button 
                    class="delete-button"
                    raised>
                    <ha-icon icon="mdi:delete"></ha-icon>
                    删除监测目标
                </mwc-button>
            </div>
        `;

        // 设置弹框位置
        const rect = event.target.getBoundingClientRect();
        popup.style.left = `${rect.right}px`;
        popup.style.top = `${rect.top}px`;

        // 添加删除按钮事件
        popup.querySelector('.delete-button').addEventListener('click', async () => {
            try {
                // 发送删除监测目标命令
                await this._hass.callWS({
                    type: 'airibes/send_reset_nobody_data',
                    device_id: deviceId,
                    person_id: personIndex
                });
                popup.remove();
                this.showToast(getTranslationValue('delete_person_target_success', this._hass?.language || 'en'));
            } catch (error) {
                this.showToast(getTranslationValue('delete_person_target_failed', this._hass?.language || 'en'));
            }
        });

        // 3秒后自动关闭
        setTimeout(() => {
            popup.remove();
        }, 3000);

        this.shadowRoot.appendChild(popup);
      }

      // 添加判断元素是否在房间内的方法
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

      // 修改 createDeviceElement 方法
      createDeviceElement(device, x, y, scale) {
        // 创建设备元素
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-element';
        deviceElement.style.position = 'absolute';
        deviceElement.style.left = `${x}px`;
        deviceElement.style.top = `${y}px`;
        deviceElement.style.width = '24px';  // 固定大小
        deviceElement.style.height = '24px';
        
        if (device.rotation) {
          deviceElement.style.transform = `rotate(${device.rotation}deg)`;
        }

        // 获取设备状态和颜色
        let state = 'unavailable';
        let iconColor = 'var(--disabled-text-color)'; // 默认灰色

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
            <ha-icon icon="${icon}" style="color: ${iconColor};" data-device-id="${device.id}"></ha-icon>
          </div>
        `;

        // 添加点击事件处理 <span class="device-name">${device.id.slice(-4)}</span>
        deviceElement.addEventListener('click', () => {
          if (this.calibrationStep === 1 && device.type === 'radar') {
            this.calibrationStep = 2;
            this.calibratingRadarId = device.id;
            // 找到雷达所在的房间并保存其 ID
            const radarRoom = this.findDeviceRoom(device);
            if (radarRoom) {
                this.calibratingRoomId = radarRoom.id;
                // 给房间内的门添加标号
                this.markDoorNumbers(radarRoom);
                this.drawApartment();  // 重新绘制整个户型
            }
            this.showCalibrationDialog();
          } else if (!this.calibrationStep) {
            // 正常的设备点击事件
            let entityId = device.type === 'radar' 
                ? `sensor.airibes_radar_${device.id.toLowerCase()}`
                : device.id;

            const event = new CustomEvent('hass-more-info', {
                detail: { entityId: entityId },
                bubbles: true,
                composed: true
            });
            this.dispatchEvent(event);
          }
        });

        const deviceContainer = this.shadowRoot.querySelector('.stickers-container');
        deviceContainer.appendChild(deviceElement);
      }

      // 修改 createStickerElement 方法
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

      // 添加更新设备状态的方法
      updateDevicesState(oldHass) {
        if (!this.apartmentData?.devices) return;
        
        let needsRedraw = false; // 添加重绘标志
        
        const deviceContainer = this.shadowRoot.querySelector('.stickers-container');
        if (!deviceContainer) return;

        this.apartmentData.devices.forEach(device => {
          let entityId;
          if (device.type === 'radar') {
            entityId = `sensor.airibes_radar_${device.id.toLowerCase()}`;
          } else {
            entityId = device.id;
          }

          // 检查状态是否发生变化
          const oldState = oldHass.states[entityId]?.state;
          const newState = this._hass.states[entityId]?.state;
          if (oldState !== newState) {
            // 如果是灯具状态改变，标记需要重绘
            if (device.type === 'light') {
              needsRedraw = true;
            }

            // 更新设备图标颜色
            const deviceElement = deviceContainer.querySelector(`.device-element ha-icon[data-device-id="${device.id}"]`);
            if (!deviceElement) return;
            
            // 根据设备类型和新状态设置颜色
            let iconColor = 'var(--disabled-text-color)'; // 默认灰色
            
            switch (device.type) {
              case 'radar':
                if (newState === getTranslationValue('online', this._hass?.language || 'en')) {
                  iconColor = 'var(--success-color)'; // 在线/有人时绿色
                } else {
                  iconColor = 'var(--primary-color)'; // 在线/无人时蓝色
                }
                break;
                
              case 'light':
                if (newState === 'on') {
                  iconColor = 'var(--warning-color)'; // 开启时黄色
                } else if (newState === 'off') {
                  iconColor = 'var(--primary-color)'; // 关闭时蓝色
                }
                break;
                
              case 'climate':
                if (newState === 'on' || newState === 'heat' || newState === 'cool') {
                  iconColor = 'var(--info-color)'; // 运行时蓝色
                } else if (newState === 'off') {
                  iconColor = 'var(--primary-color)'; // 关闭时默认色
                }
                break;
            }

            // 更新设备图标颜色
            deviceElement.style.color = iconColor;
          }
        });

        // 如果有灯具状态改变，重新绘制整个户型图
        if (needsRedraw) {
          this.drawApartment();
        }
      }

      // 添加检查点是否在房间内的辅助方法
      isPointInRoom(point, room) {
        return point.x >= room.left && 
               point.x <= (room.left + room.width) &&
               point.y >= room.top && 
               point.y <= (room.top + room.height);
      }

      // 添加重连方法
      async reconnect() {
        console.log("重新连接中...");
        try {
            await this.loadData();
            this.drawApartment();
        } catch (error) {
            console.error("重连失败:", error);
        }
      }

      // 在 render 之后添加检查雷达设备的方法
      updateResetButton() {
        const resetButton = this.shadowRoot.getElementById("reset-button");
        if (!resetButton) return;

        // 检查是否有雷达设备
        const hasRadarDevices = this.apartmentData?.devices?.some(device => device.type === 'radar') || false;
        
        // 根据是否有雷达设备来显示/隐藏按钮
        resetButton.style.display = hasRadarDevices ? 'inline-flex' : 'none';
      }

      // 添加一个方法来控制按钮的禁用状态
      setButtonsDisabled(disabled) {
        const apartmentBtn = this.shadowRoot.querySelector('#apartment-btn');
        const moreButton = this.shadowRoot.querySelector('.more-button');
        
        if (apartmentBtn) {
            if (disabled) {
                apartmentBtn.setAttribute('disabled', '');
                apartmentBtn.style.pointerEvents = 'none';
                apartmentBtn.style.opacity = '0.5';
            } else {
                apartmentBtn.removeAttribute('disabled');
                apartmentBtn.style.pointerEvents = 'auto';
                apartmentBtn.style.opacity = '1';
            }
        }
        
        if (moreButton) {
            if (disabled) {
                moreButton.style.pointerEvents = 'none';
                moreButton.style.opacity = '0.5';
            } else {
                moreButton.style.pointerEvents = 'auto';
                moreButton.style.opacity = '1';
            }
        }
      }

      // 修改显示校准弹框方法
      showCalibrationDialog() {
        const dialog = this.shadowRoot.getElementById('calibrationDialog');
        // 禁用按钮
        this.setButtonsDisabled(true);
        
        const radarList = this.shadowRoot.getElementById('radarList');
        const translations = getTranslation(this._hass?.language || 'en');
        // 根据校准步骤显示不同的提示文字
        let tipContent = '';
        if (this.calibrationStep === 1) {
            tipContent = `
                <div class="calibration-tip">
                    <ha-icon icon="mdi:information"></ha-icon>
                    <span>${translations.click_radar_to_calibrate}</span>
                </div>
            `;
        } else if (this.calibrationStep === 2) {
            // 修改门号按钮的创建部分
            const doorButtons = Array.from(this.doorNumbers.entries())
                .map(([doorId, number]) => {
                    const door = this.apartmentData.stickers.find(s => s.id === doorId);
                    if (!door) return '';
                    const centerX = door.left + door.width / 2;
                    const centerY = door.top + door.height / 2;
                    return `
                        <div
                            class="door-number-button ${this.calibratingDoorPosition?.doorId === doorId ? 'selected' : ''}"
                            data-door-id="${doorId}"
                            data-center-x="${centerX}"
                            data-center-y="${centerY}">
                            ${number}
                        </div>
                    `;
                })
                .join('');

            tipContent = `
                <div class="calibration-tip">
                    <div class="calibration-actions">
                        <ha-icon icon="mdi:information"></ha-icon>
                        <span>${translations.stand_at_door}</span>
                        <div class="door-selection">
                            <div class="door-buttons">
                                ${doorButtons}
                            </div>
                        </div>
                        <mwc-button 
                            raised
                            class="start-calibration-button"
                            id="startCalibrationBtn"
                            .disabled="${!this.calibratingDoorPosition}">
                            ${translations.start_calibration}
                        </mwc-button>
                    </div>
                </div>
            `;
        } else if (this.calibrationStep === 3) {
            tipContent = `
                <div class="calibration-tip">
                    <ha-icon icon="mdi:progress-clock"></ha-icon>
                    <span>${translations.calibrating}</span>
                </div>
            `;
        }
        
        radarList.innerHTML = tipContent;

        // 如果是步骤2，添加开始校准按钮的点击事件
        if (this.calibrationStep === 2) {
            // 添加门号按钮的点击事件
            const doorButtons = this.shadowRoot.querySelectorAll('.door-number-button');
            doorButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const doorId = button.dataset.doorId;
                    const centerX = parseFloat(button.dataset.centerX);
                    const centerY = parseFloat(button.dataset.centerY);
                    
                    // 保存选中的门位置信息
                    this.calibratingDoorPosition = {
                        doorId,
                        x: centerX,
                        y: centerY
                    };

                    // 更新按钮选中状态
                    doorButtons.forEach(btn => btn.classList.remove('selected'));
                    button.classList.add('selected');

                    // 启用开始校准按钮
                    const startBtn = this.shadowRoot.querySelector('#startCalibrationBtn');
                    if (startBtn) {
                        startBtn.disabled = false;
                    }
                });
            });

            // 开始校准按钮点击事件
            this.shadowRoot.querySelector('#startCalibrationBtn')?.addEventListener('click', () => {
                if (!this.calibratingDoorPosition) {
                    this.showToast(translations.select_door_first);
                    return;
                }
                // 根据radarId判断雷达是否在线
                const entityId = `sensor.airibes_radar_${this.calibratingRadarId.toLowerCase()}`;
                const entityState = this._hass.states[entityId];
                if (!entityState || entityState.state !== translations.online) {
                    this.showToast(translations.calibration_device_offline);
                    return;
                }
                this.calibrationStep = 3;
                this.showCalibrationDialog();
                this.startCalibration(this.calibratingRadarId);
            });
        }
        
        dialog.classList.add('show');
      }

      // 添加隐藏校准弹框方法
      hideCalibrationDialog() {
        const dialog = this.shadowRoot.getElementById('calibrationDialog');
        if (dialog) {
            dialog.classList.remove('show');
        }
        // 启用按钮
        this.setButtonsDisabled(false);
        
        // 清除校准状态
        this.calibrationStep = 0;
        this.calibratingRoomId = null;
        this.calibratingRadarId = null;
        this.calibratingDoorPosition = null;
        this.doorNumbers.clear();
        
        // 移除所有门号点击区域
        const clickAreas = this.shadowRoot.querySelectorAll('.door-number-click-area');
        clickAreas.forEach(area => area.remove());
        
        this.drawApartment();
      }

      // 添加开始校准方法
      async startCalibration(radarId) {
        const translations = getTranslation(this._hass?.language || 'en');
        try {

            // 将画布坐标转换为实际物理距离（假设1个单位=1厘米）
            const bounds = this.calculateBounds();
            const realX = this.calibratingDoorPosition.x  * 10; // 转换为米
            const realY = this.calibratingDoorPosition.y  * 10; // 转换为米

            // 发送实际物理距离（米）
            const doorPosition = {
                x: Number(realX.toFixed(2)), // 保留一位小数
                y: Number(realY.toFixed(2))
            };
            // 调用后端开始校准
            await this._hass.callWS({
                type: 'airibes/start_calibration',
                radar_id: radarId,
                door_position: doorPosition
            });
            
            this.showToast(translations.calibration_started);
        } catch (error) {
            this.showToast(translations.calibration_failed);
            this.hideCalibrationDialog();
            this.calibrationStep = 0;
        }
      }

      // 添加查找设备所在房间的方法
      findDeviceRoom(device) {
        return this.apartmentData?.rooms?.find(room => 
            device.left >= room.left && 
            device.left <= (room.left + room.width) &&
            device.top >= room.top && 
            device.top <= (room.top + room.height)
        );
      }

      // 添加标记门号的方法
      markDoorNumbers(room) {
        this.doorNumbers.clear();  // 清除之前的门标号
        
        // 找出房间墙上的所有门
        const doors = this.apartmentData.stickers.filter(sticker => 
            sticker.type === 'door' && 
            this.isDoorOnRoomWall(sticker, room)
        );
        if (doors.length === 1) {
          this.calibratingDoorPosition = {
            doorId: doors[0].id,
            x: doors[0].left + doors[0].width / 2,
            y: doors[0].top + doors[0].height / 2
          };
        }else { 
          // 给每个门分配编号
          doors.forEach((door, index) => {
              this.doorNumbers.set(door.id, index + 1);
          });
        }
      }

    }
  );
}

window.customPanelset = true;
window.customPanelset = true;
import { getTranslationValue } from './translations.js';
if (!customElements.get('device-library')) {
  customElements.define(
    "device-library",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._initialized = false;
        this._hass = null;
        this.deviceList = [];
      }

      set hass(hass) {
        const oldHass = this._hass;
        this._hass = hass;
        
        if (!oldHass && hass) {
          if (!this._initialized) {
            this.initializePanel();
          }
        }
      }

      async initializePanel() {
        if (this._initialized) return;
        
        try {
            await this.loadStyles();
            this.render();
            await this.loadDevices();
            this._initialized = true;
        } catch (error) {
            console.error('初始化设备库面板失败:', error);
        }
      }

      async loadStyles() {
        const response = await fetch('/frontend_static/device-library.css');
        const style = await response.text();
        this.styles = style;
      }

      render() {
        this.shadowRoot.innerHTML = `
            <style>${this.styles}</style>
            <div class="panel-container">
                <ha-card>
                    <div class="header-content">
                        <div class="header-left">
                            <mwc-button 
                                class="back-button" 
                                id="back-btn">
                                <ha-icon icon="mdi:chevron-left"></ha-icon>
                                ${getTranslationValue('device_library', this._hass?.language || 'en')}
                            </mwc-button>
                        </div>
                        <div class="header-right">
                            <mwc-button 
                                raised
                                class="import-button" 
                                id="import-btn">
                                <ha-icon icon="mdi:import"></ha-icon>
                                ${getTranslationValue('HASS_import', this._hass?.language || 'en')}
                            </mwc-button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="device-table">
                            <div class="table-header">
                                <div class="col-index">${getTranslationValue('serial_number', this._hass?.language || 'en')}</div>
                                <div class="col-name">${getTranslationValue('device_name', this._hass?.language || 'en')}</div>
                                <div class="col-icon">${getTranslationValue('icon', this._hass?.language || 'en')}</div>
                                <div class="col-id">${getTranslationValue('entity_id', this._hass?.language || 'en')}</div>
                                <div class="col-apartment">${getTranslationValue('apartment', this._hass?.language || 'en')}</div>
                                <div class="col-room">${getTranslationValue('room_location', this._hass?.language || 'en')}</div>
                                <div class="col-status">${getTranslationValue('status', this._hass?.language || 'en')}</div>
                                <div class="col-actions">${getTranslationValue('operation', this._hass?.language || 'en')}</div>
                            </div>
                            <div class="table-body" id="deviceGrid">
                                <!-- 设备列表将在这里动态生成 -->
                            </div>
                        </div>
                    </div>
                </ha-card>
            </div>
            <div id="toast-container"></div>
        `;

        // 添加返回按钮事件监听
        const backBtn = this.shadowRoot.getElementById("back-btn");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                window.location.pathname = '/airibes';
            });
        }

        // 添加导入按钮事件监听
        const importBtn = this.shadowRoot.getElementById("import-btn");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                window.location.pathname = '/airibes_device_import';
            });
        }
      }

      async loadDevices() {
        try {
            // 获取所有雷达设备
            const entityRegistry = await this._hass.callWS({
                type: "config/entity_registry/list"
            });

            // 获取户型数据
            const apartmentsResponse = await this._hass.callWS({
                type: 'airibes/get_apartments'
            });
            
            let deviceRooms = new Map(); // 存储设备ID和房间名称的映射
            // 初始化一个Map来存储所有户型中的设备ID
            const allApartmentDevices = new Set();
            if (apartmentsResponse?.apartments) {
                for (const apartment of apartmentsResponse.apartments) {
                    // 加载每个户型的数据
                    const response = await this._hass.callWS({
                        type: 'airibes/load_apartment_data',
                        apartment_id: apartment.id
                    });
                    
                    if (response?.data) {
                        const {rooms = [], devices = [] } = response.data;
                        devices.forEach(device => allApartmentDevices.add(device.id));
                        // 遍历房间数据
                        rooms.forEach(room => {
                            if (room.devices) {
                                room.devices.forEach(deviceId => {
                                    // 检查设备是否在户型的devices列表中
                                    const deviceData = devices.find(d => d.id === deviceId);
                                    if (deviceData) {
                                        deviceRooms.set(deviceId, room.name);
                                    }
                                });
                            }
                        });
                    }
                }
            }

            // 过滤出雷达设备
            const radarDevices = entityRegistry.filter(entity => 
                entity.entity_id.startsWith("sensor.airibes_radar_")
            );
            // 获取导入的设备
            let importedDevices = await this._hass.callWS({
                type: "airibes/get_imported_devices"
            });
            importedDevices.devices.forEach(device => {
                const entityId = device.entity_id;
                if (!this._hass.states[entityId]) {
                    device.state = 'unavailable';
                }
            });
            console.log('importedDevices:--', importedDevices);
            // 合并设备列表
            this.deviceList = [
                ...radarDevices.map(device => {
                    console.log('device:--00', device);
                    const deviceId = device.entity_id.split('_').pop();
                    console.log('deviceId:-11-', deviceId);
                    return {
                        ...device,
                        deviceType: 'radar',
                        roomName: deviceRooms.get(deviceId.toUpperCase()) || getTranslationValue('not_added', this._hass?.language || 'en'),
                        apartment: allApartmentDevices.has(deviceId.toUpperCase()) ? getTranslationValue('added', this._hass?.language || 'en') : getTranslationValue('not_added', this._hass?.language || 'en')
                    };
                }),
                ...(importedDevices?.devices || []).map(device => ({
                    ...device,
                    deviceType: 'imported',
                    roomName: deviceRooms.get(device.entity_id) || getTranslationValue('not_assigned', this._hass?.language || 'en'),
                    apartment: allApartmentDevices.has(device.entity_id) ? getTranslationValue('added', this._hass?.language || 'en') : getTranslationValue('not_added', this._hass?.language || 'en')
                }))
            ];

            // 更新设备网格
            this.updateDeviceGrid();

        } catch (error) {
            console.error('加载设备列表失败:', error);
        }
      }

      updateDeviceGrid() {
        const deviceGrid = this.shadowRoot.getElementById('deviceGrid');
        if (!deviceGrid) return;

        deviceGrid.innerHTML = this.deviceList.map((device, index) => {
            const isRadar = device.deviceType === 'radar';
            const deviceId = isRadar ? device.entity_id.split('_').pop() : device.entity_id;
            const state = this._hass.states[device.entity_id];
            const isOnline = isRadar ? state?.state === getTranslationValue('online', this._hass?.language || 'en') : state?.state === 'on';
            let stateText = isOnline ? "在线" : "离线";
            if (device.deviceType === 'imported' && device.state === 'unavailable') {
                stateText = "不可用";
            }
            // 根据设备类型设置不同的图标和名称
            let icon, name;
            if (isRadar) {
                icon = "mdi:radar";
                name = getTranslationValue('radar', this._hass?.language || 'en');
            } else {
                icon = device.type === 'light' ? "mdi:lightbulb" : "mdi:air-conditioner";
                name = device.name;
            }

            return `
                <div class="table-row">
                    <div class="col-index">${index + 1}</div>
                    <div class="col-name">${name}</div>
                    <div class="col-icon">
                        <div class="device-icon ${isOnline ? 'online' : 'offline'}">
                            <ha-icon icon="${icon}"></ha-icon>
                        </div>
                    </div>
                    <div class="col-id">${device.entity_id}</div>
                    <div class="col-apartment">${device.apartment}</div>
                    <div class="col-room">${device.roomName}</div>
                    <div class="col-status">
                        <span class="status-badge ${isOnline ? 'online' : 'offline'}">
                            ${stateText}
                        </span>
                    </div>
                    <div class="col-actions">
                        <ha-icon-button
                            class="action-button"
                            data-device="${deviceId}"
                            data-type="${device.deviceType}"
                        >
                            <ha-icon icon="mdi:delete"></ha-icon>
                        </ha-icon-button>
                    </div>
                </div>
            `;
        }).join('');

        // 添加删除按钮事件监听
        const deleteButtons = deviceGrid.querySelectorAll('.action-button');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const deviceId = e.currentTarget.dataset.device;
                const deviceType = e.currentTarget.dataset.type;
                this._handleDelete(deviceId, deviceType);
            });
        });
      }

      _handleDelete(deviceId, deviceType) {
        let entityId = deviceId;
        if (deviceType === 'radar') {
            // 检查设备是否在线
            entityId = `sensor.airibes_radar_${deviceId.toLowerCase()}`;
            const entityState = this._hass.states[entityId];
            if (!entityState || entityState.state !== getTranslationValue('online', this._hass?.language || 'en')) {
                this._showToast(getTranslationValue('device_offline', this._hass?.language || 'en'));
                return;
            }
        }
        // 获取设备信息
        const device = this.deviceList.find(d => 
            deviceType === 'radar' ? 
            d.entity_id.split('_').pop() === deviceId : 
            d.entity_id === deviceId
        );

        if (!device) return;
        // 创建确认弹框
        const dialog = document.createElement('div');
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-content">
                    <div class="dialog-header">
                        <div class="dialog-title">${getTranslationValue('confirm_delete', this._hass?.language || 'en')}</div>
                    </div>
                    <div class="dialog-message">
                        ${getTranslationValue('confirm_delete_device', this._hass?.language || 'en')}
                        <br><br>
                        <div class="device-info">
                            <div class="info-row">
                                <span class="info-label">${getTranslationValue('name', this._hass?.language || 'en')}:</span>
                                <span class="info-value">${deviceType === 'radar' ? getTranslationValue('radar', this._hass?.language || 'en') : device.name}</span>
                            </div>
                            <div class="info-row">
                                <span class="info-label">${getTranslationValue('entity_id', this._hass?.language || 'en')}:</span>
                                <span class="info-value">${device.entity_id}</span>
                            </div>
                        </div>
                    </div>
                    <div class="dialog-buttons">
                        <mwc-button outlined class="cancel-button" id="cancelBtn">${getTranslationValue('cancel', this._hass?.language || 'en')}</mwc-button>
                        <mwc-button raised class="confirm-button" id="confirmBtn">${getTranslationValue('confirm', this._hass?.language || 'en')}</mwc-button>
                    </div>
                </div>
            </div>
        `;

        // 添加按钮事件
        const cancelBtn = dialog.querySelector('#cancelBtn');
        const confirmBtn = dialog.querySelector('#confirmBtn');

        cancelBtn.addEventListener('click', () => {
            dialog.remove();
        });

        confirmBtn.addEventListener('click', async () => {
            try {
                // 检查设备是否已添加到户型中
                if (device.apartment === getTranslationValue('added', this._hass?.language || 'en')) {
                    this._showToast(getTranslationValue('please_delete_from_apartment', this._hass?.language || 'en'));
                    dialog.remove();
                    return;
                }

                // 继续删除操作
                if (deviceType === 'radar') {
                    // 删除雷达设备
                    await this._hass.callWS({
                        type: 'airibes/delete_radar_device',
                        device_id: deviceId
                    });
                } else {
                    // 删除导入的设备
                    await this._hass.callWS({
                        type: 'airibes/delete_imported_device',
                        entity_id: deviceId
                    });
                }

                // 显示成功提示
                this._showToast(getTranslationValue('delete_success', this._hass?.language || 'en'));
                
                // 关闭弹框
                dialog.remove();
                
                // 根据删除的deviceId直接去除数据
                this.deviceList = this.deviceList.filter(device => device.entity_id !== entityId);
                console.log('this.deviceList:--', this.deviceList);
                // 更新设备网格
                this.updateDeviceGrid();
                
            } catch (error) {
                console.error('删除设备失败:', error);
                this._showToast(getTranslationValue('delete_failed', this._hass?.language || 'en'));
            }
        });

        this.shadowRoot.appendChild(dialog);
      }

      _showToast(message) {
        const toastContainer = this.shadowRoot.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }

      async connectedCallback() {
        this._unsubs = [];
        
        if (this._hass) {
            // 订阅设备状态更新事件
            this._stateUpdateHandler = (ev) => this._handleDeviceStateUpdate(ev);
            this._unsubs.push(
                this._hass.connection.subscribeEvents(
                    this._stateUpdateHandler,
                    'airibes_device_status_update'
                )
            );
        }

        if (!this._initialized) {
            await this.initializePanel();
        }
      }

      disconnectedCallback() {
        // 清理所有事件订阅
        if (this._unsubs) {
          this._unsubs.forEach((unsub) => {
            if (typeof unsub === 'function') {
              unsub();
            }
          });
          this._unsubs = [];
        }
      }

      _handleDeviceStateUpdate(event) {
        // 更新设备网格显示
        this.updateDeviceGrid();
      }
    }
  );
}

window.customPanelset = true; 

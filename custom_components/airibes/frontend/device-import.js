if (!customElements.get('device-import')) {
  customElements.define(
    "device-import",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this._initialized = false;
        this._hass = null;
        this.entityList = [];
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
            await this.loadEntities();
            this._initialized = true;
        } catch (error) {
            console.error('初始化导入面板失败:', error);
        }
      }

      async loadStyles() {
        const response = await fetch('/frontend_static/device-import.css');
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
                                设备导入
                            </mwc-button>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="entity-table">
                            <div class="table-header">
                                <div class="col-checkbox">
                                    <input type="checkbox" id="selectAll">
                                </div>
                                <div class="col-index">序号</div>
                                <div class="col-name">设备名称</div>
                                <div class="col-icon">图标</div>
                                <div class="col-id">实体标识</div>
                                <div class="col-room">所属房间</div>
                                <div class="col-status">状态</div>
                            </div>
                            <div class="table-body" id="entityGrid">
                                <!-- 实体列表将在这里动态生成 -->
                            </div>
                        </div>
                    </div>
                    <div class="footer-content">
                        <div class="footer-left">
                            已选择 <span id="selectedCount">0</span> 项
                        </div>
                        <div class="footer-right">
                            <mwc-button 
                                raised
                                class="import-button" 
                                id="importBtn">
                                导入
                            </mwc-button>
                        </div>
                    </div>
                </ha-card>
            </div>
        `;

        // 添加返回按钮事件监听
        const backBtn = this.shadowRoot.getElementById("back-btn");
        if (backBtn) {
            backBtn.addEventListener("click", () => {
                window.location.pathname = '/airibes_device_library';
            });
        }

        // 添加全选复选框事件监听
        const selectAll = this.shadowRoot.getElementById("selectAll");
        if (selectAll) {
            selectAll.addEventListener("change", (e) => {
                this._handleSelectAll(e.target.checked);
            });
        }

        // 添加导入按钮事件监听
        const importBtn = this.shadowRoot.getElementById("importBtn");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                this._handleImport();
            });
        }
      }

      async loadEntities() {
        try {
            // 获取所有实体
            const states = this._hass.states;
            
            // 获取已导入的设备列表
            const importedDevicesResponse = await this._hass.callWS({
                type: "airibes/get_imported_devices"
            });
            const importedDevices = new Set(
                (importedDevicesResponse?.devices || []).map(device => device.entity_id)
            );
            
            // 过滤出灯和空调实体
            this.entityList = Object.entries(states)
                .filter(([entityId, state]) => 
                    entityId.startsWith("light.") || 
                    entityId.startsWith("climate.")
                )
                .map(([entityId, state]) => ({
                    entity_id: entityId,
                    name: state.attributes.friendly_name || entityId,
                    state: state.state,
                    icon: state.attributes.icon,
                    room: state.attributes.room || '未分配',
                    imported: importedDevices.has(entityId)  // 标记是否已导入
                }));

            // 更新实体网格
            this.updateEntityGrid();

        } catch (error) {
            console.error('加载实体列表失败:', error);
        }
      }

      updateEntityGrid() {
        const entityGrid = this.shadowRoot.getElementById('entityGrid');
        if (!entityGrid) return;

        entityGrid.innerHTML = this.entityList.map((entity, index) => {
            const isLight = entity.entity_id.startsWith("light.");
            const icon = isLight ? "mdi:lightbulb" : "mdi:air-conditioner";
            
            return `
                <div class="table-row ${entity.imported ? 'imported' : ''}" data-entity-id="${entity.entity_id}">
                    <div class="col-checkbox">
                        <input type="checkbox" 
                            class="entity-checkbox" 
                            data-entity="${entity.entity_id}"
                            ${entity.imported ? 'checked disabled' : ''}
                        >
                    </div>
                    <div class="col-index">${index + 1}</div>
                    <div class="col-name">${entity.name}</div>
                    <div class="col-icon">
                        <ha-icon icon="${icon}"></ha-icon>
                    </div>
                    <div class="col-id">${entity.entity_id}</div>
                    <div class="col-room">${entity.room}</div>
                    <div class="col-status">
                        <span class="status-text ${entity.imported ? 'imported' : ''}">
                            ${entity.imported ? '已导入' : this._hass.states[entity.entity_id]?.state || 'unknown'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        // 添加复选框事件监听
        const checkboxes = entityGrid.querySelectorAll('.entity-checkbox:not([disabled])');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const entityId = e.target.dataset.entity;
                this._handleEntitySelect(entityId, e.target.checked);
                this._updateSelectedCount();
            });
        });

        // 添加行点击事件监听
        const rows = entityGrid.querySelectorAll('.table-row');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                // 如果点击的是复选框，不显示详情
                if (e.target.classList.contains('entity-checkbox')) return;
                
                const entityId = row.dataset.entityId;
                this._showEntityDetails(entityId);
            });
        });
      }

      _handleSelectAll(checked) {
        const checkboxes = this.shadowRoot.querySelectorAll('.entity-checkbox:not([disabled])');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            const entityId = checkbox.dataset.entity;
            this._handleEntitySelect(entityId, checked);
        });
        this._updateSelectedCount();
      }

      _handleEntitySelect(entityId, checked) {
        if (!this.selectedEntities) {
            this.selectedEntities = new Set();
        }
        if (checked) {
            this.selectedEntities.add(entityId);
        } else {
            this.selectedEntities.delete(entityId);
        }
      }

      _updateSelectedCount() {
        const selectedCount = this.shadowRoot.getElementById('selectedCount');
        if (selectedCount) {
            selectedCount.textContent = this.selectedEntities?.size || 0;
        }
      }

      _handleImport() {
        if (this.selectedEntities?.size > 0) {
            // 创建确认弹框
            const dialog = document.createElement('div');
            dialog.className = 'dialog-overlay';
            dialog.innerHTML = `
                <div class="dialog">
                    <div class="dialog-title">确认导入</div>
                    <div class="dialog-content">
                        确定将选中的 ${this.selectedEntities.size} 项导入到设备库吗？
                    </div>
                    <div class="dialog-buttons">
                        <mwc-button outlined id="cancelBtn">取消</mwc-button>
                        <mwc-button raised id="confirmBtn">确认</mwc-button>
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
                    // 调用后端保存导入的设备
                    await this._hass.callWS({
                        type: 'airibes/import_devices',
                        entities: Array.from(this.selectedEntities)
                    });

                    // 显示成功提示
                    this._showToast('导入成功');
                    
                    // 关闭弹框
                    dialog.remove();
                    
                    // 返回设备库页面
                    window.location.pathname = '/airibes_device_library';
                } catch (error) {
                    console.error('导入设备失败:', error);
                    this._showToast('导入失败');
                }
            });

            this.shadowRoot.appendChild(dialog);
        }
      }

      _showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        this.shadowRoot.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      }

      _showEntityDetails(entityId) {
        // 触发 Home Assistant 的实体详情弹框
        const event = new CustomEvent('hass-more-info', {
            detail: {
                entityId: entityId
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
      }
    }
  );
}

window.customPanelset = true; 
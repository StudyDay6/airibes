/** @type {module} */
import { STICKER_TYPES, AREA_TYPES } from './constants.js';
import { getTranslation } from './translations.js';
// 在文件顶部添加导入
import './preview-dialog.js';

export class ApartmentView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.resizeObserver = null;
    this.activeMenu = "room";
    this.scale = 1;
    this.canvasSize = 2000; // 默认 20m×20m

    // 添加房间相关属性
    this.isDrawing = false;
    this.startPoint = null;
    this.rooms = []; // 存储所有房间
    this.nextRoomId = 1; // 下一个可用的房间ID
    this.availableRoomIds = new Set(); // 存储可重用的房间ID
    this.selectedTool = null; // 当前选中的工具
    this.previewBox = null; // 预览框元素

    // 添加选中和编辑相关的属性
    this.selectedElement = null; // 当前选中的元素
    this.longPressTimer = null; // 长按定时器
    this.isRotating = false; // 是否正在旋转
    this.isResizing = false; // 是否正在缩放
    this.isDragging = false; // 是否正在拖动
    this.startRotation = 0; // 开始旋转的角度
    this.currentRotation = 0; // 当前旋
    this.dragStartPos = null; // 拖动���������
    this.alignmentLines = {
      // 对齐线
      vertical: null,
      horizontal: null,
    };

    // 添加区域相关属性
    this.areas = []; // 存储所有区域
    this.nextAreaId = 1; // 下一个可用的区域ID
    this.availableAreaIds = new Set(); // 存储可重用的区域ID
    this.isDraggingArea = false; // 是否正在拖动区域
    this.draggedArea = null; // 当前拖动的区域

    // 添加设备相关属性
    this.devices = []; // 存储设备列表
    this.placedDevices = []; // 存储已放置的设备

    // 添加贴纸相关属性
    this.stickers = []; // 存储已放置的贴纸
    this.nextStickerId = 1; // 下一个可用的贴纸ID
    this.availableStickerIds = new Set(); // 存储可重用的贴纸ID
    this.isDraggingSticker = false; // 是否正在拖动贴纸
    this.draggedSticker = null; // 当前拖动的贴纸

    // 添加户型相关属性
    this.apartments = null; // 存储户型列表
    this.currentApartmentId = 1; // 当前选中的户型ID
    this.currentFloorId = null; // 当前关联的楼层ID
    this.personPositions = new Map(); // 存储每个设备的人员位置
  }

  async connectedCallback() {
    // 发送户型视图可见事件
    if (this.hass) {
      await this.hass.callWS({
        type: "airibes/set_apartment_view_visible",
        visible: true,
        apartment_id: this.currentApartmentId,
      });
    }
    await this.loadStyles();
    this.render(); // 先渲染 DOM
    this.initializeCanvas();
    this.setupResizeObserver();
    await this.loadDevices(); // 加载设备数据
    await this.loadApartmentData(); // 最后加载户型数据

    // 订阅人员位置更新事件
    this.hass.connection.subscribeEvents(
      (event) => this._handlePersonPositionsUpdate(event),
      "airibes_person_positions_update"
    );
  }

  disconnectedCallback() {
    // 发送户型视图不可见事件
    if (this.hass) {
      this.hass.callWS({
        type: "airibes/set_apartment_view_visible",
        visible: false,
        apartment_id: this.currentApartmentId,
      });
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    window.removeEventListener("resize", this.handleResize);
  }

  async loadStyles() {
    const response = await fetch("/frontend_static/apartment.css");
    const style = await response.text();
    this.styles = style; // 直接使用 CSS 文件的样式，除内联样式
  }

  translate(key) {
    const translations = getTranslation(this.hass.language || "en");
    return translations[key] || key;
  }

  render() {
    // 获取翻译
    const translations = getTranslation(this.hass.language || "en");
    this.shadowRoot.innerHTML = `
        <style>${this.styles}</style>
        <div class="apartment-container">
            <div class="header">
                <mwc-button 
                    class="back-button"
                    id="back-button">
                    <ha-icon icon="mdi:chevron-left"></ha-icon>
                    ${translations.title}
                </mwc-button>
                <span class="title">${translations.edit_button}</span>
                <div class="header-buttons">
                    <mwc-button 
                        class="preview-button"
                        id="preview-button">
                        <ha-icon icon="mdi:eye"></ha-icon>
                        ${translations.preview || "Preview"}
                    </mwc-button>
                    <mwc-button 
                        class="settings-button"
                        id="settings-button">
                        <ha-icon icon="mdi:cog"></ha-icon>
                        ${translations.settings || "Settings"}
                    </mwc-button>
                    <mwc-button 
                        raised
                        class="save-button"
                        id="save-button">
                        <ha-icon icon="mdi:content-save"></ha-icon>
                        ${translations.save || "Save"}
                    </mwc-button>
                </div>
            </div>
            
            <div class="canvas-container">
                <div class="ruler-corner">0</div>
                <canvas id="topRuler" class="ruler-top"></canvas>
                <div class="canvas-wrapper">
                    <div class="canvas-content">
                        <canvas id="leftRuler" class="ruler-left"></canvas>
                        <div class="drawing-area"></div>
                    </div>
                </div>
                <div class="toolbar">
                    <div class="toolbar-menu">
                        <div class="menu-item active" data-menu="room">
                            <ha-icon icon="mdi:floor-plan"></ha-icon>
                            <span>${translations.room}</span>
                        </div>
                        <div class="menu-item" data-menu="area">
                            <ha-icon icon="mdi:shape"></ha-icon>
                            <span>${translations.area}</span>
                        </div>
                        <div class="menu-item" data-menu="sticker">
                            <ha-icon icon="mdi:sticker"></ha-icon>
                            <span>${translations.furniture}</span>
                        </div>
                        <div class="menu-item" data-menu="device">
                            <ha-icon icon="mdi:devices"></ha-icon>
                            <span>${translations.device}</span>
                        </div>
                    </div>
                    <div class="tool-content">
                        ${this.renderToolContent()}
                    </div>
                </div>
            </div>
        </div>
    `;

    // 添加返回按钮事件监听
    const backButton = this.shadowRoot.getElementById("back-button");
    if (backButton) {
      backButton.addEventListener("click", () => {
        window.location.pathname = "/airibes";
      });
    }

    // 添加预览按钮事件监听
    const previewButton = this.shadowRoot.getElementById("preview-button");
    if (previewButton) {
      previewButton.addEventListener("click", () => {
        const previewDialog = document.createElement("preview-dialog");
        // 准备预览数据
        const previewData = this.prepareDataToSave();
        previewDialog.data = previewData;
        document.body.appendChild(previewDialog);
      });
    }

    // 添�����设置按钮事件监听
    const settingsButton = this.shadowRoot.getElementById("settings-button");
    if (settingsButton) {
      settingsButton.addEventListener("click", () => {
        this.showSettingsDialog();
      });
    }

    // 添加保存按钮事件监听
    const saveButton = this.shadowRoot.getElementById("save-button");
    if (saveButton) {
      saveButton.addEventListener("click", () => {
        this.saveApartmentData();
      });
    }

    // 设置工具监听器
    this.setupToolListeners();

    // 添加菜单监听器
    this.setupMenuListeners();
  }

  setupResizeObserver() {
    // 创建 ResizeObserver 实例
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this.shadowRoot.querySelector(".canvas-wrapper")) {
          this.updateCanvasSize();
        }
      }
    });

    // 观察 canvas-wrapper 元素
    const wrapper = this.shadowRoot.querySelector(".canvas-wrapper");
    if (wrapper) {
      this.resizeObserver.observe(wrapper);
    }

    // 添加窗口 resize 事件监听
    this.handleResize = () => {
      this.updateCanvasSize();
    };
    window.addEventListener("resize", this.handleResize);
  }

  updateCanvasSize() {
    const content = this.shadowRoot.querySelector(".canvas-content");
    const wrapper = this.shadowRoot.querySelector(".canvas-wrapper");
    const topRuler = this.shadowRoot.getElementById("topRuler");
    const leftRuler = this.shadowRoot.getElementById("leftRuler");
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");

    if (content && wrapper && topRuler && leftRuler && drawingArea) {
      const size = wrapper.offsetWidth;

      // 新内容区域尺寸
      content.style.width = `${size}px`;
      content.style.height = `${size}px`;

      // 新标尺尺寸
      topRuler.width = size;
      topRuler.height = 30;
      leftRuler.width = 30;
      leftRuler.height = size;

      // 保存旧的缩放比例
      const oldScale = this.scale;
      // 计算新的缩放比例
      this.scale = size / this.canvasSize;

      // 绘制标尺
      this.drawRulers(size);

      // 创建网格画布
      let gridCanvas = drawingArea.querySelector("canvas");
      if (!gridCanvas) {
        gridCanvas = document.createElement("canvas");
        gridCanvas.style.position = "absolute";
        gridCanvas.style.top = "0";
        gridCanvas.style.left = "0";
        gridCanvas.style.width = "100%";
        gridCanvas.style.height = "100%";
        gridCanvas.style.pointerEvents = "none";
        drawingArea.appendChild(gridCanvas);
      }

      // 设置画布尺寸
      gridCanvas.width = size;
      gridCanvas.height = size;

      // 绘制网格
      this.drawGrid(gridCanvas, size);

      // 如果缩放比例发生变化，更新所有元素的显示尺寸
      if (oldScale !== this.scale) {
        // 更新房间
        this.rooms.forEach((room) => {
          const roomElement = this.shadowRoot.querySelector(
            `.room[data-room-id="${room.id}"]`
          );
          if (roomElement) {
            // 使用真实尺寸（厘米）计算新的显���尺寸
            const displayWidth = room.realWidth * this.scale;
            const displayHeight = room.realHeight * this.scale;
            const displayLeft = room.realLeft * this.scale;
            const displayTop = room.realTop * this.scale;

            roomElement.style.width = `${displayWidth}px`;
            roomElement.style.height = `${displayHeight}px`;
            roomElement.style.left = `${displayLeft}px`;
            roomElement.style.top = `${displayTop}px`;

            // 更新尺寸标签
            const widthLabel = roomElement.querySelector(".width-label");
            const heightLabel = roomElement.querySelector(".height-label");
            if (widthLabel) widthLabel.textContent = `${room.realWidth}cm`;
            if (heightLabel) heightLabel.textContent = `${room.realHeight}cm`;

            // 更新房间数据
            room.width = displayWidth;
            room.height = displayHeight;
            room.left = displayLeft;
            room.top = displayTop;
          }
        });

        // 更新区域
        this.areas.forEach((area) => {
          const areaElement = this.shadowRoot.querySelector(
            `.area[data-area-id="${area.id}"]`
          );
          if (areaElement) {
            const borderWidth = 2;
            // 使用真实尺寸（厘米）计算新的显示尺寸
            const displayWidth = area.realWidth * this.scale - borderWidth * 2;
            const displayHeight =
              area.realHeight * this.scale - borderWidth * 2;
            const displayLeft = area.realLeft * this.scale;
            const displayTop = area.realTop * this.scale;

            areaElement.style.width = `${displayWidth}px`;
            areaElement.style.height = `${displayHeight}px`;
            areaElement.style.left = `${displayLeft}px`;
            areaElement.style.top = `${displayTop}px`;

            // 更新尺寸标签
            const sizeLabel = areaElement.querySelector(".area-size");
            if (sizeLabel) {
              sizeLabel.textContent = `${area.realWidth}×${area.realHeight}`;
            }

            // 更新区域���据
            area.width = displayWidth;
            area.height = displayHeight;
            area.left = displayLeft;
            area.top = displayTop;
          }
        });

        // 更新贴纸和设备
        [...this.stickers, ...this.placedDevices].forEach((item) => {
          if (item.element) {
            // 使用真实尺寸（厘米）计算新的显示尺寸
            const displayLeft = item.realLeft * this.scale;
            const displayTop = item.realTop * this.scale;

            item.element.style.left = `${displayLeft}px`;
            item.element.style.top = `${displayTop}px`;

            // 如果是贴纸，还需要更新尺寸
            if (item.width && item.height) {
              const displayWidth = item.width * this.scale;
              const displayHeight = item.height * this.scale;
              item.element.style.width = `${displayWidth}px`;
              item.element.style.height = `${displayHeight}px`;
            }

            // 更新元素数据
            item.left = displayLeft;
            item.top = displayTop;
          }
        });

        // 更新人员位置标记
        this.drawPersonPositions();
      }
    }

    // 更新贴纸
    this.stickers.forEach(sticker => {
      if (sticker.element) {
        // 使用真实尺寸和位置计算显示尺寸和位置
        const displayWidth = sticker.realWidth * this.scale;
        const displayHeight = sticker.realHeight * this.scale;
        const displayLeft = sticker.realLeft * this.scale;
        const displayTop = sticker.realTop * this.scale;

        sticker.element.style.width = `${displayWidth}px`;
        sticker.element.style.height = `${displayHeight}px`;
        sticker.element.style.left = `${displayLeft}px`;
        sticker.element.style.top = `${displayTop}px`;

        // 更新尺寸标签
        const sizeLabel = sticker.element.querySelector(".sticker-size");
        if (sizeLabel) {
          sizeLabel.textContent = `${sticker.realWidth}×${sticker.realHeight}`;
        }

        // 更新显示尺��数据
        sticker.width = displayWidth;
        sticker.height = displayHeight;
      }
    });
  }

  updateAllElements() {
    // 更新所有房间的尺寸和位置
    this.rooms.forEach((room) => {
      const roomElement = this.shadowRoot.querySelector(
        `.room[data-room-id="${room.id}"]`
      );
      if (roomElement) {
        // 使用真实尺寸（厘米）乘以缩放比例得到显示尺寸
        const displayWidth = room.realWidth * this.scale;
        const displayHeight = room.realHeight * this.scale;
        const displayLeft =
          (room.realLeft || room.left / this.scale) * this.scale;
        const displayTop = (room.realTop || room.top / this.scale) * this.scale;

        roomElement.style.width = `${displayWidth}px`;
        roomElement.style.height = `${displayHeight}px`;
        roomElement.style.left = `${displayLeft}px`;
        roomElement.style.top = `${displayTop}px`;

        // 更新尺寸标签 - 显示真实尺寸（厘米）
        const widthLabel = roomElement.querySelector(".width-label");
        const heightLabel = roomElement.querySelector(".height-label");
        if (widthLabel) widthLabel.textContent = `${room.realWidth}cm`;
        if (heightLabel) heightLabel.textContent = `${room.realHeight}cm`;

        // 保存真实位置（厘米）
        room.realLeft = room.realLeft || room.left / this.scale;
        room.realTop = room.realTop || room.top / this.scale;
        // ����显示位置
        room.left = displayLeft;
        room.top = displayTop;
        room.width = displayWidth;
        room.height = displayHeight;
      }
    });

    // 更新所有区域的尺寸和位置
    this.areas.forEach((area) => {
      const areaElement = this.shadowRoot.querySelector(
        `.area[data-area-id="${area.id}"]`
      );
      if (areaElement) {
        const borderWidth = 2;
        const displayWidth = area.realWidth * this.scale - borderWidth * 2;
        const displayHeight = area.realHeight * this.scale - borderWidth * 2;
        const displayLeft =
          (area.realLeft || area.left / this.scale) * this.scale;
        const displayTop = (area.realTop || area.top / this.scale) * this.scale;

        areaElement.style.width = `${displayWidth}px`;
        areaElement.style.height = `${displayHeight}px`;
        areaElement.style.left = `${displayLeft}px`;
        areaElement.style.top = `${displayTop}px`;

        // 更新尺寸标签
        const sizeLabel = areaElement.querySelector(".area-size");
        if (sizeLabel) {
          sizeLabel.textContent = `${area.realWidth}×${area.realHeight}`;
        }

        // ���存���实位置（厘米）
        area.realLeft = area.realLeft || area.left / this.scale;
        area.realTop = area.realTop || area.top / this.scale;
        // 更新显示位
        area.left = displayLeft;
        area.top = displayTop;
        area.width = displayWidth;
        area.height = displayHeight;
      }
    });

    // 更新所有贴纸和设备的位置
    [...this.stickers, ...this.placedDevices].forEach((item) => {
      const element = item.element;
      if (element) {
        const realLeft =
          item.realLeft || parseFloat(element.style.left) / this.scale;
        const realTop =
          item.realTop || parseFloat(element.style.top) / this.scale;
        const displayLeft = realLeft * this.scale;
        const displayTop = realTop * this.scale;

        element.style.left = `${displayLeft}px`;
        element.style.top = `${displayTop}px`;

        // 保存真实位置（厘米）
        item.realLeft = realLeft;
        item.realTop = realTop;
      }
    });
  }

  drawRulers(size) {
    this.drawTopRuler(size);
    this.drawLeftRuler(size);
  }

  drawTopRuler(size) {
    const ruler = this.shadowRoot.getElementById("topRuler");
    const ctx = ruler.getContext("2d");
    const scale = size / this.canvasSize;

    // 清空标尺
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, ruler.width, ruler.height);

    ctx.beginPath();
    ctx.strokeStyle = "#000";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = "#000";

    // 绘制大刻度和数字（每100cm，显示为1-20米）
    for (let i = 0; i <= this.canvasSize; i += 100) {
      const x = i * scale;
      ctx.moveTo(x, ruler.height);
      ctx.lineTo(x, ruler.height - 10);
      if (i !== 0) {
        ctx.fillText(`${i / 100}`, x, 12);
      }
    }

    // 绘制小刻度（每10cm）
    for (let i = 0; i <= this.canvasSize; i += 10) {
      if (i % 100 !== 0) {
        const x = i * scale;
        ctx.moveTo(x, ruler.height);
        ctx.lineTo(x, ruler.height - 5);
      }
    }

    ctx.stroke();
  }

  drawLeftRuler(size) {
    const ruler = this.shadowRoot.getElementById("leftRuler");
    const ctx = ruler.getContext("2d");
    const scale = size / this.canvasSize;

    // 清空标尺
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, ruler.width, ruler.height);

    ctx.beginPath();
    ctx.strokeStyle = "#000";
    ctx.font = "10px Arial";
    ctx.textAlign = "right";
    ctx.fillStyle = "#000";

    // 绘制大刻度和数字（每100cm，显示为1-20米）
    for (let i = 0; i <= this.canvasSize; i += 100) {
      const y = i * scale;
      ctx.moveTo(ruler.width, y);
      ctx.lineTo(ruler.width - 10, y);
      if (i !== 0) {
        ctx.save();
        ctx.translate(ruler.width - 12, y + 4);
        ctx.fillText(`${i / 100}`, 0, 0);
        ctx.restore();
      }
    }

    // 绘制小刻度（每10cm）
    for (let i = 0; i <= this.canvasSize; i += 10) {
      if (i % 100 !== 0) {
        const y = i * scale;
        ctx.moveTo(ruler.width, y);
        ctx.lineTo(ruler.width - 5, y);
      }
    }

    ctx.stroke();
  }

  setupMenuListeners() {
    const menuItems = this.shadowRoot.querySelectorAll(".menu-item");
    menuItems.forEach((item) => {
      item.addEventListener("click", () => {
        this.switchMenu(item.dataset.menu);
      });
    });
  }

  switchMenu(menuName) {
    // 更新��活状态
    this.activeMenu = menuName;
    console.log("当前激活菜单:", this.activeMenu);
    // 更新菜单样式
    const menuItems = this.shadowRoot.querySelectorAll(".menu-item");
    menuItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.menu === menuName);
    });

    // 更新内容域
    const toolContent = this.shadowRoot.querySelector(".tool-content");
    toolContent.innerHTML = this.renderToolContent();

    // 重新设置工具监听器
    this.setupToolListeners();

    // 重置选工具
    this.selectedTool = null;
    this.updateCursor();
  }

  renderToolContent() {
    const translations = getTranslation(this.hass.language || "en");
    switch (this.activeMenu) {
      case "room":
        return `
                    <div class="tool-grid two-columns">
                        <div class="tool-item" data-type="regular-room">
                            <ha-icon icon="mdi:square-outline"></ha-icon>
                            <span>${translations.rectangular_room}</span>
                        </div>
                        <div class="tool-item" data-type="irregular-room">
                            <ha-icon icon="mdi:vector-polygon"></ha-icon>
                            <span>${translations.irregular_room}</span>
                        </div>
                    </div>
                `;
      case "area":
        return `
                    <div class="tool-grid two-columns">
                        <div class="tool-item" data-type="monitor-area">
                            <ha-icon icon="mdi:map-marker-radius"></ha-icon>
                            <span>${translations.monitoring_area}</span>
                        </div>
                        <div class="tool-item" data-type="interference-area">
                            <ha-icon icon="mdi:alert-circle"></ha-icon>
                            <span>${translations.interference_source}</span>
                        </div>
                    </div>
                `;
      case "device":
        if (this.devices.length === 0) {
          return `
                        <div class="empty-content">
                            <span>${translations.no_available_device}</span>
                        </div>
                    `;
        }
        return `
                    <div class="tool-grid device-grid">
                        ${this.devices
                          .map((device) => {
                            // 检查设备是否已放置
                            const isPlaced = this.placedDevices.some(
                              (pd) => pd.id === device.device_id
                            );
                            let icon,
                              iconStyle = "";
                            switch (device.type) {
                              case "radar":
                                icon = "mdi:radar";
                                break;
                              case "light":
                                icon = "mdi:lightbulb";
                                iconStyle = "color: var(--warning-color);"; // 灯泡使用黄色
                                break;
                              case "climate":
                                icon = "mdi:air-conditioner";
                                iconStyle = "color: var(--info-color);"; // 空调使用蓝色
                                break;
                              default:
                                icon = "mdi:help-circle"; // 默认图标
                            }

                              return `
                                <div class="tool-item device-item ${isPlaced ? "disabled" : ""}" 
                                    data-device-id="${device.device_id}">
                                    <ha-icon icon="${icon}" style="${iconStyle}"></ha-icon>
                                    <span>${device.displayName}</span>
                                </div>
                            `;
                          })
                          .join("")}
                    </div>
                `;
      case "sticker":
        return `
                    <div class="tool-grid two-columns">
                        ${Object.entries(STICKER_TYPES)
                          .map(
                            ([type, info]) => `
                            <div class="tool-item sticker-item" data-sticker-type="${type}">
                                <ha-icon icon="${info.icon}"></ha-icon>
                                <span>${info.name}</span>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                `;
      default:
        return '<div class="empty-content">暂无内容</div>';
    }
  }

  initializeCanvas() {
    const content = this.shadowRoot.querySelector(".canvas-content");
    const wrapper = this.shadowRoot.querySelector(".canvas-wrapper");

    if (content && wrapper) {
      const size = wrapper.offsetWidth;
      content.style.width = `${size}px`;
      content.style.height = `${size}px`;
    }
  }

  // 修改 showSettingsDialog 方法
  showSettingsDialog() {
    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";

    // 根据当前 canvasSize 确定选中的尺寸
    let currentSize;
    switch (this.canvasSize) {
      case 500:
        currentSize = "5x5";
        break;
      case 1000:
        currentSize = "10x10";
        break;
      case 2000:
        currentSize = "20x20";
        break;
      default:
        currentSize = "custom";
    }

    dialog.innerHTML = `
        <div class="dialog">
            <div class="dialog-title">设置户型空间</div>
            <div class="dialog-content">
                <div class="form-field">
                    <div class="form-row apartment-select-row">
                        <label>选择户型</label>
                        <div class="apartment-select-container">
                            <select id="apartment-select">
                                ${
                                  this.apartments
                                    ?.map(
                                      (apt, index) => `
                                    <option value="${apt.id}" ${
                                        apt.id === this.currentApartmentId
                                          ? "selected"
                                          : ""
                                      }>
                                        ${apt.name || `户型${index + 1}`}
                                    </option>
                                `
                                    )
                                    .join("") ||
                                  '<option value="1">户型一</option>'
                                }
                            </select>
                            <mwc-button class="add-apartment-button" id="add-apartment-button">
                                <ha-icon icon="mdi:plus"></ha-icon>
                            </mwc-button>
                        </div>
                    </div>
                </div>
                <div class="form-field">
                    <div class="form-row">
                        <label>空间名称</label>
                        <input type="text" id="space-name" placeholder="我的户型方案">
                    </div>
                </div>
                <div class="form-field">
                    <label>选择可编辑空间区域大小</label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="space-size" value="5x5" ${
                              currentSize === "5x5" ? "checked" : ""
                            }>
                            5m×5m
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="space-size" value="10x10" ${
                              currentSize === "10x10" ? "checked" : ""
                            }>
                            10m×10m
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="space-size" value="20x20" ${
                              currentSize === "20x20" ? "checked" : ""
                            }>
                            20m×20m
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="space-size" value="custom" ${
                              currentSize === "custom" ? "checked" : ""
                            }>
                            自定义
                        </label>
                    </div>
                </div>
                <div class="custom-size-fields" style="display: ${
                  currentSize === "custom" ? "block" : "none"
                };">
                    <div class="form-field size-input">
                        <label>W</label>
                        <input type="number" id="custom-size" placeholder="输入尺寸" value="${
                          this.canvasSize / 100
                        }" min="5">
                        <span>m</span>
                    </div>
                </div>
                <div class="form-field">
                    <div class="form-row">
                        <label>户型图风格</label>
                        <select id="style-select">
                            <option value="default">默认风格</option>
                        </select>
                    </div>
                </div>
                <div class="form-field">
                    <label class="switch-label">
                        <span>辅助说明</span>
                        <ha-switch id="help-switch"></ha-switch>
                    </label>
                </div>
            </div>
            <div class="dialog-buttons">
                <mwc-button outlined id="cancel-button">取消</mwc-button>
                <mwc-button raised id="confirm-button">确定</mwc-button>
            </div>
        </div>
    `;

    // 添加户型选择和新增户型的事件处理
    const addApartmentBtn = dialog.querySelector("#add-apartment-button");
    const apartmentSelect = dialog.querySelector("#apartment-select");
    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");
    const customSizeFields = dialog.querySelector(".custom-size-fields");
    const helpSwitch = dialog.querySelector("#help-switch");
    const spaceNameInput = dialog.querySelector("#space-name");

    // 添加自定义尺寸显示/隐藏处理
    const radioInputs = dialog.querySelectorAll('input[name="space-size"]');
    radioInputs.forEach((input) => {
      input.addEventListener("change", (e) => {
        customSizeFields.style.display =
          e.target.value === "custom" ? "block" : "none";
      });
    });

    // 新增户型按钮事件
    addApartmentBtn.addEventListener("click", () => {
      this.showAddApartmentDialog();
    });

    // 户型选择事件
    apartmentSelect.addEventListener("change", (e) => {
      const apartmentId = parseInt(e.target.value);
      this.switchApartment(apartmentId);
    });

    // 取消按钮事件
    cancelBtn.addEventListener("click", () => {
      dialog.remove();
    });

    // 确定按钮事件
    confirmBtn.addEventListener("click", () => {
      // 获取选中的尺寸
      const selectedSize = dialog.querySelector(
        'input[name="space-size"]:checked'
      )?.value;
      let newSize = this.canvasSize;

      // 根据选择设置画布尺寸
      switch (selectedSize) {
        case "5x5":
          newSize = 500;
          break;
        case "10x10":
          newSize = 1000;
          break;
        case "20x20":
          newSize = 2000;
          break;
        case "custom":
          const customSize = parseInt(
            dialog.querySelector("#custom-size").value
          );
          if (customSize && customSize >= 5) {
            newSize = customSize * 100;
          }
          break;
      }

      // 更新画布尺寸
      if (newSize !== this.canvasSize) {
        this.canvasSize = newSize;
        this.updateCanvasSize();
      }

      // 更新辅助说明设��
      const showHelp = helpSwitch.checked;
      // TODO: 处理辅助说明设置

      // 更新空间名称
      const spaceName = spaceNameInput.value.trim();
      if (spaceName) {
        // TODO: 处理空间名称更新
      }

      dialog.remove();
      this.showToast("设置已保存");
    });

    this.shadowRoot.appendChild(dialog);
  }

  // 添加更新户型楼层关联的方法
  async updateApartmentFloor(apartmentId, floorId) {
    try {
      await this.hass.callWS({
        type: "airibes/update_apartment_floor",
        apartment_id: apartmentId,
        floor_id: floorId,
      });

      this.currentFloorId = floorId;
      this.showToast("更新楼层关联成功");
    } catch (error) {
      console.error("更新楼层关联失败:", error);
      this.showToast("更新楼层关联失败");
    }
  }

  // 添加新增户型对话框
  showAddApartmentDialog() {
    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
        <div class="dialog">
            <div class="dialog-title">新增户型</div>
            <div class="dialog-content">
                <div class="form-field">
                    <label>户型名称</label>
                    <input type="text" id="new-apartment-name" placeholder="输入户型名称">
                </div>
            </div>
            <div class="dialog-buttons">
                <mwc-button outlined id="cancel-button">取消</mwc-button>
                <mwc-button raised id="confirm-button">确定</mwc-button>
            </div>
        </div>
    `;

    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");
    const nameInput = dialog.querySelector("#new-apartment-name");

    cancelBtn.addEventListener("click", () => dialog.remove());
    confirmBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (name) {
        await this.addNewApartment(name);
        dialog.remove();
      }
    });

    this.shadowRoot.appendChild(dialog);
  }

  // 添加切换户型的方法
  async switchApartment(apartmentId) {
    try {
      const response = await this.hass.callWS({
        type: "airibes/load_apartment_data",
        apartment_id: apartmentId,
      });
      if (response && response.data) {
        this.currentApartmentId = apartmentId;
        // 更新当前楼层ID
        const apartment = this.apartments.find((apt) => apt.id === apartmentId);
        if (apartment) {
          this.currentFloorId = apartment.floor_id;
        }
        await this.restoreApartmentData(response.data);
      }
    } catch (error) {
      this.showToast(this.translate("switch_apartment_failed"));
    }
  }

  // 添加新增户型的方法
  async addNewApartment(name) {
    try {
      const response = await this.hass.callWS({
        type: "airibes/add_apartment",
        name: name,
      });

      if (response && response.id) {
        // 更新户型列表
        if (!this.apartments) {
          this.apartments = [];
        }
        this.apartments.push({
          id: response.id,
          name: name,
        });

        // 切换到新户型
        await this.switchApartment(response.id);
        this.showToast(this.translate("add_apartment_success"));
      }
    } catch (error) {
      this.showToast(this.translate("add_apartment_failed"));
    }
  }

  drawGrid(canvas, size) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 计算格大小：1米 = 4格，每格25cm
    const pixelsPerMeter = size / (this.canvasSize / 100); // 每米对应的像素数
    const gridSize = pixelsPerMeter / 4; // 每格（25cm）对应的像素数

    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 1;

    // 绘制垂线
    for (let x = 0; x <= size; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
    }

    // 绘水平线
    for (let y = 0; y <= size; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
    }

    ctx.stroke();
  }

  setupToolListeners() {
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    if (drawingArea) {
      // 获取所有工具项
      const allToolItems = this.shadowRoot.querySelectorAll(".tool-item");

      // 添加长按���态跟踪
      this.isLongPress = false;
      this.pressStartTime = 0;
      this.pressedElement = null;

      // 处理工具项点击事件
      allToolItems.forEach((item) => {
        // 添加鼠标按下事件
        item.addEventListener("mousedown", (e) => {
          // 如果是设备项且未被禁用，则处理拖��
          if (
            item.classList.contains("device-item") &&
            !item.classList.contains("disabled")
          ) {
            const deviceId = item.dataset.deviceId;
            if (deviceId) {
              this.startDraggingDevice(e, deviceId);
            }
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // 如果是区域工具，处理区域拖动
          if (
            item.dataset.type === "monitor-area" ||
            item.dataset.type === "interference-area"
          ) {
            this.startDraggingArea(e, item.dataset.type);
            e.preventDefault();
            e.stopPropagation();
            return;
          }

          // 其他工具项的点击处理
          allToolItems.forEach((t) => t.classList.remove("selected"));

          if (this.selectedTool === item.dataset.type) {
            // 如果点击已选中的工具，取消选中
            this.selectedTool = null;
          } else {
            // 选中新工具
            item.classList.add("selected");
            this.selectedTool = item.dataset.type;
          }

          // 更新光标样式
          this.updateCursor();
        });
      });

      // 修改画布的mousedown事件处理
      drawingArea.addEventListener("mousedown", (e) => {
        const roomElement = e.target.closest(".room");
        const areaElement = e.target.closest(".area");
        const deviceElement = e.target.closest(".device-element");
        const stickerElement = e.target.closest(".sticker-element");

        if (roomElement || areaElement || deviceElement || stickerElement) {
          const element =
            roomElement || areaElement || deviceElement || stickerElement;

          // 如果点击是控制按钮，不处理
          if (e.target.closest(".control-button")) {
            return;
          }

          // 记录按下的时间和元素
          this.pressStartTime = Date.now();
          this.pressedElement = element;
          this.isLongPress = false;

          // 开始长按计时
          this.longPressTimer = setTimeout(() => {
            // 只有在鼠标还在按下状态时才触发长按
            if (this.pressedElement === element) {
              this.isLongPress = true;
              this.selectElement(element);
              // 取消选中的工具
              const toolItems = this.shadowRoot.querySelectorAll(".tool-item");
              toolItems.forEach((t) => t.classList.remove("selected"));
              this.selectedTool = null;
              this.updateCursor();
            }
          }, 500);

          // 如果元素已经被选中，直接开始拖动
          if (element === this.selectedElement) {
            this.isDragging = true;
            this.dragStartPos = {
              x: e.clientX,
              y: e.clientY,
              left: element.offsetLeft,
              top: element.offsetTop,
            };
            // 创建对齐线
            this.createAlignmentLines();
          }

          e.preventDefault();
        } else if (this.selectedTool === "regular-room") {
          // 如果选中了规则房间工具，开始��制
          this.handleDrawingStart(e);
        }
      });

      // 修改画布的mouseup事件��理
      drawingArea.addEventListener("mouseup", (e) => {
        // 清除长按计时器
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }

        // 重置长按状态
        this.pressStartTime = 0;
        this.pressedElement = null;

        if (this.isDrawing) {
          this.handleDrawingEnd(e);
        }

        if (this.isDragging) {
          this.isDragging = false;
          this.dragStartPos = null;

          // 隐藏对齐线
          this.hideVerticalAlignmentLine();
          this.hideHorizontalAlignmentLine();
        }

        // 移除取消选中的逻辑，只在点击空白区域时取消选中
        // if (!this.isLongPress && !this.isDragging && this.selectedElement) {
        //     this.selectedElement.classList.remove('selected');
        //     this.removeEditControls();
        //     this.selectedElement = null;
        //     this.updateCursor();
        // }
      });

      // 修改画布的mouseleave事件处理
      drawingArea.addEventListener("mouseleave", (e) => {
        // 清除长按计时器
        if (this.longPressTimer) {
          clearTimeout(this.longPressTimer);
          this.longPressTimer = null;
        }

        // 重置长按状态
        this.isLongPress = false;
        this.pressStartTime = 0;
        this.pressedElement = null;

        if (this.isDrawing) {
          this.handleDrawingCancel(e);
        }
      });

      // 修改画布的click事件处理
      drawingArea.addEventListener("click", (e) => {
        // 如果点击的是元素或其控制按钮，不取消选中
        if (
          e.target.closest(".room") ||
          e.target.closest(".area") ||
          e.target.closest(".device-element") ||
          e.target.closest(".sticker-element") ||
          e.target.closest(".control-button")
        ) {
          return;
        }

        // 点击空白区域时取消选中
        if (this.selectedElement) {
          // 在取选����前更新元素的真实位置
          if (this.selectedElement.classList.contains("room")) {
            const roomId = parseInt(this.selectedElement.dataset.roomId);
            const room = this.rooms.find((r) => r.id === roomId);
            if (room) {
              room.realLeft =
                parseFloat(this.selectedElement.style.left) / this.scale;
              room.realTop =
                parseFloat(this.selectedElement.style.top) / this.scale;
            }
          } else if (this.selectedElement.classList.contains("area")) {
            const areaId = parseInt(this.selectedElement.dataset.areaId);
            const area = this.areas.find((a) => a.id === areaId);
            if (area) {
              area.realLeft =
                parseFloat(this.selectedElement.style.left) / this.scale;
              area.realTop =
                parseFloat(this.selectedElement.style.top) / this.scale;
            }
          } else if (
            this.selectedElement.classList.contains("device-element")
          ) {
            const deviceId = this.selectedElement.dataset.deviceId;
            const device = this.placedDevices.find((d) => d.id === deviceId);
            if (device) {
              device.realLeft =
                parseFloat(this.selectedElement.style.left) / this.scale;
              device.realTop =
                parseFloat(this.selectedElement.style.top) / this.scale;
            }
          } else if (
            this.selectedElement.classList.contains("sticker-element")
          ) {
            const stickerId = parseInt(this.selectedElement.dataset.stickerId);
            const sticker = this.stickers.find((s) => s.id === stickerId);
            if (sticker) {
              sticker.realLeft =
                parseFloat(this.selectedElement.style.left) / this.scale;
              sticker.realTop =
                parseFloat(this.selectedElement.style.top) / this.scale;
            }
          }

          this.selectedElement.classList.remove("selected");
          this.removeEditControls();
          this.selectedElement = null;
          this.updateCursor();
        }
      });

      // 添加贴纸拖动功���
      const stickerItems = this.shadowRoot.querySelectorAll(".sticker-item");
      stickerItems.forEach((item) => {
        item.addEventListener("mousedown", (e) => {
          const stickerType = item.dataset.stickerType;
          if (stickerType) {
            this.startDraggingSticker(e, stickerType);
            e.preventDefault();
            e.stopPropagation();
          }
        });
      });
    }
  }

  updateCursor() {
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    if (drawingArea) {
      if (this.selectedTool === "regular-room") {
        drawingArea.style.cursor = "crosshair";
      } else if (this.selectedElement) {
        drawingArea.style.cursor = "move"; 
      } else {
        drawingArea.style.cursor = "default";
      }
      // console.log("更新光标样式:", drawingArea.style.cursor); // 添加日志
    }
  }

  handleDrawingStart(e) {
    if (this.selectedTool !== "regular-room") return;

    const rect = e.target.getBoundingClientRect();
    this.startPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    this.isDrawing = true;

    // 清除所有现有的预览框
    this.clearAllPreviewBoxes();

    // 创���预览框
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    this.previewBox = document.createElement("div");
    this.previewBox.className = "preview-box";
    drawingArea.appendChild(this.previewBox);

    // 设置预览框的初始���置
    this.previewBox.style.cssText = `
        position: absolute;
        left: ${this.startPoint.x}px;
        top: ${this.startPoint.y}px;
        width: 0;
        height: 0;
        border: 2px solid var(--primary-color);
        background-color: rgba(var(--rgb-primary-color), 0.1);
        pointer-events: none;
        z-index: 10;
        display: block;
    `;

    // 添加鼠标移动事件监听
    document.addEventListener("mousemove", this.handleDrawingMove.bind(this));
    // 添加鼠标松开事件监听
    document.addEventListener("mouseup", this.handleDrawingEnd.bind(this));
  }

  handleDrawingMove(e) {
    if (!this.isDrawing || !this.startPoint || !this.previewBox) return;

    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    const rect = drawingArea.getBoundingClientRect();
    const currentPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // 计算预览框的位置和尺寸
    const width = Math.abs(currentPoint.x - this.startPoint.x);
    const height = Math.abs(currentPoint.y - this.startPoint.y);
    const left = Math.min(currentPoint.x, this.startPoint.x);
    const top = Math.min(currentPoint.y, this.startPoint.y);

    // 转换为实际尺寸（厘米）
    const realWidth = Math.round(width / this.scale);
    const realHeight = Math.round(height / this.scale);

    // 检查最小尺（50cm）
    const isInvalid = realWidth < 100 || realHeight < 100;

    // 更新���览框位置、���寸和样式
    this.previewBox.style.cssText = `
        position: absolute;
        left: ${left}px;
        top: ${top}px;
        width: ${width}px;
        height: ${height}px;
        border: 2px dashed ${
          isInvalid ? "var(--error-color)" : "var(--primary-color)"
        };
        background-color: ${
          isInvalid
            ? "rgba(var(--rgb-error-color), 0.1)"
            : "rgba(var(--rgb-primary-color), 0.1)"
        };
        pointer-events: none;
        z-index: 10;
        display: block;
    `;

    // 更新��寸标签，使用更紧凑的布局
    this.previewBox.innerHTML = `
        <div class="size-label width-label">${realWidth}cm</div>
        <div class="size-label height-label">${realHeight}cm</div>
    `;
  }

  handleDrawingEnd(e) {
    if (!this.isDrawing) return;

    // 移除事件监听
    document.removeEventListener("mousemove", this.handleDrawingMove);
    document.removeEventListener("mouseup", this.handleDrawingEnd);

    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    const rect = drawingArea.getBoundingClientRect();
    const endPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    // 创建房间
    this.createRoom(endPoint);

    // 清理
    this.isDrawing = false;
    this.startPoint = null;
    this.clearAllPreviewBoxes();
  }

  handleDrawingCancel(e) {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.startPoint = null;
      this.clearAllPreviewBoxes();
    }
  }

  clearAllPreviewBoxes() {
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    if (drawingArea) {
      const previewBoxes = drawingArea.querySelectorAll(".preview-box");
      previewBoxes.forEach((box) => box.remove());
      this.previewBox = null;
    }
  }

  // 修改 createRoom 方法
  createRoom(endPoint) {
    const width = Math.abs(endPoint.x - this.startPoint.x);
    const height = Math.abs(endPoint.y - this.startPoint.y);
    const left = Math.min(endPoint.x, this.startPoint.x);
    const top = Math.min(endPoint.y, this.startPoint.y);

    // 转换为实际尺寸（厘米）
    const realWidth = Math.round(width / this.scale);
    const realHeight = Math.round(height / this.scale);
    const realLeft = Math.round(left / this.scale);
    const realTop = Math.round(top / this.scale);

    // 检查最小尺寸（改为50cm）
    if (realWidth < 100 || realHeight < 100) return;

    // 检查重叠
    if (
      this.checkRoomOverlap({
        left: left,
        top: top,
        width: width,
        height: height,
      })
    )
      return;

    // 获取可用��房间ID
    const roomId = this.getNextRoomId();

    // 创建房间元素
    const room = {
      id: roomId,
      type: "regular",
      name: `房间${roomId}`,
      left: left,
      top: top,
      width: width,
      height: height,
      realWidth: realWidth,
      realHeight: realHeight,
      realLeft: realLeft,
      realTop: realTop,
    };

    this.rooms.push(room);
    this.drawRoom(room);
  }

  getNextRoomId() {
    // 优先使用已回收的ID
    if (this.availableRoomIds.size > 0) {
      const id = Math.min(...this.availableRoomIds);
      this.availableRoomIds.delete(id);
      return id;
    }

    // 如果没有可用的回收ID，使用新ID
    const id = this.nextRoomId;
    this.nextRoomId = (this.nextRoomId % 100) + 1;
    return id;
  }

  recycleRoomId(id) {
    if (id >= 1 && id <= 100) {
      this.availableRoomIds.add(id);
    }
  }

  drawRoom(room) {
    const roomElement = document.createElement("div");
    roomElement.className = "room";
    roomElement.dataset.roomId = room.id;
    roomElement.style.left = `${room.left}px`;
    roomElement.style.top = `${room.top}px`;
    roomElement.style.width = `${room.width}px`;
    roomElement.style.height = `${room.height}px`;

    // 添加尺寸标签
    roomElement.innerHTML = `
            <div class="size-label width-label">${room.realWidth}cm</div>
            <div class="size-label height-label">${room.realHeight}cm</div>
            <div class="room-name">${room.name}</div>
        `;

    this.shadowRoot.querySelector(".drawing-area").appendChild(roomElement);
  }

  // 修改 checkRoomOverlap 方法
  checkRoomOverlap(newRoom) {
    // 暂时返回 false，����查重叠
    return false;

    /* 注释掉原有的重叠检查代码
    return this.rooms.some(room => {
        // 获取房间的当���DOM元素位置
        const roomElement = this.shadowRoot.querySelector(`.room[data-room-id="${room.id}"]`);
        if (!roomElement) return false;

        // 使用真实位置（���米）计算显���位置
        const currentLeft = room.realLeft * this.scale;
        const currentTop = room.realTop * this.scale;
        const currentWidth = room.realWidth * this.scale;
        const currentHeight = room.realHeight * this.scale;

        // 检查重叠
        return !(newRoom.left + newRoom.width <= currentLeft ||
            newRoom.left >= currentLeft + currentWidth ||
            newRoom.top + newRoom.height <= currentTop ||
            newRoom.top >= currentTop + currentHeight);
    });
    */
  }

  // 添加长按事件处理
  handleLongPress(element, e) {
    this.longPressTimer = setTimeout(() => {
      this.selectElement(element);
    }, 500); // 500ms 长按时间
  }

  // 选中元素
  selectElement(element) {
    // 取��之前的选中
    if (this.selectedElement) {
      this.selectedElement.classList.remove("selected");
      this.removeEditControls();
    }

    // 选中新元素
    this.selectedElement = element;
    element.classList.add("selected");

    // 根据元素类型添加不同的编辑控件
    if (element.classList.contains("room")) {
      this.addEditControls(element, "room");
    } else if (element.classList.contains("area")) {
      this.addEditControls(element, "area");
    } else if (element.classList.contains("device-element")) {
      this.addEditControls(element, "device");
    } else if (element.classList.contains("sticker-element")) {
      this.addEditControls(element, "sticker");
    }

    // 更新光标样式
    this.updateCursor();
  }

  // 添加编辑控件
  addEditControls(element, type) {
    const controls = document.createElement("div");
    controls.className = "edit-controls";
    controls.innerHTML = `
            <div class="control-button rotate-button">
                <ha-icon icon="mdi:rotate-right"></ha-icon>
            </div>
            <div class="control-button edit-button">
                <ha-icon icon="mdi:pencil"></ha-icon>
            </div>
            <div class="control-button delete-button">
                <ha-icon icon="mdi:delete"></ha-icon>
            </div>
            <div class="control-button resize-button">
                <ha-icon icon="mdi:arrow-expand-all"></ha-icon>
            </div>
        `;

    element.appendChild(controls);
    this.setupControlButtons(element, controls, type);
  }

  // 设置控制按件
  setupControlButtons(element, controls, type) {
    const rotateBtn = controls.querySelector(".rotate-button");
    const editBtn = controls.querySelector(".edit-button");
    const deleteBtn = controls.querySelector(".delete-button");
    const resizeBtn = controls.querySelector(".resize-button");

    // 根据元素类型决定是否显示旋转按钮
    if (type === "room" || type === "area" || 
        (type === "sticker" && element.dataset.stickerType === "door")) {
        rotateBtn.style.display = "none"; // 房间、区域和门不显示旋转按钮
    } else {
      rotateBtn.style.display = "flex"; // 贴纸和设备显示旋转按钮
      // 旋转按钮事件
      rotateBtn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        this.isRotating = true;

        // 获取元素中��点
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 计算初始角度
        this.startRotation = Math.atan2(
          e.clientY - centerY,
          e.clientX - centerX
        );

        // 获取当前旋转角度
        const currentTransform = element.style.transform;
        this.currentRotation = currentTransform
          ? parseInt(
              currentTransform.match(/rotate\(([-\d.]+)deg\)/)?.[1] || "0"
            )
          : 0;

        // 更新设备或贴纸的旋转属性
        if (element.classList.contains("device-element")) {
          const deviceId = element.dataset.deviceId;
          const device = this.placedDevices.find((d) => d.id === deviceId);
          if (device) {
            device.rotation = this.currentRotation;
          }
        } else if (element.classList.contains("sticker-element")) {
          const stickerId = parseInt(element.dataset.stickerId);
          const sticker = this.stickers.find((s) => s.id === stickerId);
          if (sticker) {
            sticker.rotation = this.currentRotation;
          }
        }
      });
    }

    // 添加全局鼠标移动事件处理
    document.addEventListener("mousemove", (e) => {
      if (this.isRotating && this.selectedElement) {
        const rect = this.selectedElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // 计算当前角度（相对于中心点）
        const currentAngle = Math.atan2(
            e.clientY - centerY,
            e.clientX - centerX
        );
        
        // 计算旋转角度差值
        let rotation = (currentAngle - this.startRotation) * (180 / Math.PI);
        // 将负角度转换为正角度 (例如 -90 变为 270)
        if (rotation < 0) {
            rotation += 360;
        }

        // 更新元素的旋转
        this.selectedElement.style.transform = `rotate(${rotation}deg)`;

        // 更新设备或贴纸的旋转属性
        if (this.selectedElement.classList.contains("device-element")) {
            const deviceId = this.selectedElement.dataset.deviceId;
            const device = this.placedDevices.find((d) => d.id === deviceId);
            if (device) {
                device.rotation = rotation;
            }
        } else if (this.selectedElement.classList.contains("sticker-element")) {
            const stickerId = parseInt(this.selectedElement.dataset.stickerId);
            const sticker = this.stickers.find((s) => s.id === stickerId);
            if (sticker) {
                sticker.rotation = rotation;
            }
        }
    }
  });

    // 编辑按钮事件
    editBtn.addEventListener("click", (e) => {
      if (type === "room") {
        this.showEditDialog(element);
      } else if (type === "area") {
        this.showAreaEditDialog(element);
      } else if (type === "device") {
        this.showDeviceEditDialog(element);
      }
      e.stopPropagation();
    });

    // 删除按钮事件
    deleteBtn.addEventListener("click", (e) => {
      this.showDeleteConfirmDialog(element, type);
      e.stopPropagation();
    });

    // 缩放按钮事件
    resizeBtn.addEventListener("mousedown", (e) => {
      this.isResizing = true;
      this.resizeStartPos = {
        x: e.clientX,
        y: e.clientY,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
      e.stopPropagation();
    });

    // 添加全局鼠标事件监听
    document.addEventListener(
      "mousemove",
      this.handleGlobalMouseMove.bind(this)
    );
    document.addEventListener("mouseup", this.handleGlobalMouseUp.bind(this));
  }

  // 获取旋角度
  getRotationAngle(element, event) {
    const rect = element.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    return Math.atan2(event.clientY - center.y, event.clientX - center.x);
  }

  // 显示编辑对框
  showEditDialog(element) {
    // 获取房间数据
    const roomId = parseInt(element.dataset.roomId);
    const room = this.rooms.find((r) => r.id === roomId);

    // 获取当前颜色
    const currentColor =
      room?.color || element.style.backgroundColor || "#ffffff";

    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
        <div class="dialog">
            <div class="dialog-title">编辑房间</div>
            <div class="dialog-content">
                <div class="form-field">
                    <label>房间名称</label>
                    <input type="text" id="room-name" value="${
                      room ? room.name : ""
                    }" placeholder="输入房间名称">
                </div>
                <div class="form-field">
                    <label>房间颜色</label>
                    <div class="color-field">
                        <input type="color" id="room-color" class="color-input" value="${currentColor}">
                        <div class="color-preview" style="background-color: ${currentColor}"></div>
                        <span class="color-value">${currentColor}</span>
                    </div>
                </div>
            </div>
            <div class="dialog-buttons">
                <mwc-button outlined id="cancel-button">取消</mwc-button>
                <mwc-button raised id="confirm-button">确定</mwc-button>
            </div>
        </div>
    `;

    // 添加颜色变化事件
    const colorInput = dialog.querySelector("#room-color");
    const colorPreview = dialog.querySelector(".color-preview");
    const colorValue = dialog.querySelector(".color-value");

    colorInput.addEventListener("input", (e) => {
      const color = e.target.value;
      colorPreview.style.backgroundColor = color;
      colorValue.textContent = color;
    });

    // 添加��件处理
    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");
    const nameInput = dialog.querySelector("#room-name");

    cancelBtn.addEventListener("click", () => dialog.remove());
    confirmBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const color = colorInput.value;

      // 更新房间数据
      if (room) {
        room.name = name;
        room.color = color;
      }

      element.style.backgroundColor = color;
      const nameLabel = element.querySelector(".room-name");
      if (nameLabel) {
        nameLabel.textContent = name;
      }

      dialog.remove();
      this.showToast(this.translate("room_setting_saved"));
    });

    this.shadowRoot.appendChild(dialog);
  }

  // 显示删除认对话框
  showDeleteConfirmDialog(element, type) {
    // 根据类型获取对应名称
    let delet_tip = "";
    switch (type) {
      case "room":
        delet_tip = this.translate("sure_delete1");
        break;
      case "area":
        delet_tip = this.translate("sure_delete2");
        break;
      case "device":
        delet_tip = this.translate("sure_delete3");
        break;
      case "sticker":
        delet_tip = this.translate("sure_delete4");
        break;
      default:
        delet_tip = "";
    }

    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
            <div class="dialog">
                <div class="dialog-title">${this.translate("confirm_delete")}</div>
                <div class="dialog-content">
                    <p>${delet_tip}</p>
                </div>
                <div class="dialog-buttons">
                    <mwc-button outlined id="cancel-button">取消</mwc-button>
                    <mwc-button raised id="confirm-button">确定</mwc-button>
                </div>
            </div>
        `;

    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");

    cancelBtn.addEventListener("click", () => dialog.remove());
    confirmBtn.addEventListener("click", () => {
      if (type === "room") {
        this.deleteRoom(element);
      } else if (type === "area") {
        this.deleteArea(element);
      } else if (type === "device") {
        this.deleteDevice(element);
      } else if (type === "sticker") {
        this.deleteSticker(element);
      }
      dialog.remove();
    });

    this.shadowRoot.appendChild(dialog);
  }

  // 创建对齐线
  createAlignmentLines() {
    if (!this.alignmentLines.vertical) {
      this.alignmentLines.vertical = document.createElement("div");
      this.alignmentLines.vertical.className = "alignment-line vertical";
      this.shadowRoot
        .querySelector(".drawing-area")
        .appendChild(this.alignmentLines.vertical);
    }
    if (!this.alignmentLines.horizontal) {
      this.alignmentLines.horizontal = document.createElement("div");
      this.alignmentLines.horizontal.className = "alignment-line horizontal";
      this.shadowRoot
        .querySelector(".drawing-area")
        .appendChild(this.alignmentLines.horizontal);
    }
  }

  // 更新对齐线位置
  updateAlignmentLines(element, newLeft, newTop) {
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    const elements = Array.from(drawingArea.children).filter(
      (el) =>
        el !== element &&
        el !== this.alignmentLines.vertical &&
        el !== this.alignmentLines.horizontal &&
        el.classList.contains("room")
    );

    const alignThreshold = 5; // 对齐阈值（像素）
    let alignX = null;
    let alignY = null;

    const elementRect = {
      left: newLeft,
      right: newLeft + element.offsetWidth,
      top: newTop,
      bottom: newTop + element.offsetHeight,
      centerX: newLeft + element.offsetWidth / 2,
      centerY: newTop + element.offsetHeight / 2,
    };

    elements.forEach((other) => {
      const otherRect = {
        left: other.offsetLeft,
        right: other.offsetLeft + other.offsetWidth,
        top: other.offsetTop,
        bottom: other.offsetTop + other.offsetHeight,
        centerX: other.offsetLeft + other.offsetWidth / 2,
        centerY: other.offsetTop + other.offsetHeight / 2,
      };

      // 左边对齐
      if (Math.abs(elementRect.left - otherRect.left) < alignThreshold) {
        alignX = otherRect.left;
        this.showVerticalAlignmentLine(alignX);
      }
      // 右边对齐
      else if (Math.abs(elementRect.right - otherRect.right) < alignThreshold) {
        alignX = otherRect.right - element.offsetWidth;
        this.showVerticalAlignmentLine(otherRect.right);
      }
      // 中心齐
      else if (
        Math.abs(elementRect.centerX - otherRect.centerX) < alignThreshold
      ) {
        alignX = otherRect.centerX - element.offsetWidth / 2;
        this.showVerticalAlignmentLine(otherRect.centerX);
      }

      // 顶部对齐
      if (Math.abs(elementRect.top - otherRect.top) < alignThreshold) {
        alignY = otherRect.top;
        this.showHorizontalAlignmentLine(alignY);
      }
      // 底部对齐
      else if (
        Math.abs(elementRect.bottom - otherRect.bottom) < alignThreshold
      ) {
        alignY = otherRect.bottom - element.offsetHeight;
        this.showHorizontalAlignmentLine(otherRect.bottom);
      }
      // 中心对齐
      else if (
        Math.abs(elementRect.centerY - otherRect.centerY) < alignThreshold
      ) {
        alignY = otherRect.centerY - element.offsetHeight / 2;
        this.showHorizontalAlignmentLine(otherRect.centerY);
      }
    });

    // 如没有对齐，隐藏对齐线
    if (alignX === null) this.hideVerticalAlignmentLine();
    if (alignY === null) this.hideHorizontalAlignmentLine();

    return { alignX, alignY };
  }

  // 显示/隐藏对齐线的辅助方法
  showVerticalAlignmentLine(x) {
    if (this.alignmentLines.vertical) {
      this.alignmentLines.vertical.style.left = `${x}px`;
      this.alignmentLines.vertical.style.display = "block";
    }
  }

  showHorizontalAlignmentLine(y) {
    if (this.alignmentLines.horizontal) {
      this.alignmentLines.horizontal.style.top = `${y}px`;
      this.alignmentLines.horizontal.style.display = "block";
    }
  }

  hideVerticalAlignmentLine() {
    if (this.alignmentLines.vertical) {
      this.alignmentLines.vertical.style.display = "none";
    }
  }

  hideHorizontalAlignmentLine() {
    if (this.alignmentLines.horizontal) {
      this.alignmentLines.horizontal.style.display = "none";
    }
  }

  // 移除编辑控件
  removeEditControls() {
    if (this.selectedElement) {
      const controls = this.selectedElement.querySelector(".edit-controls");
      if (controls) controls.remove();
    }
  }

  // 处理全局鼠标移动
  handleGlobalMouseMove(e) {
    if (this.isDragging && this.selectedElement && this.dragStartPos) {
        const dx = e.clientX - this.dragStartPos.x;
        const dy = e.clientY - this.dragStartPos.y;

        let newLeft = this.dragStartPos.left + dx;
        let newTop = this.dragStartPos.top + dy;

        // 获取画布和元素的尺寸
        const drawingArea = this.shadowRoot.querySelector(".drawing-area");
        const elementWidth = this.selectedElement.offsetWidth;
        const elementHeight = this.selectedElement.offsetHeight;
        const drawingAreaWidth = drawingArea.offsetWidth;
        const drawingAreaHeight = drawingArea.offsetHeight;

        // 限制元素在画布内
        newLeft = Math.max(0, Math.min(newLeft, drawingAreaWidth - elementWidth));
        newTop = Math.max(0, Math.min(newTop, drawingAreaHeight - elementHeight));

        // 如果拖动的是区域元素
        if (this.selectedElement.classList.contains('area')) {
            const areaId = parseInt(this.selectedElement.dataset.areaId);
            const area = this.areas.find(a => a.id === areaId);
            if (area) {
                // 检查新位置所在的房间
                const realX = newLeft / this.scale;
                const realY = newTop / this.scale;
                const targetRoom = this.findRoomAtPoint(realX, realY);

                // 创建临时区域对象用于重叠检测
                const tempArea = {
                    ...area,
                    left: newLeft,
                    top: newTop
                };

                // 检查新位置是否与其他区域重叠
                const isOverlapping = this.checkAreaOverlap(tempArea);
                
                // 如果是监测区域且目标房间存在，检查房间内的监测区域数量
                let exceedMaxAreas = false;
                if (area.type === "monitor-area" && targetRoom) {
                    // 获取目标房间内的监测区域数量（不包括当前拖动的区域）
                    const monitorAreasInRoom = this.areas.filter(a => {
                        if (a.id === areaId) return false; // 排除当前区域
                        const areaX = a.left / this.scale;
                        const areaY = a.top / this.scale;
                        return a.type === "monitor-area" && 
                               a.isValid && 
                               this.isPointInRoom({x: areaX, y: areaY}, targetRoom);
                    }).length;

                    // 如果房间内已有30个监测区域，设置标志并显示提示
                    if (monitorAreasInRoom >= 30) {
                        exceedMaxAreas = true;
                        this.showToast(this.translate("max_monitor_areas"));
                    }
                }
                
                // 更新区域状态和样式
                area.isValid = !isOverlapping && !exceedMaxAreas;
                
                if (!area.isValid) {
                    // 重叠或超出数量限制时显示红色虚线边框
                    this.selectedElement.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
                    this.selectedElement.style.border = "2px dashed #FF0000";
                    
                    // 添加或更新警告提示
                    let warningLabel = this.selectedElement.querySelector('.area-warning');
                    if (!warningLabel) {
                        warningLabel = document.createElement('div');
                        warningLabel.className = 'area-warning';
                        this.selectedElement.appendChild(warningLabel);
                    }
                    warningLabel.textContent = exceedMaxAreas ? 
                        this.translate("max_monitor_areas") : 
                        this.translate("area_overlap");
                } else {
                    // 不重叠时恢复正常样式
                    this.selectedElement.style.backgroundColor = `${area.color}33`;
                    this.selectedElement.style.border = `2px solid ${area.color}`;
                    
                    // 移除警告提示
                    const warningLabel = this.selectedElement.querySelector('.area-warning');
                    if (warningLabel) {
                        warningLabel.remove();
                    }
                }
            }
        } else if (this.selectedElement.classList.contains("sticker-element") &&
                   this.selectedElement.dataset.stickerType === "door") {
            // 如果是门贴纸，检查是否靠近房间墙
            const doorRect = {
                left: newLeft,
                top: newTop,
                width: this.selectedElement.offsetWidth,
                height: this.selectedElement.offsetHeight,
            };

            // 检查所有房间的墙
            const nearestWall = this.findNearestWall(doorRect);
            if (nearestWall) {
                // 应用对齐位置
                const alignedPosition = this.alignDoorToWall(doorRect, nearestWall);
                this.selectedElement.style.left = `${alignedPosition.left}px`;
                this.selectedElement.style.top = `${alignedPosition.top}px`;
                this.selectedElement.style.transform = `rotate(${alignedPosition.rotation}deg)`;

                // 更新门的有效性状态
                const stickerId = parseInt(this.selectedElement.dataset.stickerId);
                const sticker = this.stickers.find(s => s.id === stickerId);
                if (sticker) {
                    sticker.isValid = alignedPosition.isValid;
                    
                    // 根据有效性更新样式
                    if (!alignedPosition.isValid) {
                        this.selectedElement.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
                        this.selectedElement.style.border = "2px dashed #FF0000";
                        this.showToast(this.translate("max_doors_in_room"));
                    } else {
                        this.selectedElement.style.backgroundColor = "";
                        this.selectedElement.style.border = "";
                    }
                }
            } else {
                // 不在任何墙附近时，恢复有效状态
                const stickerId = parseInt(this.selectedElement.dataset.stickerId);
                const sticker = this.stickers.find(s => s.id === stickerId);
                if (sticker) {
                    sticker.isValid = true;
                    // 恢复正常样式
                    this.selectedElement.style.backgroundColor = "";
                    this.selectedElement.style.border = "";
                }
            }
        }

        // 获取对齐位置
        const { alignX, alignY } = this.updateAlignmentLines(
            this.selectedElement,
            newLeft,
            newTop
        );

        // 应用对齐后的位置，同时确保不超出画布
        const finalLeft = alignX !== null ? 
            Math.max(0, Math.min(alignX, drawingAreaWidth - elementWidth)) : 
            newLeft;
        const finalTop = alignY !== null ? 
            Math.max(0, Math.min(alignY, drawingAreaHeight - elementHeight)) : 
            newTop;

        this.selectedElement.style.left = `${finalLeft}px`;
        this.selectedElement.style.top = `${finalTop}px`;

        e.preventDefault();
    } else if (this.isRotating && this.selectedElement) {
      const currentAngle = this.getRotationAngle(this.selectedElement, e);
      const rotation = (currentAngle - this.startRotation) * (180 / Math.PI);

      // 更新元素的旋转
      this.selectedElement.style.transform = `rotate(${rotation}deg)`;

      // 保存当前旋转角度
      this.currentRotation = rotation;

      e.preventDefault();
    } else if (this.isResizing && this.selectedElement && this.resizeStartPos) {
      const dx = e.clientX - this.resizeStartPos.x;
      const dy = e.clientY - this.resizeStartPos.y;

      // 计算新尺寸（考虑最小尺寸限制）
      let minSize;
      if (this.selectedElement.classList.contains("room")) {
        minSize = 100 * this.scale; // 房间最小100cm
      } else if (this.selectedElement.classList.contains("area")) {
        minSize = 50 * this.scale; // 区域最小50cm
      } else if (this.selectedElement.classList.contains("sticker-element")) {
        minSize = 10 * this.scale; // 贴纸最小10cm
      }
      const newWidth = Math.max(minSize, this.resizeStartPos.width + dx);
      const newHeight = Math.max(minSize, this.resizeStartPos.height + dy);

      if (this.selectedElement.classList.contains("sticker-element")) {
        // 更新贴纸元素尺寸
        this.selectedElement.style.width = `${newWidth}px`;
        this.selectedElement.style.height = `${newHeight}px`;

        // 计算实际尺寸（厘米）
        const realWidth = Math.round(newWidth / this.scale);
        const realHeight = Math.round(newHeight / this.scale);

        // 更新尺寸标签
        const sizeLabel = this.selectedElement.querySelector(".sticker-size");
        if (sizeLabel) {
          sizeLabel.textContent = `${realWidth}×${realHeight}`;
        }

        // 更新贴纸数据
        const stickerId = parseInt(this.selectedElement.dataset.stickerId);
        const sticker = this.stickers.find(s => s.id === stickerId);
        if (sticker) {
          sticker.width = realWidth;
          sticker.height = realHeight;
          sticker.realWidth = realWidth;
          sticker.realHeight = realHeight;
        }
      }

      // 如果是设备元素，保持宽高相等
      if (this.selectedElement.classList.contains("device-element")) {
        const size = Math.max(newWidth, newHeight);
        this.selectedElement.style.width = `${size}px`;
        this.selectedElement.style.height = `${size}px`;
      } else {
        this.selectedElement.style.width = `${newWidth}px`;
        this.selectedElement.style.height = `${newHeight}px`;

        // 计算实际尺寸（厘米）
        const realWidth = Math.round(newWidth / this.scale);
        const realHeight = Math.round(newHeight / this.scale);

        // 更新尺寸标签
        if (this.selectedElement.classList.contains("area")) {
          const sizeLabel = this.selectedElement.querySelector(".area-size");
          if (sizeLabel) {
            sizeLabel.textContent = `${realWidth}×${realHeight}`;
          }

          // 更新区域数据
          const areaId = parseInt(this.selectedElement.dataset.areaId);
          const area = this.areas.find((a) => a.id === areaId);
          if (area) {
            area.width = newWidth;
            area.height = newHeight;
            area.realWidth = realWidth;
            area.realHeight = realHeight;
          }
        } else {
          // 房间的尺寸标签更新
          const widthLabel = this.selectedElement.querySelector(".width-label");
          const heightLabel =
            this.selectedElement.querySelector(".height-label");
          if (widthLabel) widthLabel.textContent = `${realWidth}cm`;
          if (heightLabel) heightLabel.textContent = `${realHeight}cm`;
          const roomId = parseInt(this.selectedElement.dataset.roomId);
          const room = this.rooms.find((r) => r.id === roomId);
          if (room) {
            room.width = newWidth;
            room.height = newHeight;
            room.realWidth = realWidth;
            room.realHeight = realHeight;
          }
        }
      }

      e.preventDefault();
    }
  }

  // 处理全局鼠松开
  handleGlobalMouseUp() {
    // 清除长按计时器
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.isDragging && this.selectedElement) {
      // 更新元素位置数据
      if (this.selectedElement.classList.contains("room")) {
        const roomId = parseInt(this.selectedElement.dataset.roomId);
        const room = this.rooms.find((r) => r.id === roomId);
        if (room) {
          // 获当前DOM元素位置
          const currentLeft = parseFloat(this.selectedElement.style.left);
          const currentTop = parseFloat(this.selectedElement.style.top);

          // 更新真实位置（厘米）和显示位置
          room.realLeft = currentLeft / this.scale;
          room.realTop = currentTop / this.scale;
          room.left = currentLeft;
          room.top = currentTop;

          // 保存到DOM元素的dataset中
          this.selectedElement.dataset.realLeft = room.realLeft;
          this.selectedElement.dataset.realTop = room.realTop;
        }
      } else if (this.selectedElement.classList.contains("area")) {
        const areaId = parseInt(this.selectedElement.dataset.areaId);
        const area = this.areas.find((a) => a.id === areaId);
        if (area) {
          // 获取当前DOM元素位置
          const currentLeft = parseFloat(this.selectedElement.style.left);
          const currentTop = parseFloat(this.selectedElement.style.top);

          // 更新真实位置（厘米）和显示位置
          area.realLeft = currentLeft / this.scale;
          area.realTop = currentTop / this.scale;
          area.left = currentLeft;
          area.top = currentTop;

          // 保存到DOM元素的dataset中
          this.selectedElement.dataset.realLeft = area.realLeft;
          this.selectedElement.dataset.realTop = area.realTop;
        }
      } else if (this.selectedElement.classList.contains("device-element")) {
        const deviceId = this.selectedElement.dataset.deviceId;
        const device = this.placedDevices.find((d) => d.id === deviceId);
        if (device) {
          // 获取当前DOM元素位置
          const currentLeft = parseFloat(this.selectedElement.style.left);
          const currentTop = parseFloat(this.selectedElement.style.top);

          // 更新真实位置（厘米）和显示位置
          device.realLeft = currentLeft / this.scale;
          device.realTop = currentTop / this.scale;
          device.left = currentLeft;
          device.top = currentTop;

          // 保存到DOM素的dataset中
          this.selectedElement.dataset.realLeft = device.realLeft;
          this.selectedElement.dataset.realTop = device.realTop;
        }
      } else if (this.selectedElement.classList.contains("sticker-element")) {
        const stickerId = parseInt(this.selectedElement.dataset.stickerId);
        const sticker = this.stickers.find((s) => s.id === stickerId);
        if (sticker) {
          // 获取当前DOM元素位置
          const currentLeft = parseFloat(this.selectedElement.style.left);
          const currentTop = parseFloat(this.selectedElement.style.top);

          // 更新真实位置厘米）和显示位置
          sticker.realLeft = currentLeft / this.scale;
          sticker.realTop = currentTop / this.scale;
          sticker.left = currentLeft;
          sticker.top = currentTop;

          // 保存到DOM元素的dataset中
          this.selectedElement.dataset.realLeft = sticker.realLeft;
          this.selectedElement.dataset.realTop = sticker.realTop;
        }
      }

      // 隐藏对齐线
      this.hideVerticalAlignmentLine();
      this.hideHorizontalAlignmentLine();

      this.isDragging = false;
      this.dragStartPos = null;
    }

    // 结束旋转
    if (this.isRotating && this.selectedElement) {
      const transform = this.selectedElement.style.transform;
      const rotation = transform
        ? parseFloat(transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] || 0)
        : 0;

      // 根据元素类型更新旋转数据
      if (this.selectedElement.classList.contains("room")) {
        const roomId = parseInt(this.selectedElement.dataset.roomId);
        const room = this.rooms.find((r) => r.id === roomId);
        if (room) room.rotation = rotation;
      } else if (this.selectedElement.classList.contains("area")) {
        const areaId = parseInt(this.selectedElement.dataset.areaId);
        const area = this.areas.find((a) => a.id === areaId);
        if (area) area.rotation = rotation;
      }

      this.isRotating = false;
    }

    // 结束缩放
    if (this.isResizing && this.selectedElement) {

      this.isResizing = false;
      this.resizeStartPos = null;
    }

    this.isDragging = false;
    this.dragStartPos = null;
  }

  // 添加删除元素的方
  deleteElement(element) {
    // 获取房间ID
    const roomId = parseInt(element.dataset.roomId);

    // 从数组中移房间数据
    this.rooms = this.rooms.filter((room) => room.id !== roomId);

    // 回收房间ID以便重用
    this.recycleRoomId(roomId);

    // 如果是当前选中元素，清除选中状态
    if (this.selectedElement === element) {
      this.selectedElement = null;
      this.updateCursor();
    }

    // 从DOM中移除房间元素
    element.remove();
  }

  // 添加区域创建和拖动相关方法
  startDraggingArea(e, type) {
    const areaElement = document.createElement("div");
    areaElement.className = "area-preview";

    // 设置区样式
    const isMonitor = type === "monitor-area";
    const backgroundColor = isMonitor
      ? "rgba(0, 255, 0, 0.2)"
      : "rgba(255, 0, 0, 0.2)";
    const borderColor = isMonitor ? "#0f0" : "#f00";

    // 考虑缩放和边框的预览尺寸
    const borderWidth = 2; // 框宽度2px
    const previewSize = 100 * this.scale - borderWidth * 2; // 100cm，减去边框宽度

    areaElement.style.width = `${previewSize}px`;
    areaElement.style.height = `${previewSize}px`;
    areaElement.style.backgroundColor = backgroundColor;
    areaElement.style.border = `${borderWidth}px solid ${borderColor}`;
    areaElement.style.position = "fixed";
    areaElement.style.pointerEvents = "none";

    // 添加尺寸标签
    areaElement.innerHTML = `
            <div class="area-name">${isMonitor ? this.translate("monitoring_area") : this.translate("interference_source")}</div>
            <div class="area-size">100x100</div>
        `;

    document.body.appendChild(areaElement);
    this.draggedArea = {
      element: areaElement,
      type: type,
      startX: e.clientX,
      startY: e.clientY,
      size: previewSize + borderWidth * 2, // 包含边框的总尺寸
    };

    this.isDraggingArea = true;

    // 添加鼠移动和松开事件
    document.addEventListener("mousemove", this.handleAreaDrag.bind(this));
    document.addEventListener("mouseup", this.handleAreaDrop.bind(this));
  }

  handleAreaDrag(e) {
    if (!this.isDraggingArea || !this.draggedArea) return;

    const { element, size } = this.draggedArea;
    element.style.left = `${e.clientX - size / 2}px`; // 居中显示
    element.style.top = `${e.clientY - size / 2}px`; // 居中显示
  }

  handleAreaDrop(e) {
    if (!this.isDraggingArea || !this.draggedArea) return;

    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    const rect = drawingArea.getBoundingClientRect();

    // 检查是否在画布范围内
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
        
        // 计算相对于画布的位置（考虑区域大小，使其居中放置）
        const x = e.clientX - rect.left - (this.draggedArea.size / 2);
        const y = e.clientY - rect.top - (this.draggedArea.size / 2);

        // 检查点击位置所在的房间
        const realX = x / this.scale;
        const realY = y / this.scale;
        const room = this.findRoomAtPoint(realX, realY);
        
        if (!room) {
            this.createArea(x, y, this.draggedArea.type);
        } else {
            // 检查该房间内的区域数量
            const areasInRoom = this.findRegionsInRoom(room).filter(area => area.type === "monitor-area" && area.isValid);
            console.log('区域数据---', areasInRoom);
            if (areasInRoom.length >= 30) {
                this.showToast("每个房间最多只能有30个区域");
            } else {
                // 创建区域
                this.createArea(x, y, this.draggedArea.type);
            }
        }
    }

    // 清理
    if (this.draggedArea.element) {
        this.draggedArea.element.remove();
    }
    this.draggedArea = null;
    this.isDraggingArea = false;

    // 移除事件监听
    document.removeEventListener("mousemove", this.handleAreaDrag);
    document.removeEventListener("mouseup", this.handleAreaDrop);
  }

  // 添加查找房间的方法
  findRoomAtPosition(x, y) {
    return this.rooms.find((room) => {
      return (
        x >= room.left &&
        x <= room.left + room.width &&
        y >= room.top &&
        y <= room.top + room.height
      );
    });
  }

  // 修改 createArea 方法，添加区域类型
  createArea(x, y, areaType) {
    const areaId = this.getNextAreaId();

    // 根据类型设置颜色
    const isMonitor = areaType === "monitor-area"; // 修改这里：使用 areaType 而不是 type
    const areaColor = isMonitor ? "#00ff00" : "#ff0000";

    // 真实尺寸（厘米）
    const realWidth = 100; // 100cm
    const realHeight = 100; // 100cm
    const realLeft = Math.round(x / this.scale);
    const realTop = Math.round(y / this.scale);

    // 计算画布上的实际尺寸（考虑缩放和边框）
    const borderWidth = 2; // 边框宽度2px
    const width = realWidth * this.scale - borderWidth * 2;
    const height = realHeight * this.scale - borderWidth * 2;

    // 创建新区域对象
    const area = {
        id: areaId,
        type: areaType,
        areaType: 0,
        name: isMonitor ? `${this.translate("monitoring_area")}${areaId}` : `${this.translate("interference_source")}${areaId}`,
        left: x,
        top: y,
        width: width,
        height: height,
        realWidth: realWidth,
        realHeight: realHeight,
        realLeft: realLeft,
        realTop: realTop,
        color: areaColor,
        reportEvents: false,
        visible: true,
    };

    // 检查是否与现有区域重叠
    const isOverlapping = this.checkAreaOverlap(area);
    if (isOverlapping) {
        area.isValid = false;
    } else {
        area.isValid = true;
    }

    this.areas.push(area);
    this.drawArea(area);
  }

  // 修改 checkAreaOverlap 方法
  checkAreaOverlap(newArea) {
    return this.areas.some(existingArea => {
        // 跳过与自身的比较
        if (existingArea.id === newArea.id) return false;
        
        // 如果是干扰源和监测区域的组合，允许重叠
        if ((newArea.type === "interference-source" && existingArea.type === "monitor-area") ||
            (newArea.type === "monitor-area" && existingArea.type === "interference-source")) {
            return false;
        }
        
        // 如果都是干扰源，允许重叠
        if (newArea.type === "interference-source" && existingArea.type === "interference-source") {
            return false;
        }
        
        // 如果都是监测区域，检查重叠
        if (newArea.type === "monitor-area" && existingArea.type === "monitor-area") {
            // 获取现有区域的当前位置
            const areaElement = this.shadowRoot.querySelector(`.area[data-area-id="${existingArea.id}"]`);
            if (!areaElement) return false;
            
            const currentLeft = parseFloat(areaElement.style.left);
            const currentTop = parseFloat(areaElement.style.top);
            const currentWidth = parseFloat(areaElement.style.width);
            const currentHeight = parseFloat(areaElement.style.height);
            
            // 检查两个监测区域是否重叠
            return !(newArea.left + newArea.width <= currentLeft ||
                    newArea.left >= currentLeft + currentWidth ||
                    newArea.top + newArea.height <= currentTop ||
                    newArea.top >= currentTop + currentHeight);
        }
        
        return false;
    });
  }

  // 修改 drawArea 方法
  drawArea(area) {
    const areaElement = document.createElement("div");
    areaElement.className = "area";
    areaElement.dataset.areaId = area.id;
    areaElement.style.position = "absolute";
    areaElement.style.left = `${area.left}px`;
    areaElement.style.top = `${area.top}px`;
    areaElement.style.width = `${area.width}px`;
    areaElement.style.height = `${area.height}px`;
    
    // 根据是否重叠设置不同的样式
    if (!area.isValid) {
        // 重叠��域使用红色虚线边框
        areaElement.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
        areaElement.style.border = "2px dashed #FF0000";
        // 添加警告提示
        const warningLabel = document.createElement("div");
        warningLabel.className = "area-warning";
        warningLabel.textContent = "区域重叠";
        areaElement.appendChild(warningLabel);
    } else {
        // 正常区域使用原有样式
        areaElement.style.backgroundColor = `${area.color}33`;
        areaElement.style.border = `2px solid ${area.color}`;
    }

    areaElement.innerHTML += `
        <div class="area-name">${area.name}</div>
        <div class="area-size">${area.realWidth}x${area.realHeight}</div>
    `;

    this.shadowRoot.querySelector(".drawing-area").appendChild(areaElement);
  }

  // 修改 showAreaEditDialog 方法中类型选择部分
  showAreaEditDialog(element) {
    const areaId = parseInt(element.dataset.areaId);
    const area = this.areas.find((a) => a.id === areaId);
    if (!area) return;

    // 判断是否是干扰源区域（通过颜色判断）
    const isInterference = area.color === "#ff0000";

    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
        <div class="dialog">
            <div class="dialog-title">区域设置</div>
            <div class="dialog-content">
                ${
                  !isInterference
                    ? `
                    <div class="form-field">
                        <label>类型</label>
                        <select id="area-type">
                            ${Object.entries(AREA_TYPES)
                              .map(
                                ([value, { name }]) => `
                                    <option value="${value}" ${
                                  area.areaType === parseInt(value)
                                    ? "selected"
                                    : ""
                                }>${name}</option>
                                `
                              )
                              .join("")}
                        </select>
                    </div>
                `
                    : ""
                }
                <div class="form-field">
                    <label>区域名称</label>
                    <input type="text" id="area-name" value="${
                      area.name
                    }" placeholder="输入区域名称">
                </div>
                <div class="form-field">
                    <label>颜色</label>
                    <div class="color-field">
                        <input type="color" id="area-color" class="color-input" value="${
                          area.color
                        }">
                        <div class="color-preview" style="background-color: ${
                          area.color
                        }"></div>
                        <span class="color-value">${area.color}</span>
                    </div>
                </div>
                <div class="form-field">
                    <label class="switch-label">
                        <span>事件上报</span>
                        <ha-switch id="report-events"></ha-switch>
                    </label>
                </div>
                <div class="form-field">
                    <label class="switch-label">
                        <span>显示/隐藏</span>
                        <ha-switch id="area-visible"></ha-switch>
                    </label>
                </div>
            </div>
            <div class="dialog-buttons">
                <mwc-button outlined id="cancel-button">取消</mwc-button>
                <mwc-button raised id="confirm-button">确定</mwc-button>
            </div>
        </div>
    `;

    // 在 DOM 添加后设置开关状态
    this.shadowRoot.appendChild(dialog);

    // 获取开关元素
    const reportEventsSwitch = dialog.querySelector("#report-events");
    const visibleSwitch = dialog.querySelector("#area-visible");

    // 设置关初始态
    if (reportEventsSwitch) {
      reportEventsSwitch.checked = area.reportEvents || false;
    }
    if (visibleSwitch) {
      visibleSwitch.checked = area.visible !== false; // 默认为 true
    }

    // 添加颜色变化事件
    const colorInput = dialog.querySelector("#area-color");
    const colorPreview = dialog.querySelector(".color-preview");
    const colorValue = dialog.querySelector(".color-value");

    colorInput.addEventListener("input", (e) => {
      const color = e.target.value;
      colorPreview.style.backgroundColor = color;
      colorValue.textContent = color;
    });

    // 添加事件处理
    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");

    cancelBtn.addEventListener("click", () => dialog.remove());
    confirmBtn.addEventListener("click", () => {
      // 更新区域数据
      if (!isInterference) {
        area.areaType = parseInt(dialog.querySelector("#area-type").value);
      }
      area.name = dialog.querySelector("#area-name").value;
      area.color = dialog.querySelector("#area-color").value;
      area.reportEvents = reportEventsSwitch.checked;
      area.visible = visibleSwitch.checked;

      // 检查是否与其他区域重叠
      const isOverlapping = this.checkAreaOverlap(area);
      area.isValid = !isOverlapping;

      // 重新绘制区域
      this.shadowRoot.querySelector('.drawing-area').removeChild(element);
      this.drawArea(area);

      dialog.remove();
    });
  }

  // 修改获取下一个区域ID的方法
  getNextAreaId() {
    // 获取所有已使用的ID
    const usedIds = new Set(this.areas.map(area => area.id));
    
    // 从1开始查找第一个未使用的ID
    let nextId = 1;
    while (usedIds.has(nextId)) {
        nextId++;
    }
    
    return nextId;
  }

  // 添加区域ID回收方法
  recycleAreaId(id) {
    if (id >= 1 && id <= 10000) {
      this.availableAreaIds.add(id);
    }
  }

  // 添加更新尺寸标签的方法
  updateSizeLabels(element, width, height) {
    // 计算实际尺寸（厘米）
    const borderWidth = 2; // 边框宽度2px
    const realWidth = Math.round((width + borderWidth * 2) / this.scale);
    const realHeight = Math.round((height + borderWidth * 2) / this.scale);

    // 更新尺寸标签
    const sizeLabel = element.querySelector(".area-size");
    if (sizeLabel) {
      sizeLabel.textContent = `${realWidth}x${realHeight}`;
    }
  }

  // 修改 deleteRoom 方法
  deleteRoom(element) {
    const roomId = parseInt(element.dataset.roomId);

    // 从数组中移除房间数据
    this.rooms = this.rooms.filter((room) => room.id !== roomId);

    // 回收房间ID以便重用
    this.recycleRoomId(roomId);

    // 如果是当前选中的元素，清除选中状态
    if (this.selectedElement === element) {
      this.selectedElement = null;
      this.updateCursor();
    }

    // 从DOM中移除房间元素
    element.remove();
  }

  // 修改 deleteArea 方法
  deleteArea(element) {
    const areaId = parseInt(element.dataset.areaId);

    // 从数组中移除区域数据
    this.areas = this.areas.filter((area) => area.id !== areaId);

    // 回收区域ID以便重用
    this.recycleAreaId(areaId);

    // 如果是当前选中的元素，清除选中状态
    if (this.selectedElement === element) {
      this.selectedElement = null;
      this.updateCursor();
    }

    // 从DOM中移除区域元素
    element.remove();
  }

  // 添加加载设备数据的方法
  async loadDevices() {
    try {
      // 加载雷达设备
      const storedDevicesResponse = await this.hass.callWS({
        type: "airibes/get_stored_devices",  // 修改这里
      });

      // 加载导入的设备
      const importedDevicesResponse = await this.hass.callWS({
        type: "airibes/get_imported_devices",  // 修改这里
      });

      let allDevices = [];

      // 处理雷达设备
      if (storedDevicesResponse) {
        let radarDevices = [];
        // 检查是否是数组
        if (Array.isArray(storedDevicesResponse)) {
          radarDevices = storedDevicesResponse
            .filter((device) => device && device.device_id)
            .map((device) => ({
              name: device.name || "人体存在传感器",
              device_id: device.device_id,
              displayName: `雷达-${device.device_id.slice(-4)}`,
              type: "radar",
            }));
        }
        // 如果是对象，使用 Object.entries
        else if (typeof storedDevicesResponse === "object") {
          radarDevices = Object.entries(storedDevicesResponse)
            .filter(([key, value]) => value && value.device_id)
            .map(([key, device]) => ({
              name: device.name || "人体存在传感器",
              device_id: device.device_id,
              displayName: `雷达-${device.device_id.slice(-4)}`,
              type: "radar",
            }));
        }
        allDevices = [...allDevices, ...radarDevices];
      }

      // 处理导入的设备
      if (
        importedDevicesResponse?.devices &&
        Array.isArray(importedDevicesResponse.devices)
      ) {
        const importedDevices = importedDevicesResponse.devices
          .filter((device) => device && device.entity_id && device.type)
          .map((device) => {
            const deviceId = device.entity_id;
            const type = device.type; // light 或 climate
            const typeName = type === "light" ? "灯" : "空调";
            const displayName = `${typeName}-${deviceId.slice(-4)}`;

            return {
              name: device.name || deviceId,
              device_id: deviceId,
              displayName: displayName,
              type: type,
              entity_id: deviceId,
            };
          });
        allDevices = [...allDevices, ...importedDevices];
      }

      // 更新设备列表
      this.devices = allDevices;
    } catch (error) {
      console.error("加载设备列表失败:", error);
      // 确保即使出错也初始化设备列表
      this.devices = [];
    }
  }

  // 修改 startDraggingDevice 方法
  startDraggingDevice(e, deviceId) {
    const device = this.devices.find((d) => d.device_id === deviceId);
    if (!device) return;
    const deviceTypeMap = {
      "radar": "mdi:radar",
      "light": "mdi:lightbulb",
      "climate": "mdi:air-conditioner",
      "default": "mdi:help-circle"
    };
    let icon = deviceTypeMap[device.type] || deviceTypeMap["default"];
    // 创预览元素
    const devicePreview = document.createElement("div");
    devicePreview.className = "device-preview";
    devicePreview.innerHTML = `
            <div class="device-content">
                <ha-icon icon="${icon}"></ha-icon>
                <span class="device-name">${device.displayName}</span>
            </div>
        `;

    // 设初始位置
    const setPreviewPosition = (x, y) => {
      devicePreview.style.position = "fixed";
      devicePreview.style.left = `${x - 25}px`;
      devicePreview.style.top = `${y - 25}px`;
      devicePreview.style.zIndex = "9999";
    };

    // 立即设置初始位置并添加到文档
    setPreviewPosition(e.clientX, e.clientY);
    document.body.appendChild(devicePreview);

    // 保存动状态
    this.draggedDevice = {
      element: devicePreview,
      deviceId: deviceId,
      setPosition: setPreviewPosition,
    };

    // 添加移事件监听器
    const handleMouseMove = (moveEvent) => {
      if (this.draggedDevice && this.draggedDevice.setPosition) {
        this.draggedDevice.setPosition(moveEvent.clientX, moveEvent.clientY);
      }
    };

    // 添加松开事件监听器
    const handleMouseUp = (upEvent) => {
      if (!this.draggedDevice) return;

      const drawingArea = this.shadowRoot.querySelector(".drawing-area");
      const rect = drawingArea.getBoundingClientRect();

      // 检查是否在画布范围内
      if (
        upEvent.clientX >= rect.left &&
        upEvent.clientX <= rect.right &&
        upEvent.clientY >= rect.top &&
        upEvent.clientY <= rect.bottom
      ) {
        // 计算相对于画布的位置
        const x = upEvent.clientX - rect.left;
        const y = upEvent.clientY - rect.top;

        // 创建设备元素
        this.createDeviceElement(x, y, this.draggedDevice.deviceId);
      }

      // 清理
      if (this.draggedDevice.element) {
        this.draggedDevice.element.remove();
      }
      this.draggedDevice = null;

      // 移除件监听器
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    // 添加事件监听器
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // 阻止默认行为和事件冒泡
    e.preventDefault();
    e.stopPropagation();
  }

  // 添加设备编对话框
  showDeviceEditDialog(element) {
    const deviceId = element.dataset.deviceId;
    const device = this.placedDevices.find((d) => d.id === deviceId);
    if (!device) return;

    const dialog = document.createElement("div");
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
        <div class="dialog">
            <div class="dialog-title">设备设置</div>
            <div class="dialog-content">
                <div class="form-field">
                    <div class="info-row">
                        <span class="info-label">设备名称：</span>
                        <span class="info-value">${device.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">设备ID：</span>
                        <span class="info-value">${device.id}</span>
                    </div>
                </div>
                <div class="form-field">
                    <label>安装高度(cm)</label>
                    <div class="height-input-container">
                        <input type="number" id="device-height" value="${
                          device.installHeight || 0
                        }" min="0" step="1">
                        <div class="height-suggestion">建议安装高高度：140-180cm</div>
                    </div>
                </div>
                <div class="form-field">
                    <label>安装角度</label>
                    <div class="angle-options">
                        <div class="angle-option ${
                          device.installAngle === 0 ? "selected" : ""
                        }" data-angle="0">
                            <img src="/frontend_static/images/icon_degree.png" alt="角度0" style="transform: rotate(0deg)">
                            ${
                              device.installAngle === 0
                                ? '<span class="check-mark"><ha-icon icon="mdi:check-circle"></ha-icon></span>'
                                : ""
                            }
                        </div>
                        <div class="angle-option ${
                          device.installAngle === 1 ? "selected" : ""
                        }" data-angle="1">
                            <img src="/frontend_static/images/icon_degree.png" alt="角度1" style="transform: rotate(180deg)">
                            ${
                              device.installAngle === 1
                                ? '<span class="check-mark"><ha-icon icon="mdi:check-circle"></ha-icon></span>'
                                : ""
                            }
                        </div>
                        <div class="angle-option ${
                          device.installAngle === 2 ? "selected" : ""
                        }" data-angle="2">
                            <img src="/frontend_static/images/icon_degree.png" alt="角度2" style="transform: rotate(270deg)">
                            ${
                              device.installAngle === 2
                                ? '<span class="check-mark"><ha-icon icon="mdi:check-circle"></ha-icon></span>'
                                : ""
                            }
                        </div>
                        <div class="angle-option ${
                          device.installAngle === 3 ? "selected" : ""
                        }" data-angle="3">
                            <img src="/frontend_static/images/icon_degree.png" alt="角度3" style="transform: rotate(90deg)">
                            ${
                              device.installAngle === 3
                                ? '<span class="check-mark"><ha-icon icon="mdi:check-circle"></ha-icon></span>'
                                : ""
                            }
                        </div>
                    </div>
                </div>
                <div class="form-field">
                    <label class="switch-label">
                        <span>显示/隐藏</span>
                        <ha-switch id="device-visible" checked=${device.visible}></ha-switch>
                    </label>
                </div>
            </div>
            <div class="dialog-buttons">
                <mwc-button outlined id="cancel-button">取消</mwc-button>
                <mwc-button raised id="confirm-button">确定</mwc-button>
            </div>
        </div>
    `;

    // 加角度选项点击事件
    const angleOptions = dialog.querySelectorAll(".angle-option");
    angleOptions.forEach((option) => {
      option.addEventListener("click", () => {
        // 移除其他选项的选中状态
        angleOptions.forEach((opt) => {
          opt.classList.remove("selected");
          const checkMark = opt.querySelector(".check-mark");
          if (checkMark) checkMark.remove();
        });
        // 添加当前选项的选中状态
        option.classList.add("selected");
        const checkMark = document.createElement("span");
        checkMark.className = "check-mark";
        checkMark.innerHTML = '<ha-icon icon="mdi:check-circle"></ha-icon>';
        option.appendChild(checkMark);
      });
    });

    const cancelBtn = dialog.querySelector("#cancel-button");
    const confirmBtn = dialog.querySelector("#confirm-button");
    const visibleSwitch = dialog.querySelector("#device-visible");
    const heightInput = dialog.querySelector("#device-height");

    // 验证高度输入
    heightInput.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      if (value < 0) {
        e.target.value = 0;
      }
    });
    if(visibleSwitch){
      visibleSwitch.checked = device.visible !== false;
    }
    cancelBtn.addEventListener("click", () => dialog.remove());
    confirmBtn.addEventListener("click", () => {
      // 更新设备数据
      device.visible = visibleSwitch.checked;
      device.installHeight = parseFloat(heightInput.value) || 0;
      // 获取选中的角度值
      const selectedAngle = dialog.querySelector(".angle-option.selected");
      if (selectedAngle) {
        device.installAngle = parseInt(selectedAngle.dataset.angle);
      }
      dialog.remove();
    });

    this.shadowRoot.appendChild(dialog);
  }

  // 添加删除设备的方法
  deleteDevice(element) {
    const deviceId = element.dataset.deviceId;

    // 从已放置列表中移除
    this.placedDevices = this.placedDevices.filter(
      (device) => device.id !== deviceId
    );

    // 如果是前选中的元，清除选中状态
    if (this.selectedElement === element) {
      this.selectedElement = null;
      this.updateCursor();
    }

    // 从DOM中移除设备元素
    element.remove();

    // 重新渲染工具栏，更新设备状态
    const toolContent = this.shadowRoot.querySelector(".tool-content");
    toolContent.innerHTML = this.renderToolContent();

    // 重新设置工具监听器
    this.setupToolListeners();
  }

  // 修改 createDeviceElement 方法
  createDeviceElement(x, y, deviceId) {
    const device = this.devices.find((d) => d.device_id === deviceId);
    if (!device) return;

    // 设备真实尺寸为10cm
    const realSize = 10; // 10cm
    const displaySize = realSize * this.scale; // 转换为显示尺寸

    // 计算真实位置（厘米）
    const realLeft = Math.round(x / this.scale);
    const realTop = Math.round(y / this.scale);
    const displayLeft = realLeft * this.scale;
    const displayTop = realTop * this.scale;

    const deviceElement = document.createElement("div");
    deviceElement.className = "device-element";
    deviceElement.dataset.deviceId = deviceId;
    deviceElement.style.left = `${displayLeft - displaySize / 2}px`; // 居中放置
    deviceElement.style.top = `${displayTop - displaySize / 2}px`; // 居中放置
    deviceElement.style.width = `${displaySize}px`; // 设置宽度
    deviceElement.style.height = `${displaySize}px`; // 设置高度

    // 只显示设备ID的后4位
    const shortName = deviceId.slice(-4);
    let icon = "mdi:help-circle"; // 默认图标
    let iconStyle = "";
    switch (device.type) {
      case "radar":
        icon = "mdi:radar";
        break;
      case "light":
        icon = "mdi:lightbulb";
        iconStyle = "color: var(--warning-color);"; // 灯泡使用黄色
        break;
      case "climate":
        icon = "mdi:air-conditioner";
        iconStyle = "color: var(--info-color);"; // 空调使用蓝色
        break;
    }
    deviceElement.innerHTML = `
        <div class="device-content">
            <ha-icon icon="${icon}" style="${iconStyle}"></ha-icon>
            <span class="device-name">${shortName}</span>
        </div>
    `;

    // 添加设备到已放置列表，保存真实位置
    this.placedDevices.push({
      id: deviceId,
      type: device.type,
      element: deviceElement,
      realLeft: realLeft,
      realTop: realTop,
      left: displayLeft,
      top: displayTop,
      width: realSize, // 保存真实宽度
      height: realSize, // 保存真实高度
      name: device.displayName,
      shortName: shortName,
      rotation: 0,
      installHeight: 0,
      installAngle: 0,
    });

    this.shadowRoot.querySelector(".drawing-area").appendChild(deviceElement);

    // 重新渲染工具栏，更新设备状态
    const toolContent = this.shadowRoot.querySelector(".tool-content");
    toolContent.innerHTML = this.renderToolContent();

    // 重新设置工具监听器
    this.setupToolListeners();
  }

  // 修改 createStickerElement 方法，移除门 ID 显示
  createStickerElement(x, y, stickerType) {
    const stickerInfo = STICKER_TYPES[stickerType];
    if (!stickerInfo) return;

    const stickerId = this.getNextStickerId();

    // 使用贴纸信息中的默认尺寸
    const realWidth = stickerInfo.width;
    const realHeight = stickerInfo.height;
    const displayWidth = realWidth * this.scale;
    const displayHeight = realHeight * this.scale;

    const stickerElement = document.createElement("div");
    stickerElement.className = "sticker-element";
    stickerElement.dataset.stickerId = stickerId;
    stickerElement.dataset.stickerType = stickerType;
    
    // 计算真实位置（厘米）
    const realLeft = (x - displayWidth / 2) / this.scale;
    const realTop = (y - displayHeight / 2) / this.scale;
    
    // 设置显示位置
    stickerElement.style.left = `${realLeft * this.scale}px`;
    stickerElement.style.top = `${realTop * this.scale}px`;
    stickerElement.style.width = `${displayWidth}px`;
    stickerElement.style.height = `${displayHeight}px`;

    // 统一的内容模板，不再区分门
    stickerElement.innerHTML = `
      <div class="sticker-content">
        ${stickerInfo.getSvg()}
        <span class="sticker-size">${realWidth}×${realHeight}</span>
      </div>
    `;

    // 添加长按选中功能
    this.setupStickerEvents(stickerElement);

    // 添加贴纸到列表
    this.stickers.push({
      id: stickerId,
      type: stickerType,
      element: stickerElement,
      width: realWidth,
      height: realHeight,
      realWidth: realWidth,
      realHeight: realHeight,
      realLeft: realLeft,
      realTop: realTop,
      name: stickerInfo.name,
    });

    this.shadowRoot.querySelector(".drawing-area").appendChild(stickerElement);
    this.selectElement(stickerElement);
  }

  // 修改 startDraggingSticker 方法
  startDraggingSticker(e, stickerType) {
    const stickerInfo = STICKER_TYPES[stickerType];
    if (!stickerInfo) return;

    // 创建预览元素
    const stickerPreview = document.createElement("div");
    stickerPreview.className = "sticker-preview";
    const previewWidth = stickerInfo.width * this.scale;
    const previewHeight = stickerInfo.height * this.scale;
    stickerPreview.style.width = `${previewWidth}px`;
    stickerPreview.style.height = `${previewHeight}px`;

    stickerPreview.innerHTML = `
        <div class="sticker-content">
            ${stickerInfo.getSvg()}
            <span class="sticker-name">${stickerInfo.name}</span>
            <span class="sticker-size">${stickerInfo.width}×${
      stickerInfo.height
    } cm</span>
        </div>
    `;

    // 设置初始位置
    const setPreviewPosition = (x, y) => {
      stickerPreview.style.position = "fixed";
      stickerPreview.style.left = `${x - previewWidth / 2}px`;
      stickerPreview.style.top = `${y - previewHeight / 2}px`;
      stickerPreview.style.zIndex = "9999";
    };

    // 立即设置初始位置并添加到文档
    setPreviewPosition(e.clientX, e.clientY);
    document.body.appendChild(stickerPreview);

    // 保存拖动状态
    this.draggedSticker = {
      element: stickerPreview,
      type: stickerType,
      setPosition: setPreviewPosition,
    };

    // 添加动事件监听器
    const handleMouseMove = (moveEvent) => {
      if (this.draggedSticker && this.draggedSticker.setPosition) {
        this.draggedSticker.setPosition(moveEvent.clientX, moveEvent.clientY);
      }
    };

    // 添加松开事件监听器
    const handleMouseUp = (upEvent) => {
      if (!this.draggedSticker) return;

      const drawingArea = this.shadowRoot.querySelector(".drawing-area");
      const rect = drawingArea.getBoundingClientRect();

      // 检查是否在画布范围内
      if (
        upEvent.clientX >= rect.left &&
        upEvent.clientX <= rect.right &&
        upEvent.clientY >= rect.top &&
        upEvent.clientY <= rect.bottom
      ) {
        // 计算相对于画布的位置
        const x = upEvent.clientX - rect.left;
        const y = upEvent.clientY - rect.top;

        // 创建贴纸元素
        this.createStickerElement(x, y, this.draggedSticker.type);
      }

      // 清理
      if (this.draggedSticker.element) {
        this.draggedSticker.element.remove();
      }
      this.draggedSticker = null;

      // 移除事件监听器
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    // 添加事件监听器
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    // 阻止默认行为和事件冒泡
    e.preventDefault();
    e.stopPropagation();
  }

  // 添加获取下一个贴纸ID的方法
  getNextStickerId() {
    if (this.availableStickerIds.size > 0) {
      const id = Math.min(...this.availableStickerIds);
      this.availableStickerIds.delete(id);
      return id;
    }
    return this.nextStickerId++;
  }

  // 添加删除贴纸的方法
  deleteSticker(element) {
    const stickerId = parseInt(element.dataset.stickerId);

    // 从列表中移除贴纸
    this.stickers = this.stickers.filter((sticker) => sticker.id !== stickerId);

    // 回收ID
    this.availableStickerIds.add(stickerId);

    // 如果是当前选中的元素，清除选中状态
    if (this.selectedElement === element) {
      this.selectedElement = null;
      this.updateCursor();
    }

    // 从DOM中除贴纸元素
    element.remove();
  }

  // 添加保存数据方法
  async saveApartmentData() {
    // 获取保存按钮
    const saveButton = this.shadowRoot.getElementById("save-button");
    if (!saveButton) return;

    // 如果按钮已禁用,说明正在保存中,直接返回
    if (saveButton.disabled) return;

    try {
      // 禁用按钮并显示加载状态
      saveButton.disabled = true;
      const originalContent = saveButton.innerHTML;
      saveButton.innerHTML = `
        <div class="loading-spinner"></div>
        <span>保存中...</span>
      `;

      const data = this.prepareDataToSave();
      const senderData = this.prepareSenderData();
      console.log("保存-data", data);
      console.log("保存-senderData", senderData);
      
      // 添加可视化调用
      this.visualizeSenderData(senderData);
      
      await this.hass.callWS({
        type: "airibes/save_apartment_data",
        apartment_id: this.currentApartmentId,
        data: data,
        senderData: senderData,
      });

      // 保存成功
      saveButton.innerHTML = `
        <ha-icon icon="mdi:check"></ha-icon>
        <span>已保存</span>
      `;
      this.showToast(this.translate("save_success"));

      // 2秒后恢复按钮原始状态
      setTimeout(() => {
        saveButton.disabled = false;
        saveButton.innerHTML = originalContent;
      }, 2000);

    } catch (error) {
      console.error("保存户型数据失败:", error);
      
      // 显示错误状态
      saveButton.innerHTML = `
        <ha-icon icon="mdi:alert"></ha-icon>
        <span>保存失败</span>
      `;
      this.showToast(this.translate("save_failed"));

      // 2秒后恢复按钮原始状态
      setTimeout(() => {
        saveButton.disabled = false;
        saveButton.innerHTML = originalContent;
      }, 2000);
    }
  }

  // 准备保存的数据
  prepareDataToSave() {
    console.log("准备保存数据:", {
      rooms: this.rooms,
      areas: this.areas,
      stickers: this.stickers,
      devices: this.placedDevices,
    });

    return {
      rooms: this.rooms.map((room) => {
        // 找到房间内的所有设备
        const roomDevices = this.placedDevices.filter(device => {
          // 获取设备的中心点坐标
          const deviceCenterX = device.realLeft + (device.width || 0) / 2;
          const deviceCenterY = device.realTop + (device.height || 0) / 2;
          
          // 检查设备是否在房间内
          return deviceCenterX >= room.realLeft && 
                 deviceCenterX <= (room.realLeft + room.realWidth) &&
                 deviceCenterY >= room.realTop && 
                 deviceCenterY <= (room.realTop + room.realHeight);
        });

        console.log(`房间 ${room.id} 内的设备:`, roomDevices);

        return {
          id: room.id,
          type: room.type,
          name: room.name,
          width: room.realWidth,
          height: room.realHeight,
          left: room.realLeft,
          top: room.realTop,
          color: room.color,
          rotation: room.rotation || 0,
          devices: roomDevices.map(device => device.id)  // 添加房间内的设备ID列表
        };
      }),
      areas: this.areas.map((area) => ({
        id: area.id,
        type: area.type,
        name: area.name,
        width: area.realWidth,
        height: area.realHeight,
        left: area.realLeft,
        top: area.realTop,
        color: area.color,
        areaType: area.areaType,
        reportEvents: area.reportEvents,
        visible: area.visible,
        rotation: area.rotation || 0,
        isValid: area.isValid // 添加 isValid 字段
      })),
      stickers: this.stickers.map((sticker) => {
        const element = sticker.element;
        const rotation = element.style.transform
          ? parseInt(
              element.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ||
                "0"
            )
          : 0;

        return {
          id: sticker.id,
          type: sticker.type,
          width: sticker.realWidth,
          height: sticker.realHeight,
          left: Math.round(sticker.realLeft),
          top: Math.round(sticker.realTop),
          rotation: rotation,
          isValid: sticker.type === "door" ? sticker.isValid : true // 只为门添加有效性字段
        };
      }),
      devices: this.placedDevices.map((device) => ({
        id: device.id,
        type: device.type,
        left: Math.round(device.realLeft),
        top: Math.round(device.realTop),
        rotation: device.rotation || 0,
        installHeight: device.installHeight || 0,
        installAngle: device.installAngle || 0,
        visible: device.visible,
      })),
      // 保存计数器和可用ID集合
      nextRoomId: this.nextRoomId,
      nextAreaId: this.nextAreaId,
      nextStickerId: this.nextStickerId,
      availableRoomIds: Array.from(this.availableRoomIds),
      availableAreaIds: Array.from(this.availableAreaIds),
      availableStickerIds: Array.from(this.availableStickerIds),
    };
  }

  // 准备发送数据（按房间划分）
  prepareSenderData() {
    const senderData = {};

    // 遍历所有设备
    this.placedDevices.forEach((device) => {
      if (device.type !== 'radar') return; // 如果设备类型不是雷达，跳过
      // 找到包含该设备的房间
      const room = this.findRoomContainingDevice(device);
      if (!room) return; // 如果设备不在任何间内，跳过

      // 生成版本号
      const randomCode = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, "0");
      const timestamp = Math.floor(Date.now() / 1000);
      const version = `HASS_${randomCode}_${this.currentApartmentId}_${timestamp}`;
      // 计算雷达角度
      let angle = -90; // 默认角度为-90度
      if (device.rotation) {
        // 将device.rotation转换为angle
        // device.rotation为0时，angle为-90
        // device.rotation为90时，angle为-180
        // device.rotation为180时，angle为-270（等同于90）
        // device.rotation为270时，angle为0
        angle = (-90 - device.rotation) % 360;
        // 确保角度在-360到360之间
        if (angle <= -360) {
          angle += 360;
        } else if (angle > 360) {
          angle -= 360;
        }
        // 如果角度小于-270，转换为正角度表示
        if (angle <= -270) {
          angle += 360;
        }
      }

      // 准备房间数据
      const roomData = {
        version: version,
        room_id: room.id, // 添加房间ID
        apartment_id: this.currentApartmentId, //当前户型ID
        // 雷达设备数据（转换为毫米）
        radar: {
          position: {
            x: Math.round(device.realLeft * 10), // cm转mm
            y: Math.round(device.realTop * 10), // cm转mm
            z: device.installHeight * 10 || 1600, // cm转mm，默认1400mm
          },
          angle: angle, // 使用转换后的角度
          installAngle: device.installAngle,
        },
        // 房间区域数据（转换为毫米）
        roomRegion: [
          {
            x: Math.round(room.realLeft * 10),
            y: Math.round(room.realTop * 10),
          }, // cm转mm
          {
            x: Math.round((room.realLeft + room.realWidth) * 10),
            y: Math.round(room.realTop * 10),
          },
          {
            x: Math.round((room.realLeft + room.realWidth) * 10),
            y: Math.round((room.realTop + room.realHeight) * 10),
          },
          {
            x: Math.round(room.realLeft * 10),
            y: Math.round((room.realTop + room.realHeight) * 10),
          },
        ],
        // 合并区域和门的数据
        region: [
          // 处理普通区域（转换为毫米），过滤掉无效区域
          ...this.findRegionsInRoom(room)
              .filter(area => area.isValid) // 只包含有效的区域
              .map((area, index) => ({
                  "area-attribute": area.type === "monitor-area" ? 4 : 1,
                  "area-type": area.areaType,
                  "area-id": area.id,
                  "area-sensitivity": 1,
                  points: [
                      {
                          x: Math.round(area.realLeft * 10),
                          y: Math.round(area.realTop * 10),
                      },
                      {
                          x: Math.round((area.realLeft + area.realWidth) * 10),
                          y: Math.round(area.realTop * 10),
                      },
                      {
                          x: Math.round((area.realLeft + area.realWidth) * 10),
                          y: Math.round((area.realTop + area.realHeight) * 10),
                      },
                      {
                          x: Math.round(area.realLeft * 10),
                          y: Math.round((area.realTop + area.realHeight) * 10),
                      },
                  ],
              })),
          // 处理放置在房间墙上的门（转换为毫米）
          ...this.findDoorsOnRoomWalls(room)
            .filter(door => door.isValid) // 只包含有效的门
            .map((door) => {
              // 计算门的中心点
              const centerX = door.realLeft + door.realWidth / 2;
              const centerY = door.realTop + door.realHeight / 2;
              
              // 根据门的旋转角度计算顶点
              const isHorizontal = (door.rotation === 90 || door.rotation === 270);
              const doorWidth = isHorizontal ? door.realHeight + 10 : door.realWidth + 100;
              const doorHeight = isHorizontal ? door.realWidth + 100 : door.realHeight + 10;
              
              // 计算四个顶点坐标
              const points = [
                // 左上角
                {
                  x: Math.round((centerX - doorWidth/2) * 10),
                  y: Math.round((centerY - doorHeight/2) * 10)
                },
                // 右上角
                {
                  x: Math.round((centerX + doorWidth/2) * 10),
                  y: Math.round((centerY - doorHeight/2) * 10)
                },
                // 右下角
                {
                  x: Math.round((centerX + doorWidth/2) * 10),
                  y: Math.round((centerY + doorHeight/2) * 10)
                },
                // 左下角
                {
                  x: Math.round((centerX - doorWidth/2) * 10),
                  y: Math.round((centerY + doorHeight/2) * 10)
                }
              ];

              return {
                "area-attribute": 2, // 门的区域属性为2
                "area-type": 0, // 门的区域类型为0
                "area-id": door.id,
                "area-sensitivity": 1,
                points: points
              };
            }),
        ],
        // 处理其他贴纸（除了门）（转换为毫米）
        furniture: this.findStickersInRoom(room)
          .filter((sticker) => sticker.type !== "door") // 排除门贴纸
          .map((sticker, index) => {
            const element = sticker.element;
            const rotation0 = element.style.transform
          ? parseInt(
              element.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ||
                "0"
            )
          : 0;
            // 计算贴纸的中心点
            const centerX = sticker.realLeft + sticker.realWidth / 2;
            const centerY = sticker.realTop + sticker.realHeight / 2;
            // 计算旋转角度（弧度），注意改变旋转方向（加负号）
            const rotation = (rotation0 || 0) * Math.PI / 180;
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            
            // 计算四个顶点相对于中心点的偏移
            const halfWidth = sticker.realWidth / 2;
            const halfHeight = sticker.realHeight / 2;
            
            // 计算旋转后的四个顶点
            const points = [
              // 左上角
              {
                x: Math.round((centerX + (-halfWidth * cos - halfHeight * sin)) * 10),
                y: Math.round((centerY + (-halfWidth * sin + halfHeight * cos)) * 10)
              },
              // 右上角
              {
                x: Math.round((centerX + (halfWidth * cos - halfHeight * sin)) * 10),
                y: Math.round((centerY + (halfWidth * sin + halfHeight * cos)) * 10)
              },
              // 右下角
              {
                x: Math.round((centerX + (halfWidth * cos + halfHeight * sin)) * 10),
                y: Math.round((centerY + (halfWidth * sin - halfHeight * cos)) * 10)
              },
              // 左下角
              {
                x: Math.round((centerX + (-halfWidth * cos + halfHeight * sin)) * 10),
                y: Math.round((centerY + (-halfWidth * sin - halfHeight * cos)) * 10)
              }
            ];

            return {
              "paster-type": this.getPasterType(sticker.type),
              "paster-id": index + 1,
              points: points
            };
          }),
      };

      // 使用设备ID作为键
      senderData[device.id] = roomData;
    });

    return senderData;
  }

  // 判断元素是否在房间内
  isElementInRoom(element, room) {
    const elementRect = {
      left: element.left || element.element.offsetLeft,
      top: element.top || element.element.offsetTop,
      width: element.width || element.element.offsetWidth,
      height: element.height || element.element.offsetHeight,
    };

    const roomRect = {
      left: room.left,
      top: room.top,
      width: room.width,
      height: room.height,
    };

    return !(
      elementRect.left + elementRect.width <= roomRect.left ||
      elementRect.left >= roomRect.left + roomRect.width ||
      elementRect.top + elementRect.height <= roomRect.top ||
      elementRect.top >= roomRect.top + roomRect.height
    );
  }

  // 添加加载数据方法
  async loadApartmentData() {
    try {
      // 先加载户型列表
      const apartmentsResponse = await this.hass.callWS({
        type: "airibes/get_apartments",
      });

      if (apartmentsResponse && apartmentsResponse.apartments) {
        this.apartments = apartmentsResponse.apartments;
        // 如果没有当前户型ID，使用第一个户型的ID
        if (!this.currentApartmentId && this.apartments.length > 0) {
          this.currentApartmentId = this.apartments[0].id;
        }
      }

      // 确保有型ID后再载数据
      if (this.currentApartmentId) {
        const response = await this.hass.callWS({
          type: "airibes/load_apartment_data",
          apartment_id: this.currentApartmentId,
        });

        if (response && response.data) {
          await this.restoreApartmentData(response.data);
        }
      } else {
        console.warn("没有可用的户型ID");
      }
    } catch (error) {
      console.error("加载户型数据失败:", error);
      this.showToast(this.translate("load_apartment_data_failed"));
    }
  }

  // 修改 restoreApartmentData 方法，移除门 ID 显示
  async restoreApartmentData(data) {
    // 清除现有元素
    this.clearAllElements();

    // 恢复ID计数器和可重用ID集合
    this.nextRoomId = data.nextRoomId;
    this.nextAreaId = data.nextAreaId;
    this.nextStickerId = data.nextStickerId;
    this.availableRoomIds = new Set(data.availableRoomIds);
    this.availableAreaIds = new Set(data.availableAreaIds);
    this.availableStickerIds = new Set(data.availableStickerIds);

    // 恢复房间
    for (const roomData of data.rooms) {
      const room = {
        ...roomData,
        realLeft: roomData.left,
        realTop: roomData.top,
        left: roomData.left * this.scale,
        top: roomData.top * this.scale,
        width: roomData.width * this.scale,
        height: roomData.height * this.scale,
        realWidth: roomData.width,
        realHeight: roomData.height,
      };
      this.rooms.push(room);
      this.drawRoom(room);
    }

    // 恢复区域
    for (const areaData of data.areas) {
      const area = {
        ...areaData,
        realLeft: areaData.left,
        realTop: areaData.top,
        left: areaData.left * this.scale,
        top: areaData.top * this.scale,
        width: areaData.width * this.scale,
        height: areaData.height * this.scale,
        realWidth: areaData.width,
        realHeight: areaData.height,
      };
      this.areas.push(area);
      this.drawArea(area);
    }

    // 恢复贴纸
    for (const stickerData of data.stickers) {
      const stickerInfo = STICKER_TYPES[stickerData.type];
      if (!stickerInfo) continue;

      // 使用保存的真实尺寸
      const realWidth = stickerData.width || stickerInfo.width;
      const realHeight = stickerData.height || stickerInfo.height;
      const realLeft = stickerData.left;
      const realTop = stickerData.top;

      // 计算显示尺寸
      const displayWidth = realWidth * this.scale;
      const displayHeight = realHeight * this.scale;

      const stickerElement = document.createElement("div");
      stickerElement.className = "sticker-element";
      stickerElement.dataset.stickerId = stickerData.id;
      stickerElement.dataset.stickerType = stickerData.type;
      
      // 使用真实位置计算显示位置
      stickerElement.style.left = `${realLeft * this.scale}px`;
      stickerElement.style.top = `${realTop * this.scale}px`;
      stickerElement.style.width = `${displayWidth}px`;
      stickerElement.style.height = `${displayHeight}px`;

      if (stickerData.rotation) {
        stickerElement.style.transform = `rotate(${stickerData.rotation}deg)`;
      }

      // 如果是门且无效，添加无效样式
      if (stickerData.type === "door" && stickerData.isValid === false) {
        stickerElement.style.backgroundColor = "rgba(255, 0, 0, 0.1)";
        stickerElement.style.border = "2px dashed #FF0000";
        
        // 添加警告提示
        const warningLabel = document.createElement('div');
        warningLabel.className = 'area-warning';
        warningLabel.textContent = this.translate("max_doors_in_room");
        stickerElement.appendChild(warningLabel);
      }

      stickerElement.innerHTML = `
        <div class="sticker-content">
          ${stickerInfo.getSvg()}
          <span class="sticker-size">${realWidth}×${realHeight}</span>
        </div>
      `;

      this.stickers.push({
        id: stickerData.id,
        type: stickerData.type,
        element: stickerElement,
        realWidth: realWidth,
        realHeight: realHeight,
        realLeft: realLeft,
        realTop: realTop,
        width: displayWidth,
        height: displayHeight,
        rotation: stickerData.rotation || 0,
        name: stickerInfo.name,
        isValid: stickerData.isValid !== undefined ? stickerData.isValid : true // 恢复有效性状态
      });

      this.setupStickerEvents(stickerElement);
      this.shadowRoot.querySelector(".drawing-area").appendChild(stickerElement);
    }

    // 恢复设备
    for (const deviceData of data.devices) {
      const realSize = 10; // 设备真实尺寸10cm
      const displaySize = realSize * this.scale;

      // 计算显示位置时考虑偏移量
      const displayLeft = deviceData.left * this.scale;
      const displayTop = deviceData.top * this.scale;

      const deviceElement = document.createElement("div");
      deviceElement.className = "device-element";
      deviceElement.dataset.deviceId = deviceData.id;
      deviceElement.dataset.deviceType = deviceData.type;
      deviceElement.style.left = `${displayLeft - displaySize / 2}px`; // 居中放置
      deviceElement.style.top = `${displayTop - displaySize / 2}px`; // 居中放置
      deviceElement.style.width = `${displaySize}px`; // 设置宽度
      deviceElement.style.height = `${displaySize}px`; // 设置高度

      // 应用旋转角度
      if (deviceData.rotation) {
        deviceElement.style.transform = `rotate(${deviceData.rotation}deg)`;
      }
      let icon = "mdi:help-circle"; // 默认图标
      let iconStyle = "";
      switch (deviceData.type) {
        case "radar":
          icon = "mdi:radar";
          break;
        case "light":
          icon = "mdi:lightbulb";
          iconStyle = "color: var(--warning-color);"; // 灯泡使用黄色
          break;
        case "climate":
          icon = "mdi:air-conditioner";
          iconStyle = "color: var(--info-color);"; // 空调使用蓝色
          break;
      }
      const shortName = deviceData.id.slice(-4);
      deviceElement.innerHTML = `
            <div class="device-content">
                <ha-icon icon="${icon}" style="${iconStyle}"></ha-icon>
                <span class="device-name">${shortName}</span>
            </div>
        `;

      // 添加到已放置列表
      this.placedDevices.push({
        id: deviceData.id,
        type: deviceData.type,
        element: deviceElement,
        realLeft: deviceData.left,
        realTop: deviceData.top,
        left: displayLeft, // 保存真实位置时加回偏移量
        top: displayTop, // 保存真实位置时加回偏移量
        name: `雷达-${shortName}`,
        shortName: shortName,
        rotation: deviceData.rotation || 0,
        installHeight: deviceData.installHeight || 0,
        installAngle: deviceData.installAngle || 0,
        visible: deviceData.visible,
      });

      this.shadowRoot.querySelector(".drawing-area").appendChild(deviceElement);
    }

    // 确保没有元素被选中
    this.selectedElement = null;
    this.updateCursor();
  }

  // 清除所有元素
  clearAllElements() {
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    if (drawingArea) {
      // 保留网格画布
      const gridCanvas = drawingArea.querySelector("canvas");
      drawingArea.innerHTML = "";
      if (gridCanvas) {
        drawingArea.appendChild(gridCanvas);
      }
    }

    // 清数据
    this.rooms = [];
    this.areas = [];
    this.stickers = [];
    this.placedDevices = [];
    this.selectedElement = null;
  }

  // 显示提示信息
  showToast(message) {
    // 创建提示元素
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    this.shadowRoot.appendChild(toast);

    // 3秒后移除
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // 修改 drawDoors 方法
  drawDoors(ctx) {
    const { stickers = [] } = this.apartmentData;
    // 只处理门类型的贴纸
    const doorStickers = stickers.filter((sticker) => sticker.type === "door");

    if (doorStickers.length > 0) {
      doorStickers.forEach((sticker) => {
        ctx.save();

        // 应用旋转
        if (sticker.rotation) {
          const centerX = sticker.left + sticker.width / 2;
          const centerY = sticker.top + sticker.height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((sticker.rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        // 设置门的样式
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 4; // 增加线条度

        // 计算门的厚度（使用宽度的40%作为门的厚度）
        const doorThickness = sticker.width * 0.4;

        // 绘制门的主体部分（矩形）
        ctx.beginPath();
        ctx.moveTo(sticker.left, sticker.top);
        ctx.lineTo(sticker.left + doorThickness, sticker.top);
        ctx.stroke();

        // 绘制门的弧线部分
        ctx.beginPath();
        ctx.arc(
          sticker.left + doorThickness, // 圆心x坐标
          sticker.top, // 圆心y坐标
          sticker.height, // 半径等于门的高度
          -Math.PI / 2, // 起始角度（正上方）
          Math.PI / 2, // 结束角度（正下方）
          false // 顺时针方向
        );
        ctx.stroke();

        // 绘制门的底部线条
        ctx.beginPath();
        ctx.moveTo(sticker.left, sticker.top + sticker.height);
        ctx.lineTo(sticker.left + doorThickness, sticker.top + sticker.height);
        ctx.stroke();

        ctx.restore();
      });
    }
  }

  // 添加查找最近墙的方法
  findNearestWall(doorRect) {
    const alignThreshold = 20; // 对齐阈值（像素）
    let nearestWall = null;
    let minDistance = alignThreshold;

    this.rooms.forEach((room) => {
      // 检查四面墙
      const walls = [
        {
          // 上墙
          x1: room.left,
          y1: room.top,
          x2: room.left + room.width,
          y2: room.top,
          type: "horizontal",
          center: room.left + room.width / 2,
        },
        {
          // 下墙
          x1: room.left,
          y1: room.top + room.height,
          x2: room.left + room.width,
          y2: room.top + room.height,
          type: "horizontal",
          center: room.left + room.width / 2,
        },
        {
          // 左墙
          x1: room.left,
          y1: room.top,
          x2: room.left,
          y2: room.top + room.height,
          type: "vertical",
          center: room.top + room.height / 2,
        },
        {
          // 右墙
          x1: room.left + room.width,
          y1: room.top,
          x2: room.left + room.width,
          y2: room.top + room.height,
          type: "vertical",
          center: room.top + room.height / 2,
        },
      ];

      walls.forEach((wall) => {
        const distance = this.calculateDistanceToWall(doorRect, wall);
        if (distance < minDistance) {
          minDistance = distance;
          nearestWall = wall;
        }
      });
    });

    return nearestWall;
  }

  // 修改计算到墙距离的方法
  calculateDistanceToWall(doorRect, wall) {
    const doorThickness = doorRect.width * 0.4; // 门的厚度
    const doorCenterX = doorRect.left + doorThickness / 2;
    const doorCenterY = doorRect.top + doorRect.height / 2;

    if (wall.type === "horizontal") {
      // 检查门是否在墙的水平范围内
      if (doorCenterX >= wall.x1 && doorCenterX <= wall.x2) {
        return Math.abs(doorRect.top + doorRect.height / 2 - wall.y1);
      }
    } else {
      // 检查门是否在墙的垂直范围内
      if (doorCenterY >= wall.y1 && doorCenterY <= wall.y2) {
        return Math.abs(doorRect.left + doorThickness / 2 - wall.x1);
      }
    }
    return Infinity;
  }

  // 修改门对齐到墙的方法
  alignDoorToWall(doorRect, wall) {
    const alignedPosition = {
        left: doorRect.left,
        top: doorRect.top,
        rotation: 0,
        isValid: true
    };

    const doorThickness = doorRect.width * 0.4;

    // 将门的位置转换为实际尺寸（厘米）
    const doorRealRect = {
        left: Math.round(doorRect.left / this.scale),
        top: Math.round(doorRect.top / this.scale),
        width: Math.round(doorRect.width / this.scale),
        height: Math.round(doorRect.height / this.scale)
    };

    // 检查房间内的门数量
    const rooms = this.rooms.filter(room => {
        if (wall.type === "horizontal") {
            // 检查水平墙是否属于这个房间
            const wallY = Math.round(wall.y1 / this.scale); // 转换为实际尺寸
            const wallX = Math.round(wall.x1 / this.scale);
            const wallX2 = Math.round(wall.x2 / this.scale);
            
            // 首先检查Y坐标是否匹配房间的上下边界
            const isYMatch = Math.abs(wallY - room.realTop) < 10 || 
                           Math.abs(wallY - (room.realTop + room.realHeight)) < 10;
            
            // 然后检查门的中心点是否在房间的X范围内
            const doorCenterX = doorRealRect.left + doorRealRect.width/2;
            const isXInRange = doorCenterX >= room.realLeft && 
                             doorCenterX <= room.realLeft + room.realWidth;
            return isYMatch && isXInRange;
        } else {
            // 检查垂直墙是否属于这个房间
            const wallX = Math.round(wall.x1 / this.scale);
            const wallY = Math.round(wall.y1 / this.scale);
            const wallY2 = Math.round(wall.y2 / this.scale);
            
            // 首先检查X坐标是否匹配房间的左右边界
            const isXMatch = Math.abs(wallX - room.realLeft) < 10 || 
                           Math.abs(wallX - (room.realLeft + room.realWidth)) < 10;
            
            // 然后检查门的中心点是否在房间的Y范围内
            const doorCenterY = doorRealRect.top + doorRealRect.height/2;
            const isYInRange = doorCenterY >= room.realTop && 
                             doorCenterY <= room.realTop + room.realHeight;
            return isXMatch && isYInRange;
        }
    });

    // 检查所有相关房间的门数量
    let isValid = true;
    for (const room of rooms) {
        const doorsOnWalls = this.findDoorsOnRoomWalls(room);
        if (doorsOnWalls.length >= 5) {
            isValid = false;
            this.showToast(this.translate("max_doors_in_room"));
            break;
        }
    }

    alignedPosition.isValid = isValid;

    if (wall.type === "horizontal") {
        // 水平墙，门垂直放置
        alignedPosition.rotation = 90;
        alignedPosition.left = doorRect.left;
        // 确保门在墙的范围内
        const minLeft = wall.x1;
        const maxLeft = wall.x2 - doorThickness;
        alignedPosition.left = Math.max(
            minLeft,
            Math.min(maxLeft, alignedPosition.left)
        );
        // 对齐到墙的位置
        alignedPosition.top = wall.y1 - doorRect.height / 2;
    } else {
        // 垂直墙，门水平放置
        alignedPosition.rotation = 0;
        alignedPosition.left = wall.x1 - doorRect.width / 2;
        alignedPosition.top = doorRect.top;
        // 确保门在墙的范围内
        const minTop = wall.y1;
        const maxTop = wall.y2 - doorThickness;
        alignedPosition.top = Math.max(
            minTop,
            Math.min(maxTop, alignedPosition.top)
        );
    }

    return alignedPosition;
  }

  // 添加 setupStickerEvents 方法
  setupStickerEvents(stickerElement) {
    // 添加长按选中功能
    stickerElement.addEventListener("mousedown", (e) => {
      if (e.button === 0) {
        // 左键点击
        // 开始长按计时
        this.longPressTimer = setTimeout(() => {
          // 长按时选中元素
          this.selectElement(stickerElement);
        }, 500);

        // 如果元素已经被选中，直接开始拖动
        if (stickerElement === this.selectedElement) {
          this.isDragging = true;
          this.dragStartPos = {
            x: e.clientX,
            y: e.clientY,
            left: stickerElement.offsetLeft,
            top: stickerElement.offsetTop,
          };
          // 创建对齐线
          this.createAlignmentLines();
        }
      }
      e.stopPropagation();
    });

    // 添加鼠标移动事件
    stickerElement.addEventListener("mousemove", (e) => {
      if (this.isDragging && this.selectedElement === stickerElement) {
        const dx = e.clientX - this.dragStartPos.x;
        const dy = e.clientY - this.dragStartPos.y;

        const newLeft = this.dragStartPos.left + dx;
        const newTop = this.dragStartPos.top + dy;

        // 获取对齐位置
        const { alignX, alignY } = this.updateAlignmentLines(
          stickerElement,
          newLeft,
          newTop
        );

        // 应用对齐后的位置
        const finalLeft = alignX !== null ? alignX : newLeft;
        const finalTop = alignY !== null ? alignY : newTop;

        stickerElement.style.left = `${finalLeft}px`;
        stickerElement.style.top = `${finalTop}px`;

        e.preventDefault();
      }
    });

    // 添加鼠标松开事件
    stickerElement.addEventListener("mouseup", () => {
      // 清除长按计时器
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }

      // 如果正在拖动，更新位置
      if (this.isDragging) {
        this.isDragging = false;
        this.dragStartPos = null;

        // 隐藏对齐线
        this.hideVerticalAlignmentLine();
        this.hideHorizontalAlignmentLine();

        // 更新贴纸的真实位置
        const stickerId = parseInt(stickerElement.dataset.stickerId);
        const sticker = this.stickers.find((s) => s.id === stickerId);
        if (sticker) {
          sticker.realLeft = parseFloat(stickerElement.style.left) / this.scale;
          sticker.realTop = parseFloat(stickerElement.style.top) / this.scale;
        }
      }
    });

    // 添加鼠标离开事件
    stickerElement.addEventListener("mouseleave", () => {
      // 清除长按计时器
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    });
  }

  // 添加查找包含设备的房间方法
  findRoomContainingDevice(device) {
    return this.rooms.find((room) => {
      const deviceCenter = {
        x: device.realLeft,
        y: device.realTop,
      };
      return this.isPointInRoom(deviceCenter, room);
    });
  }

  // 添加查找房间内区域方法
  findRegionsInRoom(room) {
    return this.areas.filter((area) => {
      const areaCenter = {
        x: area.realLeft + area.realWidth / 2,
        y: area.realTop + area.realHeight / 2,
      };
      return this.isPointInRoom(areaCenter, room);
    });
  }

  // 添加查找房间内贴纸方法
  findStickersInRoom(room) {
    return this.stickers.filter((sticker) => {
      const stickerCenter = {
        x: sticker.realLeft + sticker.width / 2,
        y: sticker.realTop + sticker.height / 2,
      };
      return this.isPointInRoom(stickerCenter, room);
    });
  }

  // 添加判断点是否在房间内的方法
  isPointInRoom(point, room) {
    return (
      point.x >= room.realLeft &&
      point.x <= room.realLeft + room.realWidth &&
      point.y >= room.realTop &&
      point.y <= room.realTop + room.realHeight
    );
  }

  // 获取贴纸类型映射
  getPasterType(stickerType) {
    // 贴纸类型映射表
    const typeMap = {
      sofa: 1, // 沙发
      bed: 2, // 床
      table: 3, // 桌子
      chair: 4, // 椅子
      cabinet: 5, // 柜子
      tv: 6, // 电视
      window: 7, // 窗户
      plant: 8, // 植物
      lamp: 9, // 灯具
      door: 10, // 门
      bathroom: 11, // 卫浴设施
      kitchen: 12, // 厨房设施
      stairs: 13, // 楼梯
      elevator: 14, // 电梯
      column: 15, // 柱子
      wall: 16, // 墙
      other: 99, // 其他
    };

    // 返回映射的类型ID，如果没有对应的映射则返回其他(99)
    return typeMap[stickerType] || 99;
  }

  // 添加查找房间墙上的门的方法
  findDoorsOnRoomWalls(room) {
    return this.stickers.filter((sticker) => {
        // 只处理门类型的贴纸
        if (sticker.type !== "door") return false;

        // 获取门的中心点（使用实际尺寸）
        const doorCenter = {
            x: sticker.realLeft + sticker.realWidth / 2,
            y: sticker.realTop + sticker.realHeight / 2
        };

        // 定义墙的容差范围（厘米）
        const tolerance = 5;
        // 获取门的旋转角度
        const rotation = sticker.rotation || 0;
        const isHorizontal = (rotation === 90 || rotation === 270);

        // 检查是否在上下墙
        const onHorizontalWall =
            Math.abs(doorCenter.y - room.realTop) <= tolerance ||
            Math.abs(doorCenter.y - (room.realTop + room.realHeight)) <= tolerance;

        // 检查是否在左右墙
        const onVerticalWall =
            Math.abs(doorCenter.x - room.realLeft) <= tolerance ||
            Math.abs(doorCenter.x - (room.realLeft + room.realWidth)) <= tolerance;

        // 根据门的旋转状态调整检查范围
        let inRoomRange;
        if (isHorizontal) {
            // 水平放置的门（旋转90°或270°）
            inRoomRange =
                doorCenter.x >= (room.realLeft - tolerance) &&
                doorCenter.x <= (room.realLeft + room.realWidth + tolerance) &&
                doorCenter.y >= (room.realTop - sticker.realWidth/2) &&  // 使用实际尺寸
                doorCenter.y <= (room.realTop + room.realHeight + sticker.realWidth/2);
        } else {
            // 垂直放置的门（旋转0°或180°）
            inRoomRange =
                doorCenter.x >= (room.realLeft - sticker.realWidth/2) &&
                doorCenter.x <= (room.realLeft + room.realWidth + sticker.realWidth/2) &&
                doorCenter.y >= (room.realTop - tolerance) &&
                doorCenter.y <= (room.realTop + room.realHeight + tolerance);
        }

        // 门必须在墙上且在房间范围内
        return (onHorizontalWall || onVerticalWall) && inRoomRange;
    });
  }

  _handlePersonPositionsUpdate(event) {
    const { device_id, positions } = event.data;
    this.personPositions.set(device_id, positions);
    this.drawPersonPositions(); // 重新绘制人员位置
  }

  drawPersonPositions() {
    // 移除现有的人员标记
    this.shadowRoot
      .querySelectorAll(".person-marker")
      .forEach((el) => el.remove());

    // 遍历所有设备的人员位置
    this.personPositions.forEach((positions, deviceId) => {
      positions.forEach((pos) => {
        // 创建人员标记元素
        const marker = document.createElement("div");
        marker.className = "person-marker";

        // 计算显示位置（考虑缩放）
        const displayX = pos.x * this.scale;
        const displayY = pos.y * this.scale;

        // 设置位置
        marker.style.left = `${displayX}px`;
        marker.style.top = `${displayY}px`;

        this.shadowRoot.querySelector(".drawing-area").appendChild(marker);
      });
    });
  }

  // 添加可视化方法
  visualizeSenderData(senderData) {
    // 获取绘图区域
    const drawingArea = this.shadowRoot.querySelector(".drawing-area");
    
    // 移除旧的可视化层
    const oldVisualization = this.shadowRoot.querySelector(".sender-data-visualization");
    if (oldVisualization) {
      oldVisualization.remove();
    }
    
    // 创建新的可视化层
    const visualizationLayer = document.createElement("div");
    visualizationLayer.className = "sender-data-visualization";
    visualizationLayer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    
    // 创建 SVG 元素
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.width = "100%";
    svg.style.height = "100%";
    
    // 遍历每个设备的数据
    Object.values(senderData).forEach(deviceData => {
      // 绘制房间区域
      if (deviceData.roomRegion) {
        const points = deviceData.roomRegion.map(p => 
          `${(p.x/10) * this.scale},${(p.y/10) * this.scale}`
        ).join(" ");
        
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", points);
        polygon.setAttribute("fill", "none");
        polygon.setAttribute("stroke", "rgba(255,0,0,0.5)");
        polygon.setAttribute("stroke-width", "2");
        svg.appendChild(polygon);
      }
      
      // 绘制所有区域
      deviceData.region?.forEach(region => {
        const points = region.points.map(p => 
          `${(p.x/10) * this.scale},${(p.y/10) * this.scale}`
        ).join(" ");
        
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", points);
        polygon.setAttribute("fill", "none");
        polygon.setAttribute("stroke", region["area-attribute"] === 2 ? "rgba(255,0,0,0.8)" : "rgba(255,0,0,0.3)");
        polygon.setAttribute("stroke-width", "2");
        polygon.setAttribute("stroke-dasharray", region["area-attribute"] === 2 ? "5,5" : "none");
        svg.appendChild(polygon);
      });
      
      // 绘制家具
      deviceData.furniture?.forEach(furniture => {
        const points = furniture.points.map(p => 
          `${(p.x/10) * this.scale},${(p.y/10) * this.scale}`
        ).join(" ");
        
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygon.setAttribute("points", points);
        polygon.setAttribute("fill", "none");
        polygon.setAttribute("stroke", "rgba(255,0,0,0.2)");
        polygon.setAttribute("stroke-width", "1");
        svg.appendChild(polygon);
      });
    });
    
    visualizationLayer.appendChild(svg);
    drawingArea.appendChild(visualizationLayer);
    
    // 3秒后自动移除可视化
    setTimeout(() => {
      visualizationLayer.remove();
    }, 3000);
  }

  // 添加 findRoomAtPoint 方法
  findRoomAtPoint(realX, realY) {
    return this.rooms.find(room => {
        return realX >= room.realLeft &&
               realX <= room.realLeft + room.realWidth &&
               realY >= room.realTop &&
               realY <= room.realTop + room.realHeight;
    });
  }
} 

// 注册自定义元素
if (!customElements.get('apartment-view')) {
    customElements.define('apartment-view', ApartmentView);
} 
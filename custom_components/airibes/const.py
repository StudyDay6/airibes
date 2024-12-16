"""Constants for airibes."""
DOMAIN = "airibes"
DEFAULT_NAME = "Airibes"
DEFAULT_PANEL_TITLE = "Airibes"

# 雷达配置文件
RADAR_CLIFE_PROFILE = {
    "profile": [
        {"e": 1, "6": 1},
        {"1": 4, "e": 1},
        {"2": 4, "e": 1},
        {"3": 3, "e": 1},
        {"4": 3, "e": 1},
        {"5": 3, "e": 1},
        {"7": 1},
        {"8": 1},
        {"9": 0},
        {"10": 1},
        {"11": 2},
        {"12": 4},
        {"13": 0},
        {"14": 2},
        {"15": 2},
        {"16": 0},
        {"17": 4},
        {"18": 1},
        {"19": 1},
        {"20": 1},
        {"21": 1},
        {"22": 1},
        {"23": 1},
        {"24": 1},
        {"25": 1},
        {"26": 1},
        {"27": 1},
        {"28": 1},
        {"29": 1},
        {"30": 1},
        {"31": 1},
        {"32": 1},
        {"33": 1},
        {"34": 1},
        {"35": 1},
        {"36": 1},
        {"37": 1},
        {"38": 1},
        {"39": 1},
        {"40": 1},
        {"41": 1},
        {"42": 1},
        {"43": 1},
        {"44": 1},
        {"45": 1},
        {"46": 1},
        {"47": 1},
        {"48": 1},
        {"49": 1},
        {"50": 1},
        {"51": 1},
        {"52": 1},
        {"53": 1},
        {"54": 1},
        {"55": 2},
        {"57": 4},
        {"58": 0},
        {"59": 2},
        {"61": 4},
        {"62": 2},
        {"63": 4},
        {"64": 2},
        {"65": 2},
        {"66": 2},
        {"67": 4},
        {"68": 0},
        {"69": 4},
        {"70": 0},
        {"71": 4},
        {"72": 4},
        {"73": 4},
        {"74": 4},
        {"75": 0},
        {"76": 4},
        {"77": 4},
        {"78": 4},
    ],
    "profileVer": 178
}

# 面板相关常量
PANEL_ICON = "mdi:view-dashboard"
PANEL_URL = "/api/panel/airibes"
FRONTEND_SCRIPT_URL = "/frontend_static/my-panel.js"
APARTMENT_SCRIPT_URL = "/frontend_static/apartment.js"
DEVICE_LIBRARY_SCRIPT_URL = "/frontend_static/device-library.js"
DEVICE_IMPORT_SCRIPT_URL = "/frontend_static/device-import.js"
PANEL_CSS_URL = "/frontend_static/my-panel.css"
APARTMENT_CSS_URL = "/frontend_static/apartment.css"
DEVICE_LIBRARY_CSS_URL = "/frontend_static/device-library.css"
DEVICE_IMPORT_CSS_URL = "/frontend_static/device-import.css"
# 存储相关常量
STORAGE_VERSION = 1
APARTMENTS_STORAGE_KEY = f"{DOMAIN}.apartments"  # 户型列表存储键
APARTMENT_DATA_KEY = f"{DOMAIN}.apartment_data"  # 户型数据存储键
RADAR_STORAGE_KEY = f"{DOMAIN}.radar_sensors"    # 雷达设备存储键
IMPORTED_DEVICES_KEY = "imported_devices"

# 加密相关常量
AES_KEY_HEX = '2ccd05645e070402d8fe30292dfe2933'
AES_IV_HEX = '00000000000000000000000000000000'

# 事件常量
EVENT_APARTMENT_VIEW_VISIBLE = f"{DOMAIN}_apartment_view_visible"  # 户型视图可见性事件
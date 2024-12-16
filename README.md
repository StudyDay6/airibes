# Airibes Integration for Home Assistant

一个为"Airibes"人体传感器管理户型布局和设备控制的 Home Assistant 集成，支持户型编辑和设备控制。

## 功能特点

### 户型管理
- 支持多户型创建和管理
- 可视化户型布局编辑
- 房间和区域的智能管理
- 支持门、窗等标记物管理

### 设备控制
- 雷达设备管理
  - 自动发现和配置
  - 在线状态监控
  - 灵敏度调节
  - 无人重置功能
- 支持导入其他设备
  - 灯光设备
  - 空调设备
  - 其他智能设备

## 安装

1. 将 `custom_components/airibes` 文件夹复制到你的 Home Assistant 配置目录下
2. 重启 Home Assistant
3. 在集成页面中搜索并添加 "Airibes"

## 配置-使用说明

### 基础配置 config_flow
1. 在集成页面添加 Airibes
2. 设置面板标题
3. 选择是否在卸载时清理户型数据，默认清除

### MQTT 配网数据连接
需安装好MQTT集成并配置好
每个人体传感器设备都需要配网才能与集成连接通信
打开人体传感器设备，用手机或平板电脑连接设备热点（OCCUP-SENSOR-XXXX）再进入设备网页：192.168.4.1，选择Wi-Fi连接
路由器网络配置：
WiFi名称： xxxx
wifi密码：xxx
MqttUrl： <MQTT集成配置的服务器地址>
UserName：<MQTT_USERNAME>
Password: <MQTT_PassWord>
保存 配网成功即与设备通信连接成功

### 户型
1. 进入 Airibes 面板
2. 点击添加户型
3. 编辑户型布局
4. 添加房间和区域
5. 配置设备位置


## 注意事项
- 确保 MQTT 集成已正确配置
- 建议定期备份户型数据
- 设备首次使用需要进行配网，删除设备或设备恢复出厂设置需重新配网

## 问题反馈
如果你发现任何问题或有功能建议，请在 GitHub 上提交 issue。

## 许可证
MIT License 

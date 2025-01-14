"""Config flow for airibes."""
import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.components.mqtt import DOMAIN as MQTT_DOMAIN
from .const import DOMAIN, DEFAULT_NAME, DEFAULT_PANEL_TITLE
from .utils import get_translation_key

class AiribesConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return AiribesOptionsFlow(config_entry)

    async def async_step_user(self, user_input=None):
        """Handle a flow initialized by the user."""
        # 检查是否已经配置过
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            # 确保包含 clear_data_on_unload 选项，默认为 False
            if "clear_data_on_unload" not in user_input:
                user_input["clear_data_on_unload"] = False
                
            return self.async_create_entry(
                title="Airibes",
                data=user_input
            )

        schema = {
            vol.Required("panel_title", default="Airibes"): str,
            vol.Optional("clear_data_on_unload", default=False): bool,
        }

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(schema),
            description_placeholders={
                "device_name": "Airibes"
            }
        )

class AiribesOptionsFlow(config_entries.OptionsFlow):
    """Airibes 配置选项流程."""

    def __init__(self, config_entry):
        """初始化选项流程."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """处理选项."""
        if user_input is not None:
            # 更新配置条目的数据
            new_data = {
                **self.config_entry.data,
                "clear_data_on_unload": user_input.get("clear_data_on_unload", False)
            }
            
            self.hass.config_entries.async_update_entry(
                self.config_entry,
                data=new_data
            )
            
            return self.async_create_entry(title="", data=user_input)

        schema = {
            vol.Optional(
                "clear_data_on_unload",
                default=self.config_entry.data.get("clear_data_on_unload", False)
            ): bool,
        }

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(schema),
            description_placeholders={
                "device_name": self.config_entry.title
            }
        )
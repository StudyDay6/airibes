"""translation."""
import base64
import os
import json
from homeassistant.core import HomeAssistant
import aiofiles  # 需要添加这个导入

from .const import AES_KEY_HEX, AES_IV_HEX


class TranslationManager:
    """翻译管理器单例类."""
    _instance = None
    _hass = None
    _translations = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TranslationManager, cls).__new__(cls)
        return cls._instance

    @classmethod
    async def init(cls, hass: HomeAssistant):
        """初始化翻译管理器."""
        cls._hass = hass
        await cls._load_translations()

    @classmethod
    async def _load_translations(cls):
        """加载翻译文件."""
        if not cls._hass:
            return

        current_language = cls._hass.config.language if cls._hass else "en"
        
        # 获取当前文件所在目录
        current_dir = os.path.dirname(os.path.abspath(__file__))
        translations_dir = os.path.join(current_dir, "translations")
        
        try:
            # 先尝试加载当前语言
            translation_file = os.path.join(translations_dir, f"{current_language}.json")
            if not os.path.exists(translation_file):
                # 如果当前语言文件不存在，使用英语
                translation_file = os.path.join(translations_dir, "en.json")
            
            cls._translations = await cls.load_translations(translation_file)
                
        except Exception as e:
            cls._translations = {}

    @classmethod
    async def load_translations(cls, translation_file: str) -> dict:
        """异步加载翻译文件."""
        try:
            async with aiofiles.open(translation_file, 'r', encoding='utf-8') as f:
                content = await f.read()
                return json.loads(content)
        except Exception as e:
            return {}

    @classmethod
    def get_translation(cls):
        """获取当前语言的翻译."""
        if not cls._translations:
            # 由于这是同步方法，我们不能直接调用异步方法
            # 这里可以返回空字典，等待异步初始化完成
            return {}
        return cls._translations

    @classmethod
    def get_translation_key(cls, key_path: str) -> str:
        """通过key路径获取翻译值."""
        try:
            if not cls._translations:
                # 同样，这里不能调用异步方法
                return key_path
                
            # 按点分割key路径
            keys = key_path.split('.')
            
            # 逐层获取值
            value = cls._translations
            for key in keys:
                value = value.get(key, None)
                if value is None:
                    return key_path
                    
            return value if isinstance(value, str) else key_path
            
        except Exception as e:
            return key_path

# 导出便捷方法
def get_translation():
    """获取当前语言的翻译."""
    return TranslationManager.get_translation()

def get_translation_key(key_path: str) -> str:
    """通过key路径获取翻译值."""
    return TranslationManager.get_translation_key(key_path)
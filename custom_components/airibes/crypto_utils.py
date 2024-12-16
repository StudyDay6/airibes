"""Utility functions for encryption and decryption."""
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
import base64

from .const import AES_KEY_HEX, AES_IV_HEX

def encrypt_aes_cbc(key: bytes, iv: bytes, plaintext: str) -> str:
    """使用 AES-128 CBC 模式加密明文."""
    # 确保密钥和 IV 长度正确
    if len(key) != 16 or len(iv) != 16:
        raise ValueError("Key and IV must be 16 bytes long")

    # 创建加密器对象
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    # 对明文进行填充
    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded_plaintext = padder.update(plaintext.encode()) + padder.finalize()

    # 加密填充后的明文
    ciphertext = encryptor.update(padded_plaintext) + encryptor.finalize()

    # 使用 Base64 编码密文
    return base64.b64encode(ciphertext).decode('utf-8')

def decrypt_aes_cbc(key: bytes, iv: bytes, ciphertext: str) -> str:
    """使用 AES-128 CBC 模式解密密文."""
    # 确保密钥和 IV 长度正确
    if len(key) != 16 or len(iv) != 16:
        raise ValueError("Key and IV must be 16 bytes long")

    # 创建解密器对象
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()

    # 解码 Base64 编码的密文
    ciphertext_bytes = base64.b64decode(ciphertext)

    # 解密密文
    padded_plaintext = decryptor.update(ciphertext_bytes) + decryptor.finalize()

    # 去除填充
    unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()
    plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()

    return plaintext.decode('utf-8')

def encrypt_data(plaintext: str) -> str:
    """加密数据的便捷方法."""
    KEY = bytes.fromhex(AES_KEY_HEX)
    IV = bytes.fromhex(AES_IV_HEX)
    return encrypt_aes_cbc(KEY, IV, plaintext)

def decrypt_data(ciphertext: str) -> str:
    """解密数据的便捷方法."""
    KEY = bytes.fromhex(AES_KEY_HEX)
    IV = bytes.fromhex(AES_IV_HEX)
    return decrypt_aes_cbc(KEY, IV, ciphertext) 
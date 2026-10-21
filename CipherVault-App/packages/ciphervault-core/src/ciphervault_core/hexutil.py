"""hex ↔ bytes 工具。

全项目统一编码约定（``docs/ALGORITHM.md`` 开头、``docs/CONTRACTS.md`` 第 0 节）：

    所有二进制一律用十六进制**小写**字符串（hex），不用 base64。

本模块是该约定在 Python 侧的集中实现点：

* :func:`to_hex` 保证输出必为小写；
* :func:`from_hex` 保证解析外部输入（可能来自向量文件、钥匙卡 JSON、HTTP 响应）时，
  对「奇数长度」「非法字符」一律抛 :class:`ValueError`，而不是像 ``bytes.fromhex``
  那样给出含义模糊的报错。

安全约定：异常信息**只描述错误类型与长度，绝不回显传入的 hex 内容**——
因为这些 hex 可能是 ``ctHex``、``authHash`` 等敏感值的载体
（``docs/ALGORITHM.md`` 第 8 节第 2 条）。
"""

_HEX_CHARS = frozenset("0123456789abcdefABCDEF")


def to_hex(data: bytes) -> str:
    """把字节串编码为小写 hex 字符串。

    Args:
        data: 待编码的字节串（``bytes`` / ``bytearray`` / ``memoryview`` 均可）。

    Returns:
        小写 hex 字符串；``b""`` 编码为 ``""``。

    Raises:
        TypeError: ``data`` 不是字节类对象。
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError(f"to_hex 需要 bytes 类对象，收到 {type(data).__name__}")
    # bytes.hex() 本身即输出小写，此处显式 lower() 只为把「小写」约定写进代码。
    return bytes(data).hex().lower()


def from_hex(text: str) -> bytes:
    """把 hex 字符串解码为字节串。

    输入允许大写（解码前归一化），但**输出侧的编码一律走** :func:`to_hex`，
    以保证全项目只出现小写 hex。

    Args:
        text: hex 字符串，长度必须为偶数，字符必须落在 ``0-9a-fA-F``。

    Returns:
        解码后的字节串；``""`` 解码为 ``b""``。

    Raises:
        TypeError: ``text`` 不是 ``str``。
        ValueError: 长度为奇数，或含非 hex 字符。
    """
    if not isinstance(text, str):
        raise TypeError(f"from_hex 需要 str，收到 {type(text).__name__}")
    if len(text) % 2 != 0:
        raise ValueError(f"hex 字符串长度必须为偶数，收到长度 {len(text)}")
    if not all(ch in _HEX_CHARS for ch in text):
        # 故意不回显 text 内容：它可能是密文或校验值的载体。
        raise ValueError("hex 字符串含非法字符（只允许 0-9a-fA-F）")
    return bytes.fromhex(text.lower())

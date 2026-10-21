"""趣味皮肤（编码密文，不影响安全性）—— ``docs/ALGORITHM.md`` 第 4 节。

**作用对象**：密文的 hex 字符串（即 ``ctHex``）。逐个半字节替换成「好看的显示串」，
用分隔符 :data:`SEP` 连接。皮肤只是外衣，安全性完全由第 1、2、3 节的真实加密保证；
换皮肤只改 ``display``，不动 ``ctHex``。

内置四种皮肤（``docs/ALGORITHM.md`` 4.4）：

===========  ====================================
皮肤名        rules
===========  ====================================
字母皮肤      ``["letter"]``
古诗皮肤      ``["poem"]``
数字皮肤      ``["number"]``
混合皮肤      ``["letter", "poem", "number"]``
===========  ====================================

三个映射都必须是 ``0..15`` 到显示串的**双射**，否则解码会有歧义。

⚠️ :data:`SEP` 是 U+00B7 中间点 ``·``，**不是** ASCII 句点 ``.``；
:data:`POEMS` 恰好 16 句且互不相同，一个字都不能错。
"""

from collections.abc import Callable, Sequence
from typing import NamedTuple

#: 显示串分隔符：U+00B7 中间点。写成转义形式以避免源码编码问题导致「看起来一样其实不一样」。
SEP = "\u00b7"

#: 16 句古诗，逐字摘自 ``docs/ALGORITHM.md`` 4.1（顺序即下标，不可调换）。
POEMS = (
    "床前明月光",
    "疑是地上霜",
    "举头望明月",
    "低头思故乡",
    "春眠不觉晓",
    "处处闻啼鸟",
    "夜来风雨声",
    "花落知多少",
    "白日依山尽",
    "黄河入海流",
    "欲穷千里目",
    "更上一层楼",
    "锄禾日当午",
    "汗滴禾下土",
    "谁知盘中餐",
    "粒粒皆辛苦",
)


class Codec(NamedTuple):
    """一种皮肤映射的 encode / decode 对。

    ``encode`` 把半字节 ``n``（0..15）变成显示串；
    ``decode`` 把显示串反查回半字节，**无法识别时返回 -1**（由调用方统一抛错，
    与 ``docs/ALGORITHM.md`` 4.3 的伪代码一致）。
    """

    encode: Callable[[int], str]
    decode: Callable[[str], int]


def _letter_encode(n: int) -> str:
    """``letter``：``n`` → ``chr(65 + n)``，即 ``A``…``P``。"""
    _check_nibble(n)
    return chr(65 + n)


def _letter_decode(seg: str) -> int:
    """``letter`` 反查：取**首字符**减 65；空串或越界由调用方判定为「无法还原」。"""
    if not seg:
        return -1
    return ord(seg[0]) - 65


def _number_encode(n: int) -> str:
    """``number``：``n`` → ``str(n + 10)``，即两位字符串 ``"10"``…``"25"``。"""
    _check_nibble(n)
    return str(n + 10)


def _number_decode(seg: str) -> int:
    """``number`` 反查：先 ``int()`` 再减 10；非数字返回 -1。"""
    try:
        return int(seg) - 10
    except (TypeError, ValueError):
        return -1


def _poem_encode(n: int) -> str:
    """``poem``：``n`` → ``POEMS[n]``。"""
    _check_nibble(n)
    return POEMS[n]


def _poem_decode(seg: str) -> int:
    """``poem`` 反查：查表取下标；查不到返回 -1。

    ``SEP`` 不会出现在任何诗句里，因此调用方按 ``SEP`` split 是安全的。
    """
    return _POEM_INDEX.get(seg, -1)


def _check_nibble(n: int) -> None:
    """编码侧的入参校验：半字节必须落在 0..15。"""
    if not 0 <= n <= 15:
        raise ValueError(f"hex 半字节必须落在 0..15，收到 {n}")


#: 诗句 → 下标的反查表（模块加载时构建一次）。
_POEM_INDEX = {poem: idx for idx, poem in enumerate(POEMS)}

#: 映射表：皮肤规则名 → :class:`Codec`。三个映射都是 ``0..15`` 到显示串的双射。
XF: dict[str, Codec] = {
    "letter": Codec(_letter_encode, _letter_decode),
    "number": Codec(_number_encode, _number_decode),
    "poem": Codec(_poem_encode, _poem_decode),
}


def _resolve_rules(rules: Sequence[str]) -> list[Codec]:
    """把规则名列表解析成 :class:`Codec` 列表，并做空值/未知名校验。

    Raises:
        ValueError: ``rules`` 为空，或含未知规则名。
    """
    if not rules:
        raise ValueError("rules 不能为空")
    resolved = []
    for name in rules:
        codec = XF.get(name)
        if codec is None:
            raise ValueError(f"未知皮肤规则：{name!r}（可选：{sorted(XF)}）")
        resolved.append(codec)
    return resolved


def encode_token(ct_hex: str, rules: Sequence[str]) -> str:
    """把密文 hex 编码成趣味显示串。

    伪代码（``docs/ALGORITHM.md`` 4.3，逐字对应）::

        for i in 0 .. len(ctHex)-1:
            n = int(ctHex[i], 16)
            out.push( 映射[ rules[i % len(rules)] ].encode(n) )
        return join(out, SEP)

    Args:
        ct_hex: 密文的小写 hex 字符串（大写输入会被归一化为小写后解析）。
        rules: 皮肤规则名序列，第 ``i`` 个半字节使用 ``rules[i % len(rules)]``。

    Returns:
        以 :data:`SEP` 连接的显示串；``ct_hex`` 为空串时返回 ``""``。

    Raises:
        ValueError: ``rules`` 为空 / 含未知规则名，或 ``ct_hex`` 含非 hex 字符。
    """
    codecs = _resolve_rules(rules)
    digits = ct_hex.strip().lower()
    for ch in digits:
        if ch not in "0123456789abcdef":
            # 不回显内容：ct_hex 是密文载体。
            raise ValueError("ctHex 含非法字符（只允许 0-9a-fA-F）")
    parts = []
    for i, ch in enumerate(digits):
        n = int(ch, 16)
        parts.append(codecs[i % len(codecs)].encode(n))
    return SEP.join(parts)


def decode_token(display: str, rules: Sequence[str]) -> str:
    """把趣味显示串还原成密文 hex。

    伪代码（``docs/ALGORITHM.md`` 4.3，逐字对应）::

        segs = split(display, SEP)
        for i in 0 .. len(segs)-1:
            v = 映射[ rules[i % len(rules)] ].decode(segs[i])
            if v < 0 或 > 15: 抛出「第 (i+1) 段无法还原」

    Args:
        display: 以 :data:`SEP` 连接的显示串。
        rules: 与编码时**相同**的皮肤规则名序列。

    Returns:
        小写 hex 字符串，长度等于分段数。

    Raises:
        ValueError: ``rules`` 为空 / 含未知规则名，或某一段无法还原
            （错误信息形如「第 3 段无法还原」，段号从 1 开始）。

    Note:
        ``display == ""`` 直接返回 ``""``：这是 ``encode_token("", rules)`` 的逆运算，
        对应「空明文 ⇒ ct 为空串」的合法场景（``docs/ALGORITHM.md`` 3.1）。
        若不特判，``"".split(SEP)`` 会得到 ``[""]`` 从而误报「第 1 段无法还原」。
    """
    codecs = _resolve_rules(rules)
    if display == "":
        return ""
    segs = display.split(SEP)
    out = []
    for i, seg in enumerate(segs):
        v = codecs[i % len(codecs)].decode(seg)
        if v < 0 or v > 15:
            raise ValueError(f"第 {i + 1} 段无法还原")
        out.append(f"{v:x}")
    return "".join(out)

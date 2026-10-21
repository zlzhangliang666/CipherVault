export function Help() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--sp-xl)' }}>
      <h1 style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, margin: '0 0 var(--sp-lg)' }}>使用说明</h1>

      <section style={sectionStyle}>
        <h2 style={h2Style}>什么是主密码？</h2>
        <p style={pStyle}>
          主密码是你进入密码保险箱的唯一钥匙。它用来加密你所存储的全部密码条目，永不发送到任何服务器。
          如果你忘记了主密码，数据将无法恢复——没有"找回密码"的功能。
          这正是为了确保只有你自己能访问你的数据。
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>如何添加密码？</h2>
        <p style={pStyle}>
          点击顶部工具栏的"+ 新建条目"按钮，填写名称、账号、密码等信息。密码可以手填或点击"生成"按钮自动生成。
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>什么是趣味皮肤？</h2>
        <p style={pStyle}>
          趣味皮肤是密文的一种可视化展示方式。它把加密后的十六进制字符串转换成更有趣的显示形式（字母、古诗、数字或混合模式）。
          皮肤只是"外衣"，不影响真正的安全性——安全性完全由 AES-GCM-256 和 PBKDF2 保证。
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>什么是钥匙卡？</h2>
        <p style={pStyle}>
          钥匙卡是一个可离线运行的 HTML 或 Python 文件，包含用你的主密码加密后的条目密码。
          你可以把钥匙卡分享给信任的人或保存为离线备份。需要用主密码才能解密其中的内容。
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>数据如何存储？</h2>
        <p style={pStyle}>
          你的密码数据在浏览器端用主密码加密后，以密文形式上传到服务器。服务器永远看不到明文。
          即使服务器被攻破，攻击者也无法解密你的数据（除非知道你的主密码）。
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>安全建议</h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--dim)', lineHeight: 1.8 }}>
          <li>选择一个足够长且不易被猜到的主密码</li>
          <li>定期导出备份并安全保管</li>
          <li>在不使用时锁定保险箱</li>
          <li>不要与他人共享主密码</li>
          <li>为每个账号使用不同的随机生成密码</li>
        </ul>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--sp-lg)',
};

const h2Style: React.CSSProperties = {
  fontSize: 'var(--fs-lg)',
  fontWeight: 600,
  margin: '0 0 var(--sp-sm)',
};

const pStyle: React.CSSProperties = {
  color: 'var(--dim)',
  lineHeight: 1.8,
  margin: 0,
};
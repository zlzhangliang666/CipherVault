import type { KeycardPayload } from '../crypto/stream';

export function buildKeycardHtml(
  payload: KeycardPayload,
  name: string,
  displayStr: string,
): string {
  const p = JSON.stringify(payload);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CipherVault Keycard · ${escapeHtml(name)}</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#f4f6f9;color:#141a24;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px}
.card{background:#fff;border-radius:14px;padding:32px;max-width:420px;width:100%;box-shadow:0 16px 40px -24px rgba(16,24,40,.32)}
h1{font-size:20px;margin:0 0 8px}
.sub{color:#57616f;font-size:13px;margin:0 0 20px}
input{width:100%;padding:10px 12px;border:1px solid #d3dbe6;border-radius:10px;font-size:14px;margin:8px 0}
button{width:100%;padding:10px;background:#2563eb;color:#fff;border:0;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-top:12px}
button:hover{background:#1d4ed8}
.result{margin-top:16px;padding:12px;background:#f2f5f9;border-radius:10px;word-break:break-all;font-family:monospace;font-size:13px}
.error{color:#e5484d;margin-top:8px;font-size:13px}
.display{color:#57616f;font-size:13px;margin-top:8px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
<h1>🔐 CipherVault 钥匙卡</h1>
<p class="sub">条目：${escapeHtml(name)} | 趣味显示：${escapeHtml(displayStr)}</p>
<noscript><p class="error">请启用 JavaScript</p></noscript>
<div id="no-crypto" class="error" style="display:none">此浏览器不支持 WebCrypto (window.crypto.subtle)，请使用现代浏览器（Chrome/Edge/Firefox/Safari）打开此文件。</div>
<input id="pw" type="password" placeholder="输入主密码" autocomplete="off">
<button id="btn">解密</button>
<div id="result" class="result" style="display:none"></div>
<div id="err" class="error"></div>
</div>
<script>
(function() {
  if (!window.crypto || !window.crypto.subtle) {
    document.getElementById('no-crypto').style.display = 'block';
    document.getElementById('btn').disabled = true;
    return;
  }
  var PAYLOAD = ${p};
  var SEP = '\\u00b7';

  function hex2b(h) {
    var b = new Uint8Array(h.length/2);
    for (var i=0;i<b.length;i++) b[i]=parseInt(h.substr(i*2,2),16);
    return b;
  }
  function b2hex(b) { return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0')}).join(''); }
  function b2t(b) { return new TextDecoder().decode(b); }
  function t2b(s) { return new TextEncoder().encode(s); }
  function concat() {
    var args=arguments,total=0,out,off=0;
    for (var i=0;i<args.length;i++) total+=args[i].length;
    out=new Uint8Array(total);
    for (var i=0;i<args.length;i++) { out.set(args[i],off); off+=args[i].length; }
    return out;
  }
  function u32be(n) { var b=new Uint8Array(4); b[0]=n>>>24; b[1]=(n>>>16)&255; b[2]=(n>>>8)&255; b[3]=n&255; return b; }

  async function hmac(k, m) {
    var key = await crypto.subtle.importKey('raw', k, {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, m));
  }

  async function deriveDk(pw, saltHex, iters) {
    var base = await crypto.subtle.importKey('raw', t2b(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2', salt:hex2b(saltHex), iterations:iters, hash:'SHA-256'}, base, 512));
  }

  function ctEqual(a,b) { if(a.length!==b.length)return false; var d=0; for(var i=0;i<a.length;i++) d|=a[i]^b[i]; return d===0; }

  var poems = ${JSON.stringify([
    '床前明月光','疑是地上霜','举头望明月','低头思故乡',
    '春眠不觉晓','处处闻啼鸟','夜来风雨声','花落知多少',
    '白日依山尽','黄河入海流','欲穷千里目','更上一层楼',
    '锄禾日当午','汗滴禾下土','谁知盘中餐','粒粒皆辛苦'
  ])};

  function decodeDisplay(display, rules) {
    var segs=display.split(SEP), hex='';
    for (var i=0;i<segs.length;i++) {
      var r=rules[i%rules.length], v=-1;
      if (r==='letter') v=segs[i].charCodeAt(0)-65;
      else if (r==='number') v=parseInt(segs[i],10)-10;
      else v=poems.indexOf(segs[i]);
      if (v<0||v>15) throw new Error('\\\\u7b2c'+(i+1)+'\\\\u6bb5\\\\u65e0\\\\u6cd5\\\\u8fd8\\\\u539f');
      hex+=v.toString(16);
    }
    return hex;
  }

  document.getElementById('btn').onclick = async function() {
    var errEl = document.getElementById('err');
    var resEl = document.getElementById('result');
    errEl.textContent = '';
    resEl.style.display = 'none';
    var pw = document.getElementById('pw').value;
    if (!pw) { errEl.textContent = '请输入主密码'; return; }
    try {
      var dk = await deriveDk(pw, PAYLOAD.saltHex, PAYLOAD.iters);
      var mac = dk.slice(32,64);
      var enc = dk.slice(0,32);
      var iv = hex2b(PAYLOAD.ivHex);
      var ct = hex2b(PAYLOAD.ctHex);
      var exp = await hmac(mac, concat(iv, ct));
      if (!ctEqual(exp, hex2b(PAYLOAD.tagHex))) { throw new Error('主密码不正确'); }
      var ksBlocks=[], ctr=0;
      while (ksBlocks.reduce(function(s,b){return s+b.length},0) < ct.length) {
        ksBlocks.push(await hmac(enc, concat(iv, u32be(ctr))));
        ctr++;
      }
      var ks=concat.apply(null, ksBlocks);
      var pt=new Uint8Array(ct.length);
      for (var i=0;i<ct.length;i++) pt[i]=ct[i]^ks[i];
      var entryPw = b2t(pt);
      resEl.innerHTML = '<strong>原始密码：</strong>' + entryPw.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '<br><strong>趣味显示：</strong>' + PAYLOAD.display.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      resEl.style.display = 'block';
    } catch(e) {
      errEl.textContent = e.message || '解密失败';
    }
  };
})();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
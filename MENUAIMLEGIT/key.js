(function () {
  "use strict";

  const CONFIG = {
    appName: "Menu AimLock",
    storageKey: "vsh_license_key",
    storageDevice: "vsh_license_device",
    checkUrl: "https://nvvkey.dinhtienhoang1812010.workers.dev/api/check-key",   
    activateUrl: "https://nvvkey.dinhtienhoang1812010.workers.dev/api/activate", 
    contactUrl: "https://zalo.me/0385828047",
    timezone: "Asia/Ho_Chi_Minh",
    autoCheckOnLoad: false, 
    relockWhenInvalid: true,
  };

  const state = {
    key: "",
    deviceId: "",
    verified: false,
    expiresAt: "",
    mounted: false,
  };

  function qs(sel) { return document.querySelector(sel); }

  function ce(tag, props = {}, html = "") {
    const el = document.createElement(tag);
    Object.assign(el, props);
    if (html) el.innerHTML = html;
    return el;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function formatDateVN(value) {
    if (!value) return "Không giới hạn";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: CONFIG.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(d);
  }

  function toast(message, type = "ok", raw = null) {
    const box = qs("#vgMsg"); const rawWrap = qs("#vgDtl"); const rawBox = qs("#vgRaw");
    if (!box) return;
    box.className = `vg-msg ${type}`; box.innerHTML = message;
    if (rawWrap && rawBox) { if (raw == null) { rawWrap.hidden = true; rawBox.textContent = ""; } else { rawWrap.hidden = false; rawBox.textContent = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2); } }
  }

  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime); gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  function getOrCreateDeviceId() {
    let id = localStorage.getItem(CONFIG.storageDevice);
    if (id) return id;
    if (window.crypto?.randomUUID) { id = crypto.randomUUID().toUpperCase(); } else { id = "DEV-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 10).toUpperCase(); }
    localStorage.setItem(CONFIG.storageDevice, id);
    return id;
  }

  function saveKey(key) { localStorage.setItem(CONFIG.storageKey, key); state.key = key; }
  function clearKey() { localStorage.removeItem(CONFIG.storageKey); state.key = ""; }
  function loadSavedKey() { state.key = localStorage.getItem(CONFIG.storageKey) || ""; return state.key; }

  function updateFooter(exp = "") {
    const sta = qs("#vgSta");
    if (!sta) return;
    sta.textContent = exp ? `Hết hạn: ${formatDateVN(exp)}` : "Chưa kích hoạt";
  }

  function dispatchLicenseChange(detail) { window.dispatchEvent(new CustomEvent("vsh-license-change", { detail })); }
  
  function controlDoors(isOpen) {
      const gate = qs("#vgGate");
      if (!gate) return;
      let doorWrap = qs(".cyber-door-wrap");
      
      if (!doorWrap) {
         doorWrap = ce("div", {className: "cyber-door-wrap is-closed"}, `
           <div class="c-door-left">
             <i class="fas fa-shield-halved door-icon-left"></i>
           </div>
           <div class="c-door-right">
             <i class="fas fa-lock door-icon-right"></i>
           </div>
         `);
         gate.appendChild(doorWrap);
      }
      
      if (isOpen) {
          doorWrap.classList.remove("is-closed");
      } else {
          doorWrap.classList.add("is-closed");
      }
  }

  function lockUI() {
    document.body.classList.add("vg-locked");
    const gate = qs("#vgGate");
    const panel = qs("#main-panel"); 
    const intro = qs("#home-intro");
    
    if (intro) intro.style.display = "none";
    if (panel) panel.style.display = "none";

    if (gate) {
      gate.style.display = "grid";
      gate.style.opacity = "1";
      
      const loginPanel = qs('#vgGate .vg-panel');
      if (loginPanel) { 
          loginPanel.style.display = 'block'; 
          loginPanel.style.opacity = '1'; 
      }
      
      controlDoors(false);
    }
  }

  function unlockUI(isAutoBoot) {
    const gate = qs("#vgGate");
    const panel = qs("#main-panel");
    const loginPanel = qs('#vgGate .vg-panel');

    if (gate && panel) {
      if (isAutoBoot) {
          gate.style.display = 'none';
          panel.style.display = "block";
          document.body.classList.remove("vg-locked");
      } else {
          if (loginPanel) {
              loginPanel.style.transition = 'opacity 0.4s ease';
              loginPanel.style.opacity = '0';
          }
          
          setTimeout(() => {
              if (loginPanel) loginPanel.style.display = 'none';
              
              panel.style.display = "block";
              document.body.classList.remove("vg-locked");
              
              controlDoors(true);
              
              setTimeout(() => {
                  gate.style.display = "none";
                  if (loginPanel) {
                      loginPanel.style.display = 'block';
                      loginPanel.style.opacity = '1';
                  }
              }, 1200); 
          }, 400); 
      }
    }
  }

  function normalizeResponse(data) {
    const status = String(data?.status || data?.code || data?.state || "").toUpperCase();
    const valid = data?.valid === true || data?.ok === true || data?.success === true || status === "OK" || status === "VALID" || status === "SUCCESS" || status === "ACTIVATED";
    return { ok: valid, status, expiresAt: data?.expiresAt || data?.expire || data?.expired_at || data?.expiry || "", raw: data };
  }

  async function apiGet(url, params) {
    const u = new URL(url, window.location.origin);
    Object.entries(params).forEach(([k, v]) => { if (v != null) u.searchParams.set(k, v); });
    const res = await fetch(u.toString(), { method: "GET", headers: { Accept: "application/json, text/plain, */*" } });
    const rawText = await res.text(); let data = {};
    try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { status: "INVALID_JSON", body: rawText, contentType: res.headers.get("content-type"), httpStatus: res.status }; }
    if (!res.ok) { return { ok: false, status: String(data?.status || `HTTP_${res.status}`).toUpperCase(), raw: { httpStatus: res.status, contentType: res.headers.get("content-type"), body: rawText, data } }; }
    return normalizeResponse(data);
  }

  async function checkLicense(key, deviceId) { return apiGet(CONFIG.checkUrl, { key, hwid: deviceId, deviceId }); }

  async function activateLicense(key, deviceId) {
    const res = await fetch(CONFIG.activateUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/plain, */*" }, body: JSON.stringify({ key, hwid: deviceId, deviceId }) });
    const rawText = await res.text(); let data = {};
    try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { status: "INVALID_JSON", body: rawText, httpStatus: res.status }; }
    if (!res.ok) { return { ok: false, status: String(data?.status || `HTTP_${res.status}`).toUpperCase(), raw: data }; }
    return normalizeResponse(data);
  }

  function renderGate() {
    if (state.mounted) return;
    state.mounted = true;

    const style = ce("style");
    style.textContent = `
      #vgGate{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(8,10,15,.72);backdrop-filter:blur(6px)}
      
      .cyber-door-wrap { position:absolute; inset:0; z-index:99; display:flex; pointer-events:none; overflow: hidden; }
      .c-door-left, .c-door-right { width:50%; height:100%; background:#050a10; transition:transform 1.2s cubic-bezier(0.77, 0, 0.175, 1); position:relative; }
      .c-door-left { border-right:3px solid #00f7ff; box-shadow:15px 0 40px rgba(0, 247, 255, 0.5); transform:translateX(-100%); }
      .c-door-right { border-left:3px solid #00f7ff; box-shadow:-15px 0 40px rgba(0, 247, 255, 0.5); transform:translateX(100%); }
      
      /* CĂN CHỈNH LẠI ICON */
      .door-icon-left, .door-icon-right { 
        position: absolute; 
        top: 50%; 
        transform: translateY(-50%); 
        font-size: 70px; 
        color: rgba(0, 247, 255, 0.5); 
        filter: drop-shadow(0 0 10px rgba(0, 247, 255, 0.8));
        z-index: 10;
      }
      .door-icon-left { right: 40px; }
      .door-icon-right { left: 40px; }
      
      .cyber-door-wrap.is-closed .c-door-left { transform:translateX(0); pointer-events:all; }
      .cyber-door-wrap.is-closed .c-door-right { transform:translateX(0); pointer-events:all; }

      #vgGate .vg-panel{width:min(620px,92vw);border:1px solid #2a2d3f;border-radius:16px;overflow:hidden;color:#e8e7ff;font-family:Inter,system-ui,Arial;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));box-shadow:0 24px 60px rgba(0,0,0,.55);position:relative;z-index:100;}
      #vgGate .vg-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #2a2d3f}
      #vgGate .vg-brand{font-weight:900;letter-spacing:.3px;white-space:nowrap}
      #vgGate .vg-hd-rt{display:flex;gap:8px}
      #vgGate .vg-btn{padding:9px 14px;border-radius:10px;border:1px solid #3a3f56;background:#191f2a;color:#e8e7ff;cursor:pointer}
      #vgGate .vg-btn:hover{filter:brightness(1.08)}
      #vgGate .vg-btn--pri{position:relative;overflow:hidden;background:linear-gradient(145deg,#0ea5e9,#2563eb);border:none;color:#fff;font-weight:800;box-shadow:0 0 26px rgba(37,99,235,.65)}
      #vgGate .vg-btn--pri::after{content:"";position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(to right,transparent,rgba(255,255,255,0.6),transparent);transform:rotate(45deg);animation:diamondSweep 2.5s infinite linear;}
      @keyframes diamondSweep { 0% { transform: translateX(-100%) rotate(45deg); } 100% { transform: translateX(100%) rotate(45deg); } }
      #vgGate .vg-btn--pri:hover{filter:brightness(1.12)}
      #vgGate .vg-btn--pri:active{transform:scale(0.96)}
      #vgGate .vg-btn--ghost{background:#141924}
      #vgGate .vg-bd{padding:16px}
      #vgGate .vg-label{font-size:12px;color:#aab4d6;margin:0 0 6px 0}
      #vgGate .vg-field{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center}
      #vgGate .vg-input{padding:11px 12px;border-radius:10px;border:1px solid #3a3f56;background:#0c1017;color:#e8e7ff;width:100%}
      #vgGate .vg-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
      #vgGate .vg-msg{margin-top:12px;padding:12px;border-radius:12px;border:1px solid #2a2d3f;background:#0b1118;font-size:13px;line-height:1.45}
      #vgGate .vg-msg.ok{border-color:#2f9e44;background:#0d1a12;color:#b9ffd1}
      #vgGate .vg-msg.warn{border-color:#b8860b;background:#1b1607;color:#ffe9b0}
      #vgGate .vg-msg.err{border-color:#b02a37;background:#1a0f12;color:#ffd1d6}
      #vgGate .vg-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:#9fb0d0;font-size:12px}
      #vgGate details{margin-top:10px;border:1px dashed #2a2d3f;border-radius:12px;overflow:hidden}
      #vgGate summary{padding:10px 12px;cursor:pointer;list-style:none;background:#0b0f15}
      #vgGate summary::-webkit-details-marker{display:none}
      #vgGate .vg-pre{margin:0;padding:12px 12px 14px;background:#0b0f15;color:#bcd;max-height:220px;overflow:auto;font-family:monospace;font-size:12px}
      #vgGate .vg-icon{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:10px;border:1px solid #3a3f56;background:#151a24;cursor:pointer}
      body.vg-locked{overflow:hidden}
      @media (max-width:520px){ 
        #vgGate .vg-field{grid-template-columns:1fr} 
        #vgGate .vg-hd{flex-wrap:wrap} 
        .door-icon-left, .door-icon-right { font-size: 50px; } 
        .door-icon-left { right: 20px; } 
        .door-icon-right { left: 20px; }
      }
    `;
    document.head.appendChild(style);

    const wrap = ce("div", { id: "vgGate" }, `
      <div class="vg-panel">
        <div class="vg-hd">
          <div class="vg-brand">${escapeHtml(CONFIG.appName).toUpperCase()} API CHECK KEY</div>
          <div class="vg-hd-rt"><button class="vg-btn vg-btn--ghost" id="vgReset">Nhập lại</button></div>
        </div>
        <div class="vg-bd">
          <div><div class="vg-label">Mã Kích Hoạt</div><div class="vg-field"><input id="vgKey" class="vg-input" type="text" placeholder="${escapeHtml(CONFIG.appName.toUpperCase())}-XXXX-XXXX" autocomplete="one-time-code" inputmode="latin"><button class="vg-icon" id="vgPasteKey">Dán</button><button class="vg-icon" id="vgDelKey">Delete</button></div></div>
          <div style="margin-top:12px"><div class="vg-label">Mã Thiết Bị</div><div class="vg-field"><input id="vgDev" class="vg-input" type="text" readonly><button class="vg-icon" id="vgCopyDev">Sao chép</button></div></div>
          <div class="vg-actions">
            <button class="vg-btn vg-btn--pri" id="vgCheck" style="flex:1">Kiểm tra</button>
            <button class="vg-btn vg-btn--pri" id="vgActive" style="flex:1">Kích Hoạt ${escapeHtml(CONFIG.appName)}</button>
          </div>
          <div class="vg-msg" id="vgMsg">Sẵn sàng kiểm tra key.</div>
          <details id="vgDtl" hidden><summary>Chi tiết kỹ thuật</summary><pre class="vg-pre" id="vgRaw"></pre></details>
          <div class="vg-foot"><span id="vgSta">Chưa kích hoạt</span><button class="vg-btn vg-btn--ghost" id="vgContact">Get Key</button></div>
        </div>
      </div>
    `);
    document.body.appendChild(wrap);

    qs("#vgKey").value = loadSavedKey();
    qs("#vgDev").value = state.deviceId;
    updateFooter("");

    qs("#vgPasteKey").onclick = async () => { try { const text = await navigator.clipboard.readText(); qs("#vgKey").value = (text || "").trim(); toast("Đã dán vào ô Mã Kích Hoạt.", "ok"); } catch { qs("#vgKey").value = (prompt("Dán mã kích hoạt tại đây:", "") || "").trim(); } qs("#vgKey").focus(); };
    qs("#vgDelKey").onclick = () => { qs("#vgKey").value = ""; clearKey(); state.verified = false; updateFooter(""); toast("Đã xoá mã khỏi thiết bị này.", "ok"); if (CONFIG.relockWhenInvalid) lockUI(); };
    qs("#vgCopyDev").onclick = async () => { try { await navigator.clipboard.writeText(state.deviceId); toast("Đã sao chép Mã Thiết Bị.", "ok"); } catch { toast("Không copy được tự động. Hãy copy thủ công.", "warn"); } };
    qs("#vgReset").onclick = () => { qs("#vgKey").value = ""; clearKey(); state.verified = false; updateFooter(""); lockUI(); toast("Đã reset trạng thái kích hoạt.", "ok"); };
    qs("#vgContact").onclick = () => { window.open(CONFIG.contactUrl, "_blank"); };
    qs("#vgCheck").onclick = onCheck;
    qs("#vgActive").onclick = onActivate;
  }

  async function safeCall(fn) {
    try { return await fn(); } catch (err) { console.error(err); toast("Lỗi Kết Nối Sever⚠️", "err", String(err)); return null; }
  }

  async function onCheck() {
    const key = qs("#vgKey").value.trim();
    if (!key) return toast("Vui lòng nhập Mã Kích Hoạt.", "warn");
    toast("Đang kiểm tra...", "warn");
    const result = await safeCall(() => checkLicense(key, state.deviceId));

    if (result && result.ok) {
        state.verified = false; 
        updateFooter(result.expiresAt);
        toast(`Key Hợp Lệ<br>Hết hạn: <b>${escapeHtml(formatDateVN(result.expiresAt))}</b><br>Bấm 'Kích Hoạt' để đăng nhập.`, "ok", result.raw);
    } else if (result) {
        handleLicenseResult(result, key, "check");
    }
  }

  async function onActivate() {
    const key = qs("#vgKey").value.trim();
    if (!key) return toast("Vui lòng nhập Mã Kích Hoạt.", "warn");
    toast("Đang kích hoạt...", "warn");
    const result = await safeCall(() => activateLicense(key, state.deviceId));
    
    if (result) handleLicenseResult(result, key, "activate");
  }

  function handleLicenseResult(result, key, mode) {
    const status = result.status || "";
    const expiresAt = result.expiresAt || "";

    if (result.ok) {
      saveKey(key);
      state.verified = true;
      state.expiresAt = expiresAt;
      updateFooter(expiresAt);
      
      if (mode === "activate") {
          unlockUI(false); 
          playBeep();
          toast(`✅ Đăng nhập thành công<br>Hết hạn: <b>${escapeHtml(formatDateVN(expiresAt))}</b>`, "ok", result.raw);
      } else if (mode === "boot" || mode === "check") {
          unlockUI(true);
      }

      dispatchLicenseChange({ state: mode, verified: true, key, deviceId: state.deviceId, expiresAt, raw: result.raw });
      return;
    }

    state.verified = false;
    updateFooter("");

    const messageMap = { EXPIRED: "Mã đã hết hạn⛔", REVOKED: "Mã đã bị thu hồi🚫", NOT_FOUND: "Không tìm thấy mã⚠️", INVALID_KEY: "Key không tồn tại❌", HWID_MISMATCH: "Key đã đăng nhập trên thiết bị khác📱", BOUND_TO_ANOTHER_DEVICE: "Mã đã gắn với thiết bị khác.", INVALID_JSON: "Server trả dữ liệu không hợp lệ." };
    toast(messageMap[status] || `❌ Lỗi: ${escapeHtml(status || "UNKNOWN")}`, "err", result.raw);
    
    if (CONFIG.relockWhenInvalid) lockUI();
    dispatchLicenseChange({ state: "invalid", verified: false, key, deviceId: state.deviceId, expiresAt: "", raw: result.raw });
  }

  async function autoBootCheck() {
    const savedKey = loadSavedKey();
    if (!savedKey || !CONFIG.autoCheckOnLoad) { lockUI(); return; }
    const result = await safeCall(() => checkLicense(savedKey, state.deviceId));
    if (!result) { lockUI(); return; }
    
    handleLicenseResult(result, savedKey, "boot");
  }

  function init() {
    state.deviceId = getOrCreateDeviceId();
    renderGate();
    autoBootCheck();

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (!state.verified) return; 
      
      const savedKey = loadSavedKey();
      if (!savedKey) return;
      const result = await safeCall(() => checkLicense(savedKey, state.deviceId));
      if (result) handleLicenseResult(result, savedKey, "check");
    });

    window.VSHKeyGate = {
      show: lockUI, hide: unlockUI,
      reset() { clearKey(); state.verified = false; updateFooter(""); lockUI(); },
      getState() { return { ...state }; },
      async check() { return onCheck(); },
      async activate() { return onActivate(); },
    };
  }

  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", init, { once: true }); } 
  else { init(); }
})();
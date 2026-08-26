import { Router, Request, Response } from 'express';
import { readClinicProfile, writeProfile } from '../config/reader';
import { ensureSchema } from '../db/init';

const router = Router();

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MACHOKO HMS — Setup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f4f8; color: #1e293b; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .container { background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 640px; width: 100%; padding: 40px; }
  h1 { font-size: 24px; font-weight: 700; color: #1e3a5f; margin-bottom: 4px; }
  .subtitle { font-size: 14px; color: #64748b; margin-bottom: 28px; }
  .form-group { margin-bottom: 18px; }
  label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 5px; }
  input, select { width: 100%; padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
  input:focus, select:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
  .checkbox-group { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
  .checkbox-group label { display: flex; align-items: center; gap: 6px; font-weight: 400; font-size: 13px; cursor: pointer; }
  .checkbox-group input[type="checkbox"] { width: auto; accent-color: #2563eb; }
  .row { display: flex; gap: 12px; }
  .row .form-group { flex: 1; }
  .btn { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-top: 8px; }
  .btn:hover { background: #1d4ed8; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .passphrase-section { background: #fef9c3; border: 1px solid #facc15; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .passphrase-section label { color: #854d0e; }
  .msg { display: none; padding: 12px; border-radius: 8px; margin-top: 16px; font-size: 14px; font-weight: 500; text-align: center; }
  .msg.success { display: block; background: #dcfce7; color: #166534; }
  .msg.error { display: block; background: #fee2e2; color: #991b1b; }
  h2 { font-size: 16px; font-weight: 600; color: #1e3a5f; margin: 24px 0 12px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="container">
  <h1>MACHOKO HMS</h1>
  <p class="subtitle">Hospital Management System — Initial Setup</p>

  <div id="passphraseSection" class="passphrase-section">
    <label for="passphrase">Master Passphrase</label>
    <input type="password" id="passphrase" placeholder="Enter master passphrase" style="margin-top:6px;" />
    <button class="btn" id="unlockBtn" style="margin-top:10px;">Unlock Setup</button>
    <div id="passphraseMsg" class="msg"></div>
  </div>

  <form id="setupForm" style="display:none;">
    <div class="row">
      <div class="form-group">
        <label for="hospital_name">Hospital Name</label>
        <input type="text" id="hospital_name" required />
      </div>
      <div class="form-group">
        <label for="phone_number">Phone Number</label>
        <input type="text" id="phone_number" />
      </div>
    </div>

    <div class="form-group">
      <label for="address">Address</label>
      <input type="text" id="address" />
    </div>

    <div class="row">
      <div class="form-group">
        <label for="currency_symbol">Currency Symbol</label>
        <input type="text" id="currency_symbol" value="&#8358;" />
      </div>
      <div class="form-group">
        <label for="deployment_mode">Deployment Mode</label>
        <select id="deployment_mode">
          <option value="OFFLINE_STANDALONE">Offline Standalone</option>
          <option value="CLOUD_SAAS">Cloud SaaS</option>
          <option value="PRIVATE_SUPABASE">Private Supabase</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label for="primary_brand_color">Primary Brand Color</label>
      <input type="color" id="primary_brand_color" value="#2563eb" />
    </div>

    <h2>Modules</h2>
    <div class="checkbox-group">
      <label><input type="checkbox" id="module_records" checked /> Records</label>
      <label><input type="checkbox" id="module_triage" checked /> Triage</label>
      <label><input type="checkbox" id="module_consultation" checked /> Consultation</label>
      <label><input type="checkbox" id="module_laboratory" /> Laboratory</label>
      <label><input type="checkbox" id="module_pharmacy" /> Pharmacy</label>
      <label><input type="checkbox" id="module_radiology" /> Radiology</label>
      <label><input type="checkbox" id="module_finance_hmo" /> Finance / HMO</label>
    </div>

    <h2>Logo</h2>
    <div class="form-group">
      <input type="file" id="logo" accept="image/png" />
    </div>

    <button type="submit" class="btn">Save Configuration</button>
    <div id="formMsg" class="msg"></div>
  </form>
</div>

<script>
async function verifyPassphrase() {
  const passphrase = document.getElementById('passphrase').value;
  const msg = document.getElementById('passphraseMsg');
  try {
    const res = await fetch('/api/setup/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase })
    });
    const data = await res.json();
    if (data.valid) {
      document.getElementById('passphraseSection').style.display = 'none';
      document.getElementById('setupForm').style.display = 'block';
    } else {
      msg.className = 'msg error';
      msg.textContent = 'Invalid passphrase';
    }
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = 'Network error';
  }
}

document.getElementById('unlockBtn').addEventListener('click', verifyPassphrase);
document.getElementById('passphrase').addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyPassphrase(); });

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('formMsg');
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const config = {
    hospital_name: document.getElementById('hospital_name').value,
    address: document.getElementById('address').value,
    phone_number: document.getElementById('phone_number').value,
    currency_symbol: document.getElementById('currency_symbol').value,
    primary_brand_color: document.getElementById('primary_brand_color').value,
    deployment_mode: document.getElementById('deployment_mode').value,
    module_records: document.getElementById('module_records').checked,
    module_triage: document.getElementById('module_triage').checked,
    module_consultation: document.getElementById('module_consultation').checked,
    module_laboratory: document.getElementById('module_laboratory').checked,
    module_pharmacy: document.getElementById('module_pharmacy').checked,
    module_radiology: document.getElementById('module_radiology').checked,
    module_finance_hmo: document.getElementById('module_finance_hmo').checked,
  };

  try {
    const res = await fetch('/api/setup/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();
    if (data.success) {
      msg.className = 'msg success';
      msg.textContent = 'Configuration saved successfully! Redirecting...';
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } else {
      msg.className = 'msg error';
      msg.textContent = data.message || 'Save failed';
    }
  } catch (e) {
    msg.className = 'msg error';
    msg.textContent = 'Network error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Configuration';
  }

  const logoInput = document.getElementById('logo');
  if (logoInput.files.length > 0) {
    const formData = new FormData();
    formData.append('logo', logoInput.files[0]);
    await fetch('/api/setup/upload-logo', { method: 'POST', body: formData });
  }
});
</script>
</body>
</html>`;

router.get('/setup', (req: Request, res: Response) => {
  res.send(SETUP_HTML);
});

export default router;

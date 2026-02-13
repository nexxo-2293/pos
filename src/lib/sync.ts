import axios from 'axios';

// ----------------------------------
// HELPERS
// ----------------------------------

async function getLicenseConfig() {
  const config = await window.pos.getConfig('pos_license');
  if (!config || !config.hotelId || !config.apiKey) {
    throw new Error('POS not activated');
  }
  return config;
}

// ----------------------------------
// 1. FULL BOOTSTRAP SYNC (HOST ONLY)
// ----------------------------------

export async function syncAll() {

  const config = await getLicenseConfig();

  const posMode = await window.pos.getPosMode();
  if (posMode !== 'HOST') {
    throw new Error('Only HOST can perform full sync');
  }

  const deviceConfig = await window.pos.getConfig('pos_device');

  window.dispatchEvent(new CustomEvent('pos:sync:start'));

  try {

    const res = await axios.get(
      `${import.meta.env.VITE_CENTRAL_API_URL}/pos/sync/bootstrap/${config.hotelId}`,
      {
        headers: {
          'x-api-key': config.apiKey,
          'x-device-id': deviceConfig.deviceId
        }
      }
    );

    const payload = res.data.data;

    // -----------------------------
    // CONFIG / HOTEL META
    // -----------------------------
    await window.pos.saveConfig('hotel_profile', payload.hotel);

    await window.pos.savePrintLayout({
      hotelId: payload.hotel.id,
      hotelName: payload.hotel.name,
      address: payload.hotel.address,
      phone: payload.hotel.phone,
      gstin: payload.hotel.gstNumber,
      currency: payload.hotel.currency,
      header: payload.hotel.printHeader,
      footer: payload.hotel.printFooter
    });

    // -----------------------------
    // MASTER DATA (CLOUD → POS)
    // -----------------------------
    await window.pos.syncFromCloud('FLOORS', payload.layout);
    await window.pos.syncFromCloud('STAFF', payload.staff);

    // ✅ NEW MENU SYSTEM
    await window.pos.syncFromCloud('MENU_V2', payload.menu);

    // ✅ NEW TAX CONFIG SYSTEM
    if (payload.taxConfig) {
      await window.pos.syncFromCloud(
        'HOTEL_TAX_CONFIG',
        payload.taxConfig
      );
    }

    // -----------------------------
    // STORE DISCOUNTS (unchanged)
    // -----------------------------
    await window.pos.saveConfig('discounts', payload.discounts);

    // -----------------------------
    // INITIAL CUSTOMERS SNAPSHOT (unchanged)
    // -----------------------------
    for (const c of payload.customers || []) {
      await window.pos.logChange(
        'CUSTOMER',
        c.id,
        'UPSERT',
        c
      );
    }

    // -----------------------------
    // SYNC STATE
    // -----------------------------
    const now = new Date().toISOString();
    await window.pos.saveConfig('last_full_sync', now);

    window.dispatchEvent(new CustomEvent('pos:sync:done'));

    return true;

  } catch (err) {

    console.error('[SYNC ALL FAILED]', err);

    window.dispatchEvent(new CustomEvent('pos:sync:done'));

    throw err;
  }
}

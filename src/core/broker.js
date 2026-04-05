/**
 * Core broker automation — consolidated trade actions.
 * Combines multiple drawing/UI steps into single operations
 * to minimize round-trips.
 */
import { evaluate, getChartApi, getClient } from '../connection.js';
import { getScreenCoords } from './drawing.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('broker');

/**
 * List all long_position / short_position drawings with their trade details.
 * Combines draw_list + draw_get_properties in one call.
 */
export async function listPositionDrawings() {
  const apiPath = await getChartApi();
  const positions = await evaluate(`
    (function() {
      var api = ${apiPath};
      var all = api.getAllShapes();
      var results = [];
      for (var i = 0; i < all.length; i++) {
        var s = all[i];
        if (s.name !== 'long_position' && s.name !== 'short_position') continue;
        var info = { entity_id: s.id, direction: s.name === 'long_position' ? 'long' : 'short' };
        try {
          var shape = api.getShapeById(s.id);
          if (shape) {
            var pts = shape.getPoints();
            if (pts && pts[0]) {
              info.entry_price = pts[0].price;
              info.entry_time = pts[0].time;
            }
            var props = null;
            try { props = shape.getProperties(); } catch(e) {
              try { props = shape.properties(); } catch(e2) {}
            }
            if (props) {
              info.stop_level = props.stopLevel || 0;
              info.profit_level = props.profitLevel || 0;
              info.quantity = props.quantity || null;
            }
          }
        } catch(e) { info.error = e.message; }
        results.push(info);
      }
      return results;
    })()
  `);
  return {
    success: true,
    count: positions?.length || 0,
    positions: positions || []
  };
}

/**
 * One-shot: open a limit order from a position drawing.
 * Combines: scroll → coords → right-click → wait → click menu item.
 *
 * @param {string} entity_id - Drawing entity ID
 * @param {string} [menu_text='Limit Emir Oluştur'] - Menu item text to click
 */
export async function openLimitOrder({ entity_id, menu_text }) {
  const menuTarget = menu_text || 'Limit Emir Oluştur';
  const apiPath = await getChartApi();

  // Step 1: Get shape info + validate
  const shapeInfo = await evaluate(`
    (function() {
      var api = ${apiPath};
      var shape = api.getShapeById('${entity_id}');
      if (!shape) return { error: 'Shape not found: ${entity_id}' };
      var pts = shape.getPoints();
      if (!pts || !pts[0]) return { error: 'Shape has no points' };
      var allShapes = api.getAllShapes();
      var name = '';
      for (var i = 0; i < allShapes.length; i++) {
        if (allShapes[i].id === '${entity_id}') { name = allShapes[i].name; break; }
      }
      var props = null;
      try { props = shape.getProperties(); } catch(e) {
        try { props = shape.properties(); } catch(e2) {}
      }
      return {
        time: pts[0].time,
        pt2Time: pts[1] ? pts[1].time : pts[0].time + 600,
        name: name,
        entry_price: pts[0].price,
        stop_level: props ? (props.stopLevel || 0) : 0,
        profit_level: props ? (props.profitLevel || 0) : 0,
        quantity: props ? (props.quantity || null) : null
      };
    })()
  `);
  if (shapeInfo?.error) throw new Error(shapeInfo.error);

  const direction = shapeInfo.name === 'long_position' ? 'long' : 'short';

  // Step 2: Scroll chart to center the drawing
  const margin = 7200;
  const from = shapeInfo.time - margin;
  const to = shapeInfo.pt2Time + margin;
  await evaluate(`
    (function() {
      var chart = ${apiPath};
      var m = chart._chartWidget.model();
      var ts = m.timeScale();
      var bars = m.mainSeries().bars();
      var startIdx = bars.firstIndex();
      var endIdx = bars.lastIndex();
      var fromIdx = startIdx, toIdx = endIdx;
      for (var i = startIdx; i <= endIdx; i++) {
        var v = bars.valueAt(i);
        if (v && v[0] >= ${from} && fromIdx === startIdx) fromIdx = i;
        if (v && v[0] <= ${to}) toIdx = i;
      }
      ts.zoomToBarsRange(fromIdx, toIdx);
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  // Step 3: Get screen coordinates
  const coords = await getScreenCoords({ entity_id });
  const x = coords.body_center_x;
  const y = coords.css_y_entry;

  // Step 4: Right-click via CDP
  const c = await getClient();
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'right' });

  // Step 5: Wait for context menu to render
  await new Promise(r => setTimeout(r, 700));

  // Step 6: Find and click the target menu item
  const menuResult = await evaluate(`
    (function() {
      var target = ${JSON.stringify(menuTarget)};
      var selectors = [
        '[role="menuitem"]',
        '[data-name="menu-item"]',
        '[class*="menuItem"]',
        '[class*="menu-item"]',
        '[class*="contextMenu"] [class*="item"]',
        '[class*="context-menu"] [class*="item"]'
      ];
      var allItems = [];
      var seen = {};
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < els.length; i++) {
          var txt = els[i].textContent.trim();
          if (!txt || txt.length > 120 || seen[txt]) continue;
          var rect = els[i].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            seen[txt] = true;
            var item = { text: txt, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
            allItems.push(item);
            if (txt === target || txt.toLowerCase().indexOf(target.toLowerCase()) !== -1) {
              return { found: true, match: item, all_items: allItems };
            }
          }
        }
      }
      return { found: false, all_items: allItems };
    })()
  `);

  if (!menuResult?.found) {
    return {
      success: false,
      step_failed: 'menu_click',
      error: `Menü öğesi bulunamadı: "${menuTarget}"`,
      menu_items: menuResult?.all_items || [],
      direction,
      entry_price: shapeInfo.entry_price,
      clicked_at: { x, y },
      y_method: coords.y_method,
      hint: 'Trading paneli açık mı? ui_open_panel("trading", "open") dene.'
    };
  }

  // Step 7: Click the menu item via CDP
  const mx = menuResult.match.x;
  const my = menuResult.match.y;
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved', x: mx, y: my });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x: mx, y: my, button: 'left', buttons: 1, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased', x: mx, y: my, button: 'left' });

  // Step 8: Wait for order panel to appear
  await new Promise(r => setTimeout(r, 500));

  log.info(`Limit order panel opened: ${direction} @ ${shapeInfo.entry_price}`);

  return {
    success: true,
    direction,
    entry_price: shapeInfo.entry_price,
    stop_level: shapeInfo.stop_level,
    profit_level: shapeInfo.profit_level,
    quantity: shapeInfo.quantity,
    entity_id,
    menu_clicked: menuResult.match.text,
    y_method: coords.y_method,
    hint: 'Emir paneli açıldı. Miktarı kontrol et, ardından trade_submit ile gönder.'
  };
}

/**
 * Click the order submit button.
 * Finds the Pepperstone "place-and-modify-button" and clicks it.
 */
export async function submitOrder() {
  const c = await getClient();

  // Find the submit button
  const btnInfo = await evaluate(`
    (function() {
      // Primary: data-name selector (from Pepperstone panel)
      var btn = document.querySelector('[data-name="place-and-modify-button"]');
      if (btn) {
        var rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            found: true,
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
            text: btn.textContent.trim().substring(0, 80),
            selector: 'data-name'
          };
        }
      }
      // Fallback: look for submit-like buttons in order panel
      var candidates = document.querySelectorAll('button');
      for (var i = 0; i < candidates.length; i++) {
        var text = candidates[i].textContent.trim().toLowerCase();
        if (/(gönder|submit|place|onayla|confirm|buy|sell|al|sat)/i.test(text)) {
          var rect = candidates[i].getBoundingClientRect();
          if (rect.width > 40 && rect.height > 20) {
            return {
              found: true,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
              text: candidates[i].textContent.trim().substring(0, 80),
              selector: 'fallback_text'
            };
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!btnInfo?.found) {
    throw new Error('Emir gönder butonu bulunamadı. Emir paneli açık mı?');
  }

  // Click the button
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved', x: btnInfo.x, y: btnInfo.y });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x: btnInfo.x, y: btnInfo.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased', x: btnInfo.x, y: btnInfo.y, button: 'left' });

  log.info(`Order submitted via ${btnInfo.selector}: "${btnInfo.text}"`);

  return {
    success: true,
    clicked: btnInfo.text,
    selector_used: btnInfo.selector,
    x: btnInfo.x,
    y: btnInfo.y
  };
}

/**
 * Dismiss any confirmation dialog that appears after order submission.
 * Looks for OK/Tamam/Close buttons.
 */
export async function dismissConfirmation() {
  await new Promise(r => setTimeout(r, 300));

  const result = await evaluate(`
    (function() {
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var text = btns[i].textContent.trim();
        if (/^(ok|tamam|kapat|close|anladım|got it)$/i.test(text)) {
          var rect = btns[i].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            btns[i].click();
            return { dismissed: true, text: text };
          }
        }
      }
      return { dismissed: false };
    })()
  `);

  return { success: true, ...result };
}

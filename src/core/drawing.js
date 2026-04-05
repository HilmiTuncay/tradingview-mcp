/**
 * Core drawing logic.
 */
import { evaluate as _evaluate, getChartApi as _getChartApi, getClient, safeString, requireFinite } from '../connection.js';

function _resolve(deps) {
  return { evaluate: deps?.evaluate || _evaluate, getChartApi: deps?.getChartApi || _getChartApi };
}

export async function drawShape({ shape, point, point2, overrides: overridesRaw, text, _deps }) {
  const { evaluate, getChartApi } = _resolve(_deps);
  const overrides = overridesRaw ? (typeof overridesRaw === 'string' ? JSON.parse(overridesRaw) : overridesRaw) : {};
  const apiPath = await getChartApi();
  const overridesStr = JSON.stringify(overrides || {});
  const textStr = text ? JSON.stringify(text) : '""';

  const p1time = requireFinite(point.time, 'point.time');
  const p1price = requireFinite(point.price, 'point.price');

  const before = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);

  if (point2) {
    const p2time = requireFinite(point2.time, 'point2.time');
    const p2price = requireFinite(point2.price, 'point2.price');
    await evaluate(`
      ${apiPath}.createMultipointShape(
        [{ time: ${p1time}, price: ${p1price} }, { time: ${p2time}, price: ${p2price} }],
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  } else {
    await evaluate(`
      ${apiPath}.createShape(
        { time: ${p1time}, price: ${p1price} },
        { shape: ${safeString(shape)}, overrides: ${overridesStr}, text: ${textStr} }
      )
    `);
  }

  await new Promise(r => setTimeout(r, 200));
  const after = await evaluate(`${apiPath}.getAllShapes().map(function(s) { return s.id; })`);
  const newId = (after || []).find(id => !(before || []).includes(id)) || null;
  const result = { entity_id: newId };
  return { success: true, shape, entity_id: result?.entity_id };
}

export async function listDrawings() {
  const apiPath = await getChartApi();
  const shapes = await evaluate(`
    (function() {
      var api = ${apiPath};
      var all = api.getAllShapes();
      return all.map(function(s) { return { id: s.id, name: s.name }; });
    })()
  `);
  return { success: true, count: shapes?.length || 0, shapes: shapes || [] };
}

export async function getProperties({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var props = { entity_id: eid };
      var shape = api.getShapeById(eid);
      if (!shape) return { error: 'Shape not found: ' + eid };
      var methods = [];
      try { for (var key in shape) { if (typeof shape[key] === 'function') methods.push(key); } props.available_methods = methods; } catch(e) {}
      try { var pts = shape.getPoints(); if (pts) props.points = pts; } catch(e) { props.points_error = e.message; }
      try { var ovr = shape.getProperties(); if (ovr) props.properties = ovr; } catch(e) {
        try { var ovr2 = shape.properties(); if (ovr2) props.properties = ovr2; } catch(e2) { props.properties_error = e2.message; }
      }
      try { props.visible = shape.isVisible(); } catch(e) {}
      try { props.locked = shape.isLocked(); } catch(e) {}
      try { props.selectable = shape.isSelectionEnabled(); } catch(e) {}
      try {
        var all = api.getAllShapes();
        for (var i = 0; i < all.length; i++) { if (all[i].id === eid) { props.name = all[i].name; break; } }
      } catch(e) {}
      return props;
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, ...result };
}

export async function removeOne({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      var api = ${apiPath};
      var eid = ${safeString(entity_id)};
      var before = api.getAllShapes();
      var found = false;
      for (var i = 0; i < before.length; i++) { if (before[i].id === eid) { found = true; break; } }
      if (!found) return { removed: false, error: 'Shape not found: ' + eid, available: before.map(function(s) { return s.id; }) };
      api.removeEntity(eid);
      var after = api.getAllShapes();
      var stillExists = false;
      for (var j = 0; j < after.length; j++) { if (after[j].id === eid) { stillExists = true; break; } }
      return { removed: !stillExists, entity_id: eid, remaining_shapes: after.length };
    })()
  `);
  if (result?.error) throw new Error(result.error);
  return { success: true, entity_id: result?.entity_id, removed: result?.removed, remaining_shapes: result?.remaining_shapes };
}

export async function clearAll() {
  const apiPath = await getChartApi();
  await evaluate(`${apiPath}.removeAllShapes()`);
  return { success: true, action: 'all_shapes_removed' };
}

/**
 * Get the screen (CSS pixel) coordinates of a drawing's body.
 * Uses TradingView's internal chart model for reliable price→y conversion.
 * Tries three internal API paths with fallback to chart-center.
 */
export async function getScreenCoords({ entity_id }) {
  const apiPath = await getChartApi();
  const result = await evaluate(`
    (function() {
      try {
        var chart = ${apiPath};
        var cw = chart._chartWidget;
        if (!cw) return { error: '_chartWidget not available' };

        var shape = chart.getShapeById('${entity_id}');
        if (!shape) return { error: 'Shape not found: ${entity_id}' };

        var pts = shape.getPoints();
        var props = shape.getProperties();
        if (!pts || !pts[0]) return { error: 'Shape has no points' };

        var entryPrice = pts[0].price;
        var entryTime  = pts[0].time;
        var pt2Time    = pts[1] ? pts[1].time : entryTime + 600;
        var stopLevel  = (props && props.stopLevel)  || 0;
        var profitLevel= (props && props.profitLevel) || 0;

        // Canvas bounds
        var canvas = document.querySelector('[data-name="pane-canvas"]')
                  || document.querySelector('canvas.chart-markup-canvas')
                  || document.querySelector('canvas');
        if (!canvas) return { error: 'Canvas element not found' };
        var rect = canvas.getBoundingClientRect();

        // X via visible range
        var vis = chart.getVisibleRange();
        var rangeSec = vis.to - vis.from;
        if (rangeSec <= 0) return { error: 'Invalid visible range' };
        var css_x1 = rect.left + ((entryTime - vis.from) / rangeSec) * rect.width;
        var css_x2 = rect.left + ((pt2Time   - vis.from) / rangeSec) * rect.width;
        var body_center_x = (css_x1 + css_x2) / 2;

        // Y via internal price scale — three attempts
        var yRel = null;
        try {
          var ps1 = cw.model().panes()[0].defaultPriceScale();
          if (ps1 && typeof ps1.priceToCoordinate === 'function') {
            var v = ps1.priceToCoordinate(entryPrice);
            if (typeof v === 'number' && !isNaN(v)) yRel = v;
          }
        } catch(e1) {}

        if (yRel === null) {
          try {
            var ps2 = cw.model().mainSeries().priceScale();
            if (ps2 && typeof ps2.priceToCoordinate === 'function') {
              var v2 = ps2.priceToCoordinate(entryPrice);
              if (typeof v2 === 'number' && !isNaN(v2)) yRel = v2;
            }
          } catch(e2) {}
        }

        if (yRel === null) {
          try {
            var pw = cw._paneWidgets && cw._paneWidgets[0];
            if (pw && typeof pw.priceToCoordinate === 'function') {
              var v3 = pw.priceToCoordinate(entryPrice);
              if (typeof v3 === 'number' && !isNaN(v3)) yRel = v3;
            }
          } catch(e3) {}
        }

        // Fallback: vertical center of canvas
        var css_y_entry = (yRel !== null) ? (rect.top + yRel) : (rect.top + rect.height / 2);

        return {
          css_x_entry:      Math.round(css_x1),
          css_x2:           Math.round(css_x2),
          body_center_x:    Math.round(body_center_x),
          css_y_entry:      Math.round(css_y_entry),
          canvas_top:       Math.round(rect.top),
          canvas_left:      Math.round(rect.left),
          canvas_width:     Math.round(rect.width),
          canvas_height:    Math.round(rect.height),
          entry_price:      entryPrice,
          entry_time:       entryTime,
          stop_level:       stopLevel,
          profit_level:     profitLevel,
          vis_from:         vis.from,
          vis_to:           vis.to,
          y_method:         yRel !== null ? 'internal_api' : 'fallback_center',
          dpr:              window.devicePixelRatio || 1
        };
      } catch(e) {
        return { error: e.message };
      }
    })()
  `);
  if (result?.error) throw new Error('getScreenCoords: ' + result.error);
  return { success: true, ...result };
}

/**
 * Right-click on a long_position / short_position drawing body.
 * Scrolls the chart to make the drawing visible first,
 * then fires a CDP right-click at the body centre,
 * and returns any context menu items found in the DOM.
 */
export async function openContextMenu({ entity_id }) {
  const apiPath = await getChartApi();

  // 1. Make sure the drawing is in the visible range
  const shapeInfo = await evaluate(`
    (function() {
      var chart = ${apiPath};
      var shape = chart.getShapeById('${entity_id}');
      if (!shape) return { error: 'Shape not found' };
      var pts = shape.getPoints();
      if (!pts || !pts[0]) return { error: 'No points' };
      var allShapes = chart.getAllShapes();
      var name = '';
      for (var i = 0; i < allShapes.length; i++) {
        if (allShapes[i].id === '${entity_id}') { name = allShapes[i].name; break; }
      }
      return { time: pts[0].time, pt2Time: pts[1] ? pts[1].time : pts[0].time + 600, name: name };
    })()
  `);
  if (shapeInfo?.error) throw new Error(shapeInfo.error);

  // Scroll chart so drawing is centred — use internal timeScale API
  const margin = 7200; // 2 hours
  const from = shapeInfo.time - margin;
  const to   = shapeInfo.pt2Time + margin;
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

  // 2. Get screen coordinates
  const coords = await getScreenCoords({ entity_id });

  const x = coords.body_center_x;
  const y = coords.css_y_entry;

  // 3. Right-click via CDP Input events
  const c = await getClient();
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved',   x, y });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased',x, y, button: 'right' });

  // 4. Wait for context menu to render
  await new Promise(r => setTimeout(r, 700));

  // 5. Collect menu items from DOM
  const menuItems = await evaluate(`
    (function() {
      var selectors = [
        '[role="menuitem"]',
        '[data-name="menu-item"]',
        '[class*="menuItem"]',
        '[class*="menu-item"]',
        '[class*="contextMenu"] [class*="item"]',
        '[class*="context-menu"] [class*="item"]'
      ];
      var seen = {};
      var items = [];
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < els.length; i++) {
          var txt = els[i].textContent.trim();
          if (!txt || txt.length > 120 || seen[txt]) continue;
          var rect = els[i].getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            seen[txt] = true;
            items.push({
              text: txt,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top  + rect.height / 2)
            });
          }
        }
      }
      return items;
    })()
  `);

  return {
    success: true,
    shape_name:  shapeInfo.name,
    clicked_at:  { x, y },
    y_method:    coords.y_method,
    menu_found:  Array.isArray(menuItems) && menuItems.length > 0,
    menu_items:  menuItems || []
  };
}

/**
 * Click a context menu item by partial text match.
 * Call this after draw_context_menu has opened the menu.
 */
export async function clickMenuItem({ text }) {
  const result = await evaluate(`
    (function() {
      var target = ${JSON.stringify(text)};
      var selectors = [
        '[role="menuitem"]',
        '[data-name="menu-item"]',
        '[class*="menuItem"]',
        '[class*="menu-item"]',
        '[class*="contextMenu"] [class*="item"]',
        '[class*="context-menu"] [class*="item"]'
      ];
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        for (var i = 0; i < els.length; i++) {
          var txt = els[i].textContent.trim();
          if (!txt) continue;
          if (txt === target || txt.toLowerCase().indexOf(target.toLowerCase()) !== -1) {
            var rect = els[i].getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return {
                found: true,
                text: txt,
                x: Math.round(rect.left + rect.width  / 2),
                y: Math.round(rect.top  + rect.height / 2)
              };
            }
          }
        }
      }
      return { found: false };
    })()
  `);

  if (!result?.found) {
    throw new Error(`Menü öğesi bulunamadı: "${text}". Context menü açık mı? Önce draw_context_menu çağır.`);
  }

  const c = await getClient();
  await c.Input.dispatchMouseEvent({ type: 'mouseMoved',   x: result.x, y: result.y });
  await c.Input.dispatchMouseEvent({ type: 'mousePressed', x: result.x, y: result.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.Input.dispatchMouseEvent({ type: 'mouseReleased',x: result.x, y: result.y, button: 'left' });

  return { success: true, clicked: result.text, x: result.x, y: result.y };
}

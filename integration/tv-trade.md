# /tv-trade — TradingView'den Pepperstone Emri Aç

TradingView'deki `long_position` veya `short_position` çiziminden Pepperstone'a limit emir ilet.

## Argüman: $ARGUMENTS

Format: `[entity_id]` — verilmezse mevcut çizimler listelenir.

Örnekler:
- `/tv-trade` → mevcut çizimleri listele, kullanıcı seçsin
- `/tv-trade 7VSFb2` → belirli çizimden emir aç

---

## Akış

### Adım 1 — Mevcut Çizimleri Kontrol Et

```
draw_list()
```

Çizim yoksa: kullanıcıya bir `short_position` veya `long_position` çizmesini söyle.

### Adım 2 — Çizim Detaylarını Al

```
draw_get_properties(entity_id)
```

Şunları not al:
- `points[0].price` → entry fiyatı
- `name` → "long_position" mi "short_position" mi?
- `properties.stopLevel` → SL ticks
- `properties.profitLevel` → TP ticks

### Adım 3 — Context Menu'yü Aç (Yeni — Koordinatsız)

```
draw_context_menu(entity_id)
```

Bu araç:
- Çizimi otomatik olarak görünür alana getirir
- TradingView iç API ile koordinatı hesaplar (DPR / panel bağımsız)
- CDP ile sağ tıklar
- DOM'daki menü item'larını döndürür

Dönen `menu_items` listesini kontrol et:
- `menu_found: true` ise menü açılmıştır
- `menu_found: false` ise drawing seçili olmayabilir; screenshot al ve tekrar dene

### Adım 4 — "Limit Emir Oluştur"a Tıkla

```
draw_click_menu_item("Limit Emir Oluştur")
```

Metin eşleşmesi kısmi ve büyük/küçük harf bağımsız — Türkçe TradingView ile çalışır.

### Adım 5 — Emir Panelini Doğrula

Screenshot al:
- Limit sekmesi seçili olmalı
- Giriş fiyatı drawing entry'siyle eşleşmeli
- SL ve TP otomatik doldurulmuş olmalı

```
capture_screenshot(region="full")
```

### Adım 6 — Miktarı Onayla ve Gönder

Kullanıcıya miktarı sor. Onaylarsa:

```
ui_mouse_click(x=submit_button_x, y=submit_button_y)
```

Ya da kullanıcı kendisi tıklar.

---

## Sorun Giderme

### `menu_found: false` — Menü Açılmadı
1. `draw_get_screen_coords(entity_id)` ile koordinatları gör — `y_method` alanını kontrol et
2. `y_method: "fallback_center"` ise TradingView iç API erişilemedi; screenshot alarak drawing'in nerede olduğuna bak
3. `chart_set_visible_range` ile drawing'i tam ortaya al, tekrar dene

### Menüde "Limit Emir Oluştur" Yok
- Pepperstone bağlantısı aktif değil olabilir → Trading panelini aç: `ui_open_panel("trading")`
- Yanlış hesap: Sadece **Razor CFD** hesabı çalışır (Standart hesap değil)

### Koordinat Kaymasa / Tıklama İsabet Etmiyorsa
`draw_get_screen_coords(entity_id)` döndürdüğü değerleri inceleyerek:
- `y_method: "internal_api"` → koordinat güvenilir
- `y_method: "fallback_center"` → TradingView sürümü farklı API yolu kullanıyor olabilir;
  `ui_evaluate` ile iç API'yi prob et

---

## Önemli Notlar

- **Hesap:** Sadece Pepperstone Razor CFD hesabı çalışır
- **Emir tipi:** "Limit Emir Oluştur" = limit emir (fiyata ulaşınca tetiklenir)
- **OCO:** SL ve TP birbirine bağlıdır — biri tetiklenince diğeri iptal
- **Onay penceresi:** Güvenlik için gelir, kapatmadan gönderilmez
- **Yeni araçlar:** `draw_context_menu` + `draw_click_menu_item` koordinat hesabı gerektirmez

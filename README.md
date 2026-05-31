# IST_DRAW — İstinat Duvarı Projelendirme

Ölçüleri girince **ölçekli kesit çizimi** üreten ve **stabilite hesabı** yapan,
tamamen tarayıcıda çalışan (kurulum gerektirmeyen) bir uygulama.

## Özellikler

- **İki duvar tipi:**
  - Konsol (betonarme) istinat duvarı — T/L kesit (taban + şevli gövde)
  - Ağırlık duvarı — trapez kesit
- **Ölçekli SVG kesit çizimi:** kotalar (ölçü çizgileri), beton/dolgu taraması,
  zemin çizgisi, toprak itkisi (Pa) üçgen dağılımı ve **donatı detayı**.
- **Stabilite kontrolleri (1 m duvar uzunluğu için, Rankine yöntemi):**
  - Devrilme güvenliği (M_tutucu / M_devirici)
  - Kayma güvenliği (μ·ΣV / ΣP_yatay)
  - Zemin gerilmesi (σ_max ≤ σ_emniyet) ve dış merkezlik (e ≤ B/6)
- **Donatı ön tasarımı (konsol tip, TS500/EC2 dikdörtgen blok):**
  - Gövde düşey çekme donatısı, ön ökçe alt ve arka topuk üst donatıları
  - Dağıtma/yatay donatı, minimum donatı kontrolü, çap & aralık seçimi
  - Malzeme (fck, fyk), paspayı ve yük katsayısı girdileri
- **Metraj:** beton hacmi (m³), kalıp alanı (m²), donatı ağırlığı (kg) —
  girilen duvar uzunluğu (L) ile toplamlar; donatı oranı (kg/m³).
- **DXF dışa aktarım:** kesit + donatı + kotalar, katmanlı (BETON, DONATI, ZEMIN,
  DOLGU, OLCU, YAZI) AutoCAD R12 DXF olarak. Tüm CAD programlarında açılır.
- Yatay/eğimli dolgu (β), sürşarj yükü (q) ve ayrı taban sürtünme açısı desteği.
- SVG / DXF indirme ve yazdırma.

## Kullanım

Sunucu gerekmez. `index.html` dosyasını bir tarayıcıda açmanız yeterli:

```bash
# veya basit bir yerel sunucu:
python3 -m http.server 8000
# http://localhost:8000 adresini açın
```

Duvar tipini seçin, ölçü ve zemin parametrelerini girin, **Hesapla & Çiz**'e basın.

## Dosya yapısı

```
index.html            Arayüz (girdi formları, çizim ve sonuç panelleri)
css/style.css         Stil
js/engineering.js     Stabilite hesapları (Rankine itki, güvenlik kontrolleri)
js/geometry.js        Ölçülerden kesit geometrisinin üretimi
js/reinforcement.js   Donatı ön tasarımı + metraj (beton/kalıp/çelik)
js/draw.js            Geometri + donatıdan ölçekli SVG teknik çizim
js/dxf.js             Kesit + donatının DXF (AutoCAD) olarak dışa aktarımı
js/app.js             Arayüz mantığı (girdi → hesap → çizim/sonuç)
```

## DWG hakkında

DWG, AutoCAD'in **kapalı (proprietary) ikili** formatıdır ve tarayıcıda saf
JavaScript ile yazılamaz. Uygulama bunun yerine **DXF** üretir; DXF tüm CAD
programlarında (AutoCAD, ZWCAD, BricsCAD, NanoCAD, LibreCAD...) doğrudan açılır.
DWG'ye dönüştürmek için DXF dosyasını CAD'de açıp **Farklı Kaydet → DWG** deyin
(geometri ve katmanlar birebir korunur).

## Yöntem ve varsayımlar

- Rankine aktif toprak itkisi; yatay dolguda `Ka = tan²(45 − φ/2)`,
  eğimli dolguda Rankine eğimli zemin formülü.
- Pasif direnç **ihmal** edilmiştir (güvenli taraf).
- Tüm kuvvet/moment değerleri 1 metre duvar uzunluğu içindir (kN/m, kNm/m).
- Birimler: uzunluk **m**, birim hacim ağırlığı **kN/m³**, gerilme/sürşarj **kPa**.
- **Donatı:** gövde momenti gövde dibinde aktif itki + sürşarjdan; temel momentleri
  taban basıncı dağılımından (gövde yüzlerine göre) hesaplanır. Tasarım momenti =
  yük katsayısı × servis momenti. As, dikdörtgen gerilme bloğuyla bulunur;
  minimum donatı (≈%0,2) ve tek sıra donatı (ξ) sınırı kontrol edilir.
  Kenetlenme/bindirme boyları, kesme/çatlak kontrolü ve detaylandırma **dahil değildir**.
- **Metraj** yaklaşıktır: donatı boyları kanca/ankraj payı varsayımlarıyla,
  kalıp yalnızca düşey/eğik beton yüzeyleri için hesaplanır.

> Bu araç **ön tasarım** amaçlıdır. Nihai proje için yürürlükteki yönetmeliklere
> (TS, Eurocode 7 vb.) ve donatı/betonarme kesit hesaplarına göre kontrol gereklidir.

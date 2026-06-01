# IST_DRAW — İstinat Duvarı Projelendirme

Ölçüleri girince **ölçekli kesit çizimi** üreten ve **stabilite hesabı** yapan,
tamamen tarayıcıda çalışan (kurulum gerektirmeyen) bir uygulama.

## Özellikler

- **Dört duvar tipi:**
  - Konsol (betonarme) istinat duvarı — T kesit (ön ökçe + arka topuk)
  - L tipi konsol — ön ökçesiz (yalnız arka topuk)
  - Payandalı (contrfort) — gövde payandalar arası yatay açıklık yapar; payandalar
    düşey çekmeyi taşır. Yüksek duvarlar için. Plan görünüşünde payanda düzeni.
  - Ağırlık duvarı — trapez kesit
- **Önizleme üzerinden ölçü girişi:** kesitteki sarı ölçü etiketine **tıklayarak**
  değer girilir veya mavi **tutamaçlar sürüklenerek** ölçü canlı değiştirilir;
  çizim ve hesap anında güncellenir.
- **Ölçekli SVG kesit çizimi:** kotalar (ölçü çizgileri), beton/dolgu taraması,
  zemin çizgisi, toprak itkisi (Pa) üçgen dağılımı ve **donatı detayı**.
- **Stabilite kontrolleri (1 m duvar uzunluğu için, Rankine yöntemi):**
  - Devrilme güvenliği (M_tutucu / M_devirici)
  - Kayma güvenliği (μ·ΣV / ΣP_yatay)
  - Zemin gerilmesi (σ_max ≤ σ_emniyet) ve dış merkezlik (e ≤ B/6)
- **Donatı ön tasarımı (konsol tip, TS500/EC2 dikdörtgen blok):**
  - Gövde düşey çekme donatısı, ön ökçe alt ve arka topuk üst donatıları
  - **Temelden çıkan filiz** donatıları (alt kancalı) ve gövde devam donatısı
  - **Yatay donatılar** (gövde iki yüzü + temel boyuna) — kesitte nokta gösterimi
  - **Bindirme (ek) boyu** ℓ₀ = α·ℓb (TS500 kenetlenme); filiz↔devam eki
  - Minimum donatı kontrolü, otomatik çap & aralık seçimi
  - Malzeme (fck, fyk), paspayı, yük katsayısı ve bindirme katsayısı girdileri
- **Metraj + donatı kesim listesi:** beton (m³), kalıp (m²), donatı ağırlığı (kg).
  - Standart **12 m stok** çubuktan kesim planı, **zayiat (fire)** oranı ve
    sipariş edilecek 12 m çubuk adedi; net/fireli ağırlık ve donatı oranı (kg/m³).
- **Donatı açılım (poz) cetveli:** TS uygulama paftası biçiminde 12 poz + çiroz.
  Gösterim `adetØçap/aralık L=boy` (cm), gerçek **90° kancalı** büküm şekilleri
  ve bacak ölçüleri. Poz numaraları (daire balon) kesitle birebir eşleşir.
- **Poz şeması:** 1-2 taban enine (U), 3-4 perde ön düşey + filiz, 5-6 perde arka
  düşey (ana çekme) + filiz, 7-8 perde ön/arka yatay, 9-12 taban boyuna donatılar,
  Ç çiroz. **Çiroz** (yatay/düşey aralık) ve **barbakan** (Ø/aralık) girdileri ve notları.
- Kesitte: ön/arka düşey donatı ayrımı, **yatay donatılar daire** olarak (donatı
  kesiti), çiroz bağ çizgileri ve barbakan simgesi gösterilir.
- **Ayrı detay görünüşleri** (referans uygulama paftası düzeni):
  - **Perde Donatı Detayı** (boy görünüş): yatay donatılar (7/8), düşey donatı
    dağılımı, **barbakan ızgarası** (Ø/aralık) ve A-A kesit çizgisi.
  - **Taban Plağı Donatı Detayı** (plan): boyuna donatılar (9-12, ön/topuk·alt/üst),
    enine donatı dağılımı (1/2 açılım) ve gövde ayak izi.
- **DXF dışa aktarım:** tek paftada **kesit + poz açılım cetveli + Perde Donatı
  Detayı + Taban Plağı Donatı Detayı**, katmanlı (BETON, DONATI, ZEMIN, DOLGU,
  OLCU, YAZI) AutoCAD R12 DXF olarak. Tüm CAD programlarında açılır.
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
js/draw.js            Geometri + donatıdan ölçekli SVG kesit ve poz cetveli
js/interactive.js     Önizleme üzerinden ölçü düzenleme (tıkla-düzenle + sürükleme)
js/details.js         Perde / Taban Plağı donatı detay görünüşleri (SVG primitive)
js/dxf.js             Kesit + cetvel + detayların DXF (AutoCAD) olarak dışa aktarımı
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
